// ─── The influencer chat: /admin/super/influencers/:userId/mail ──────────────
//
// Three routes, split on the same boundary as every other AI drafter here:
//
//   GET  /mail        the conversation, plus what this deployment can do —
//                     can it send, will replies arrive on their own, is the AI
//                     available. The panel shows each "no" as a visible
//                     status, never as a button that fails on press.
//   POST /mail/draft  { intent?, note? } → { subject, body, reading, intent }.
//                     Calls the model. Never touches the mailer.
//   POST /mail/send   { subject, body, aiAssisted?, intent? } → sends as
//                     influencer-support@, appends to the thread (opening it on
//                     first send), audits. Never touches the model.
//
// Pasting a reply by hand and closing/reopening reuse the generic thread
// routes (`/admin/threads/:id/inbound`, `PATCH /admin/threads/:id`) — an
// influencer thread is an ordinary EmailThread.

import { Request, Response } from "express";
import mongoose from "mongoose";
import EmailThread, { type IEmailThread } from "../models/EmailThread";
import User from "../models/User";
import { env } from "../config/env";
import { audit } from "../services/adminAudit";
import { shapeThread } from "./adminDraft.controller";
import { buildInfluencerDashboard, getInfluencerSettings } from "../services/influencer.service";
import { appendMessage, openThread } from "../services/threadStore.service";
import { baseSubject, replySubject, threadingHeadersFor } from "../services/emailThread.service";
import { SesSendError } from "../services/ses.service";
import { influencerInboundStatus } from "../services/imapPoller.service";
import {
  InfluencerMailNotConfiguredError,
  influencerFromAddress,
  influencerReplyToAddress,
  influencerSendMode,
  newThreadToken,
  sendInfluencerMail,
} from "../services/influencerMail.service";
import {
  INFLUENCER_INTENTS,
  ThreadAiRefusedError,
  ThreadAiUnavailableError,
  buildInfluencerFacts,
  detectLanguage,
  draftInfluencerMailWithRetry,
  resolveIntent,
} from "../services/influencerMailAi.service";

const SUBJECT_MAX = 200;
const BODY_MIN = 20;
const BODY_MAX = 6000;

function userIdParam(req: Request, res: Response): string | null {
  const id = String(req.params.userId || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: "Not a valid user id" });
    return null;
  }
  return id;
}

/** The influencer's conversation — the newest one, if several exist. */
async function threadFor(userId: string): Promise<IEmailThread | null> {
  return EmailThread.findOne({ kind: "influencer", userId: new mongoose.Types.ObjectId(userId) })
    .sort({ seq: -1 })
    .lean<IEmailThread>();
}

function shape(t: IEmailThread | null) {
  if (!t) return null;
  return {
    ...shapeThread(t as never),
    kind: "influencer",
    userEmail: t.userEmail,
    userName: t.userName,
    threadToken: t.threadToken || "",
  };
}

/** GET /admin/super/influencers/:userId/mail */
export const getInfluencerMail = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = userIdParam(req, res);
    if (!id) return;
    const user = await User.findById(id).select("name email influencer").lean();
    if (!user?.influencer) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }

    const thread = await threadFor(id);
    // Opening the chat is reading it.
    if (thread?.unread) await EmailThread.updateOne({ _id: thread._id }, { $set: { unread: false } });

    const inbound = await influencerInboundStatus();
    const messages = thread?.messages || [];

    res.json({
      success: true,
      data: {
        thread: shape(thread ? { ...thread, unread: false } as IEmailThread : null),
        to: user.email,
        suggestedIntent: resolveIntent(undefined, messages),
        intents: INFLUENCER_INTENTS,
        status: {
          sendMode: influencerSendMode(),
          fromAddress: influencerFromAddress(),
          replyToAddress: influencerReplyToAddress(),
          aiConfigured: !!env.OPENAI_API_KEY,
          inbound,
        },
      },
    });
  } catch (error) {
    console.error("Get influencer mail error:", error);
    res.status(500).json({ success: false, error: "Failed to load the conversation" });
  }
};

/** POST /admin/super/influencers/:userId/mail/draft — { intent?, note? } */
export const draftInfluencerMailHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = userIdParam(req, res);
    if (!id) return;

    const [dash, settings, thread] = await Promise.all([
      buildInfluencerDashboard(id, { days: 30 }),
      getInfluencerSettings(),
      threadFor(id),
    ]);
    if (!dash) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }

    const messages = (thread?.messages || []).map((m) => ({
      direction: m.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
      body: m.body || "",
      at: m.at,
    }));
    const requested = typeof req.body?.intent === "string" ? req.body.intent : undefined;
    const intent = resolveIntent(requested, messages);

    const draft = await draftInfluencerMailWithRetry({
      intent,
      facts: buildInfluencerFacts(dash, settings.attributionDays),
      threadSubject: thread?.subject || "",
      messages,
      language: detectLanguage(messages),
      adminNote: typeof req.body?.note === "string" ? req.body.note : "",
    });

    // Once a conversation exists, every email continues it under the same
    // subject — that is what keeps it ONE thread in their inbox too.
    const subject = thread?.subject ? replySubject(thread.subject) : draft.subject;

    res.json({ success: true, data: { ...draft, subject } });
  } catch (error) {
    if (error instanceof ThreadAiUnavailableError) {
      res.status(503).json({ success: false, error: error.message, code: "AI_UNAVAILABLE" });
      return;
    }
    if (error instanceof ThreadAiRefusedError) {
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    console.error("Draft influencer mail error:", error);
    res.status(500).json({ success: false, error: "Failed to generate an email" });
  }
};

/** POST /admin/super/influencers/:userId/mail/send — { subject, body, aiAssisted?, intent? } */
export const sendInfluencerMailHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = userIdParam(req, res);
    if (!id) return;
    const user = await User.findById(id).select("name email influencer").lean();
    if (!user?.influencer) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }
    const to = String(user.email || "").trim().toLowerCase();
    if (!to || to.endsWith(".invalid")) {
      res.status(400).json({ success: false, error: "This influencer has no usable email address." });
      return;
    }

    const subject = String(req.body?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, SUBJECT_MAX);
    const body = String(req.body?.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, BODY_MAX);
    if (!baseSubject(subject)) {
      res.status(400).json({ success: false, error: "Add a subject." });
      return;
    }
    if (body.length < BODY_MIN) {
      res.status(400).json({ success: false, error: `Write at least ${BODY_MIN} characters.` });
      return;
    }
    const aiAssisted = req.body?.aiAssisted === true;
    const intent = typeof req.body?.intent === "string" ? req.body.intent.slice(0, 40) : "";

    if (influencerSendMode() === "off") {
      res.status(503).json({
        success: false,
        error: "SES is not configured on this deployment, so nothing was sent.",
        code: "SES_NOT_CONFIGURED",
      });
      return;
    }

    const existing = await threadFor(id);
    const threading = threadingHeadersFor(
      (existing?.messages || []).map((m) => ({
        direction: m.direction,
        rfcMessageId: m.rfcMessageId,
        rfcMessageIdSource: m.rfcMessageIdSource,
        references: m.references,
      }))
    );
    const token = existing?.threadToken || newThreadToken();

    let sent;
    try {
      sent = await sendInfluencerMail({
        to,
        subject,
        body,
        token,
        inReplyTo: threading.inReplyTo,
        references: threading.references,
      });
    } catch (error) {
      if (error instanceof InfluencerMailNotConfiguredError) {
        res.status(503).json({ success: false, error: error.message, code: "SES_NOT_CONFIGURED" });
        return;
      }
      if (error instanceof SesSendError) {
        res.status(502).json({ success: false, error: error.message, retryable: error.retryable });
        return;
      }
      throw error;
    }

    // Opened only AFTER the send succeeded, so a refused first email leaves
    // no empty conversation behind.
    let threadId = existing?._id as mongoose.Types.ObjectId | undefined;
    if (!threadId) {
      const opened = await openThread(
        { kind: "influencer", userId: id, userName: user.name || "", userEmail: to, threadToken: token },
        subject
      );
      threadId = opened._id as mongoose.Types.ObjectId;
    } else if (existing && !existing.threadToken) {
      await EmailThread.updateOne({ _id: threadId }, { $set: { threadToken: token } });
    }

    await appendMessage(threadId, {
      direction: "outbound",
      subject,
      body,
      html: "",
      byEmail: req.userEmail || "",
      fromAddress: sent.fromAddress,
      aiAssisted,
      providerMessageId: sent.providerMessageId,
      rfcMessageId: sent.rfcMessageId,
      rfcMessageIdSource: sent.rfcMessageId ? "reconstructed" : "",
      inReplyTo: threading.inReplyTo,
      references: threading.references ? threading.references.split(/\s+/) : [],
      source: "ses",
    });

    await audit(req, {
      action: "influencer.mail_sent",
      targetUserId: id,
      targetUserEmail: to,
      reason: `Influencer email "${subject.slice(0, 80)}"${intent ? ` [${intent}]` : ""} (${threading.confidence})${aiAssisted ? " · AI-assisted draft, approved and sent" : " · written by hand"}${sent.via === "stub" ? " · STUB transport, not delivered" : ""}`,
    });

    const thread = await threadFor(id);
    res.json({ success: true, message: `Sent to ${to}`, data: { thread: shape(thread), via: sent.via } });
  } catch (error) {
    console.error("Send influencer mail error:", error);
    res.status(500).json({ success: false, error: "Failed to send the email" });
  }
};
