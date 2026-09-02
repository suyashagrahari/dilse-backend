// ─── /admin/threads — the conversation view ─────────────────────────────────
//
// Everything a super admin needs to read what has been said, plus one write:
// pasting in a reply by hand.
//
// ── WHY A MANUAL PASTE EXISTS ──────────────────────────────────────────────
//
// Getting a creator's reply in here automatically needs SES Email Receiving,
// which needs an MX record on a subdomain, which is a DNS change nobody has
// made yet — see the header of `sesInbound.controller.ts` for why it cannot
// simply be the apex.
//
// Without a fallback, the conversation view would show only our own outbound
// messages until that happens, and a half-visible conversation is worse than no
// conversation view: it reads as if the creator never answered.
//
// So a reply can be pasted in. It is stored with `source: "manual"` and shown
// as such, because a message somebody typed in on a creator's behalf must never
// be indistinguishable from one that arrived. It threads correctly too: the
// paste is quote-stripped by the same code as the webhook, and once a real
// `Message-ID` is unavailable the outbound chain falls back to our reconstructed
// ids, which is exactly the state it was already in.

import { Request, Response } from "express";
import mongoose from "mongoose";
import EmailThread from "../models/EmailThread";
import { stripQuotedReply } from "../services/emailThread.service";
import { appendMessage } from "../services/threadStore.service";
import { shapeThread } from "./adminDraft.controller";
import { audit } from "../services/adminAudit";
import { env } from "../config/env";
import {
  ThreadAiRefusedError,
  ThreadAiUnavailableError,
  draftThreadReply,
} from "../services/threadReplyAi.service";
import { replySubject, rfcMessageIdFor, threadingHeadersFor } from "../services/emailThread.service";
import { sendSesEmail, sesConfigured, SesSendError } from "../services/ses.service";
import PageFeedback from "../models/PageFeedback";

const PAGE_SIZE_MAX = 100;
const PASTE_MAX = 20_000;

/**
 * GET /api/admin/threads
 *
 * `?kind=&unread=1&q=&page=&limit=` — the list, without message bodies.
 */
export const getThreads = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));

    const filter: Record<string, unknown> = {};
    const kind = String(req.query.kind || "").trim();
    if (kind === "draft" || kind === "feedback" || kind === "inbound") filter.kind = kind;
    if (String(req.query.unread || "") === "1") filter.unread = true;

    const q = String(req.query.q || "").trim();
    if (q) {
      // Escaped: a super admin pasting an email address with a "+" in it must
      // not have it read as a quantifier.
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(safe, "i");
      filter.$or = [{ userEmail: re }, { userName: re }, { subject: re }];
    }

    const [rows, total, unreadTotal] = await Promise.all([
      EmailThread.find(filter)
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-messages.rawBody -messages.html")
        .lean(),
      EmailThread.countDocuments(filter),
      // Over EVERYTHING, not the filter: a badge that changes when you filter
      // is telling you about your filter, not about your inbox.
      EmailThread.countDocuments({ unread: true }),
    ]);

    res.json({
      success: true,
      data: {
        threads: rows.map((t) => ({
          ...shapeThread(t as never),
          userName: (t as { userName?: string }).userName || "",
          userEmail: (t as { userEmail?: string }).userEmail || "",
          templateLabel: (t as { templateLabel?: string }).templateLabel || "",
          templateType: (t as { templateType?: string }).templateType || "",
          pageId: (t as { pageId?: unknown }).pageId ? String((t as { pageId: unknown }).pageId) : "",
          kind: (t as { kind?: string }).kind || "draft",
        })),
        total,
        unreadTotal,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("Get threads error:", error);
    res.status(500).json({ success: false, error: "Failed to load conversations" });
  }
};

/** GET /api/admin/threads/:id — one conversation, in full, and marks it read. */
export const getThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Not a valid conversation id" });
      return;
    }
    const thread = await EmailThread.findById(id).lean();
    if (!thread) {
      res.status(404).json({ success: false, error: "No such conversation" });
      return;
    }

    // Opening it IS reading it. Done after the read so the response still shows
    // the thread as it was when it arrived in the list.
    if ((thread as { unread?: boolean }).unread) {
      await EmailThread.updateOne({ _id: id }, { $set: { unread: false } });
    }

    res.json({
      success: true,
      data: {
        ...shapeThread(thread as never),
        userName: (thread as { userName?: string }).userName || "",
        userEmail: (thread as { userEmail?: string }).userEmail || "",
        templateLabel: (thread as { templateLabel?: string }).templateLabel || "",
        templateType: (thread as { templateType?: string }).templateType || "",
        pageId: (thread as { pageId?: unknown }).pageId ? String((thread as { pageId: unknown }).pageId) : "",
        kind: (thread as { kind?: string }).kind || "draft",
      },
    });
  } catch (error) {
    console.error("Get thread error:", error);
    res.status(500).json({ success: false, error: "Failed to load the conversation" });
  }
};

/**
 * POST /api/admin/threads/:id/inbound
 *
 * `{ text, at? }` — paste in a reply that arrived in the mailbox. See the header.
 */
export const addInboundManual = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Not a valid conversation id" });
      return;
    }
    const thread = await EmailThread.findById(id).select("subject userEmail userId").lean();
    if (!thread) {
      res.status(404).json({ success: false, error: "No such conversation" });
      return;
    }

    const rawText = String(req.body?.text ?? "").replace(/\r\n/g, "\n").slice(0, PASTE_MAX);
    if (rawText.trim().length < 2) {
      res.status(400).json({ success: false, error: "Paste the reply text first." });
      return;
    }

    const at = req.body?.at ? new Date(String(req.body.at)) : new Date();
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 86_400_000) {
      res.status(400).json({ success: false, error: "That is not a usable date." });
      return;
    }

    const trimmed = stripQuotedReply(rawText);

    await appendMessage(id, {
      direction: "inbound",
      subject: (thread as { subject?: string }).subject || "",
      body: trimmed,
      rawBody: rawText,
      at,
      // No Message-ID: nothing arrived, somebody typed this. The outbound chain
      // therefore keeps anchoring to our reconstructed ids, which is honest.
      rfcMessageId: "",
      rfcMessageIdSource: "",
      source: "manual",
      trimmed: trimmed !== rawText.trim(),
    });

    // A message attributed to a creator that a staff member actually typed is
    // exactly the kind of thing that must be traceable to who typed it.
    await audit(req, {
      action: "thread.inbound_pasted",
      targetUserId: (thread as { userId?: unknown }).userId
        ? String((thread as { userId: unknown }).userId)
        : undefined,
      targetUserEmail: (thread as { userEmail?: string }).userEmail || "",
      reason: `Pasted a reply of ${trimmed.length} characters into conversation ${id}`,
    });

    res.json({ success: true, message: "Added to the conversation" });
  } catch (error) {
    console.error("Add inbound manual error:", error);
    res.status(500).json({ success: false, error: "Failed to add the reply" });
  }
};

/** PATCH /api/admin/threads/:id — `{ status?, notes?, unread? }` */
export const updateThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Not a valid conversation id" });
      return;
    }

    const set: Record<string, unknown> = {};
    const status = String(req.body?.status ?? "").trim();
    if (status) {
      if (status !== "open" && status !== "closed") {
        res.status(400).json({ success: false, error: `status must be "open" or "closed"` });
        return;
      }
      set.status = status;
    }
    if (typeof req.body?.notes === "string") set.notes = req.body.notes.slice(0, 4000);
    if (typeof req.body?.unread === "boolean") set.unread = req.body.unread;

    if (Object.keys(set).length === 0) {
      res.status(400).json({ success: false, error: "Nothing to change." });
      return;
    }

    const updated = await EmailThread.findByIdAndUpdate(id, { $set: set }, { new: true })
      .select("status notes unread")
      .lean();
    if (!updated) {
      res.status(404).json({ success: false, error: "No such conversation" });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Update thread error:", error);
    res.status(500).json({ success: false, error: "Failed to update the conversation" });
  }
};


/**
 * POST /api/admin/threads/:id/draft-reply
 *
 * Writes the next message using the WHOLE conversation. Sends nothing.
 *
 * The route boundary is the same one the other two AI drafters have, and for
 * the same reason: a model that hallucinates a refund would be making a
 * promise on the company's behalf, in writing, to a customer, with nobody
 * having read it. This route never touches the mailer; `reply` never touches
 * OpenAI.
 */
export const draftReplyForThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Not a valid conversation id" });
      return;
    }
    const thread = await EmailThread.findById(id).lean();
    if (!thread) {
      res.status(404).json({ success: false, error: "No such conversation" });
      return;
    }

    const t = thread as unknown as {
      userName?: string; userEmail?: string; subject?: string; kind?: string;
      templateLabel?: string; pageUrl?: string;
      messages: { direction: string; body: string; at: Date }[];
    };

    // A feedback thread has a star rating behind it, and "they gave us 2 stars"
    // changes what a good reply says. Looked up rather than denormalised so it
    // cannot go stale.
    let rating: number | undefined;
    if (t.kind === "feedback" && t.userEmail) {
      const fb = await PageFeedback.findOne({ userEmail: t.userEmail })
        .sort({ createdAt: -1 })
        .select("rating")
        .lean<{ rating?: number }>();
      if (typeof fb?.rating === "number") rating = fb.rating;
    }

    const draft = await draftThreadReply({
      userName: t.userName || "",
      subject: t.subject || "",
      kind: t.kind || "inbound",
      templateLabel: t.templateLabel || undefined,
      rating,
      messages: (t.messages || []).map((m) => ({
        direction: m.direction === "outbound" ? "outbound" : "inbound",
        body: m.body || "",
        at: m.at,
      })),
    });

    res.json({ success: true, data: draft });
  } catch (error) {
    if (error instanceof ThreadAiUnavailableError) {
      res.status(503).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof ThreadAiRefusedError) {
      // Shown verbatim: "it tried to promise a refund" is information a super
      // admin should have, not an internal detail.
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    console.error("Draft thread reply error:", error);
    res.status(500).json({ success: false, error: "Failed to generate a reply" });
  }
};

const REPLY_MAX = 6000;
const REPLY_MIN = 20;

/**
 * POST /api/admin/threads/:id/reply
 *
 * `{ body, aiAssisted? }` — sends the text as the next message in THIS thread.
 *
 * Always in-thread, never a new conversation: this route exists because a
 * conversation is open. Subject is derived from the thread, and the threading
 * headers come from the messages already recorded, so the creator sees one
 * exchange rather than a series of unrelated emails.
 */
export const replyToThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Not a valid conversation id" });
      return;
    }
    const thread = await EmailThread.findById(id).lean();
    if (!thread) {
      res.status(404).json({ success: false, error: "No such conversation" });
      return;
    }

    const t = thread as unknown as {
      _id: mongoose.Types.ObjectId; userEmail?: string; userId?: unknown;
      subject?: string; templateType?: string;
      messages: { direction: string; rfcMessageId?: string; rfcMessageIdSource?: string; references?: string[] }[];
    };

    const to = String(t.userEmail || "").trim();
    if (!to || to.endsWith(".invalid")) {
      res.status(400).json({
        success: false,
        error: "This conversation has no usable email address to reply to.",
      });
      return;
    }

    const body = String(req.body?.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, REPLY_MAX);
    if (body.length < REPLY_MIN) {
      res.status(400).json({ success: false, error: `Write at least ${REPLY_MIN} characters.` });
      return;
    }
    const aiAssisted = req.body?.aiAssisted === true;

    if (!sesConfigured()) {
      res.status(503).json({
        success: false,
        error: "SES is not configured on this deployment, so nothing was sent.",
        code: "SES_NOT_CONFIGURED",
      });
      return;
    }

    const subject = replySubject(t.subject || "").slice(0, 300);
    const threading = threadingHeadersFor(
      (t.messages || []).map((m) => ({
        direction: m.direction === "outbound" ? "outbound" : "inbound",
        rfcMessageId: m.rfcMessageId,
        rfcMessageIdSource: m.rfcMessageIdSource as "received" | "reconstructed" | "" | undefined,
        references: m.references,
      }))
    );

    // Send BEFORE recording. A recorded message that never left the building
    // is worse than an unrecorded one that did: the first is a lie the panel
    // tells, the second is a refresh away from being fixed.
    let messageId = "";
    try {
      const result = await sendSesEmail({
        to,
        subject,
        text: `${body}\n\n—\n${env.SES_FROM_NAME} · ${env.SES_FROM_EMAIL}`,
        from: env.SES_FROM_EMAIL,
        replyTo: env.SES_FROM_EMAIL,
        headers: {
          "In-Reply-To": threading.inReplyTo,
          References: threading.references,
        },
      });
      if (result.outcome === "skipped") {
        res.status(503).json({ success: false, error: "SES is not configured.", code: "SES_NOT_CONFIGURED" });
        return;
      }
      messageId = result.messageId || "";
    } catch (error) {
      if (error instanceof SesSendError) {
        res.status(502).json({ success: false, error: error.message, retryable: error.retryable });
        return;
      }
      throw error;
    }

    await appendMessage(t._id, {
      direction: "outbound",
      subject,
      body,
      byEmail: req.userEmail || "",
      aiAssisted,
      providerMessageId: messageId,
      rfcMessageId: rfcMessageIdFor(messageId, env.SES_REGION),
      rfcMessageIdSource: messageId ? "reconstructed" : "",
      inReplyTo: threading.inReplyTo,
      references: threading.references ? threading.references.split(/\s+/) : [],
      source: "ses",
    });

    await audit(req, {
      action: "thread.reply_sent",
      targetUserId: t.userId ? String(t.userId) : undefined,
      targetUserEmail: to,
      targetTemplateType: t.templateType || undefined,
      reason: `Replied in conversation ${id} (${threading.confidence})${aiAssisted ? " · AI-assisted draft, approved and sent" : " · written by hand"}`,
    });

    res.json({ success: true, message: `Sent to ${to}`, data: { messageId, subject } });
  } catch (error) {
    console.error("Reply to thread error:", error);
    res.status(500).json({ success: false, error: "Failed to send the reply" });
  }
};
