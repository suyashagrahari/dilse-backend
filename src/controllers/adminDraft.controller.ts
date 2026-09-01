// ─── /admin/drafts — every page somebody started and never published ─────────
//
// Lists unpublished pages across all 43 collections, says WHY each one stalled,
// and lets a super admin write to the creator from feedback@subhsandesh.in.
//
// ── THE SHAPE OF THE FAN-OUT ────────────────────────────────────────────────
//
// There is no single "pages" collection — there are 43, one per template — so a
// list sorted by date across all of them cannot be one query. Each collection is
// asked for its newest `PER_MODEL_FETCH` unpublished documents, the results are
// merged, sorted and sliced. Totals come from 43 `countDocuments`, which is
// cheap because `isPublished` is indexed on every model.
//
// The cap is the honest limitation: with more than 400 unpublished drafts in a
// single template, page 2 onwards could miss an older row from a different
// template. The response says so in `capped`, and the fix when it matters is a
// per-template filter, which the panel already offers. Building a materialised
// index of all drafts would be the real answer and is not worth it for a screen
// a super admin opens occasionally.
//
// ── GENERATING AND SENDING ARE TWO ROUTES ───────────────────────────────────
//
// As with the feedback panel: `draft-email` calls the model and returns text,
// `send` takes text and mails it, and no route does both. Here it matters even
// more, because this email is UNSOLICITED — see the header of
// `draftNudgeAi.service.ts`.
//
// ── HOW SENDING IS RATE-LIMITED, AND WHY ────────────────────────────────────
//
// Two guards, both refusals rather than warnings:
//
//   1. One follow-up per draft, ever. Enforced by a unique index on `pageId`.
//   2. One follow-up per person per `USER_COOLDOWN_DAYS`. Somebody with four
//      abandoned drafts is four conversations, but they must not arrive as four
//      emails in one afternoon.
//
// Both are overridable with `force: true`, because a real reason to write twice
// exists and a guard with no override gets worked around by worse means.

import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import DraftNudge from "../models/DraftNudge";
import PaymentOrder from "../models/PaymentOrder";
import { TEMPLATE_REGISTRY, templateByType } from "../services/templateRegistry";
import { getPricingBySlug } from "../config/templatePricing";
import { slugForTemplateType } from "../config/templateSlugs";
import {
  classifyStall,
  daysSince,
  summarizeDraft,
  type DraftSummary,
  type StallVerdict,
} from "../services/draftInsight.service";
import {
  AiRefusedError,
  AiUnavailableError,
  draftNudgeEmail,
} from "../services/draftNudgeAi.service";
import { sendSesEmail, sesConfigured, SesSendError } from "../services/ses.service";
import { renderDraftNudgeHtml } from "../utils/draftNudgeEmail";
import { audit } from "../services/adminAudit";
import { env } from "../config/env";

/** Newest N unpublished rows taken from each of the 43 collections. */
const PER_MODEL_FETCH = 400;
const PAGE_SIZE_MAX = 100;
const USER_COOLDOWN_DAYS = 7;
const SUBJECT_MAX = 200;
const BODY_MAX = 6000;
const BODY_MIN = 40;

interface DraftRow {
  pageId: string;
  templateType: string;
  templateLabel: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  daysIdle: number;
  isPaid: boolean;
  finalPricePaise: number;
  reason: string;
  reasonDetail: string;
  blockedByPrice: boolean;
  completeness: number;
  wordCount: number;
  photoCount: number;
  nudgedAt: string | null;
}

/** The one link the email may carry. See the note where it is used. */
function profileUrl(): string {
  const base = (env.CLIENT_URL || env.APP_URL || "").split(",")[0].trim().replace(/\/$/, "");
  return base ? `${base}/profile` : "";
}

async function buildRow(
  entry: { templateType: string; templateLabel: string },
  doc: Record<string, unknown>,
  ctx: {
    users: Map<string, { name: string; email: string }>;
    orders: Map<string, string[]>;
    nudges: Map<string, Date>;
    pricing: Map<string, { isFree: boolean; finalPricePaise: number }>;
    summary: DraftSummary;
    verdict: StallVerdict;
  }
): Promise<DraftRow> {
  const pageId = String(doc._id);
  const userId = String(doc.userId ?? "");
  const user = ctx.users.get(userId);
  const price = ctx.pricing.get(entry.templateType);
  const nudge = ctx.nudges.get(pageId);

  return {
    pageId,
    templateType: entry.templateType,
    templateLabel: entry.templateLabel,
    userId,
    userName: user?.name || "",
    userEmail: user?.email || "",
    createdAt: String(doc.createdAt ?? ""),
    updatedAt: String(doc.updatedAt ?? ""),
    daysIdle: daysSince(doc.updatedAt as string | undefined),
    isPaid: !price?.isFree,
    finalPricePaise: price?.finalPricePaise ?? 0,
    reason: ctx.verdict.reason,
    reasonDetail: ctx.verdict.detail,
    blockedByPrice: ctx.verdict.blockedByPrice,
    completeness: ctx.summary.completeness,
    wordCount: ctx.summary.wordCount,
    photoCount: ctx.summary.photoCount,
    nudgedAt: nudge ? nudge.toISOString() : null,
  };
}

/**
 * GET /api/admin/drafts?page=&limit=&filter=&templateType=&search=
 *
 * `filter`: all | price-blocked | free-stalled | not-contacted | contacted | idle
 */
export const getDrafts = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const filter = String(req.query.filter || "all");
    const wantType = String(req.query.templateType || "").trim().toLowerCase();
    const search = String(req.query.search || "").trim().toLowerCase();

    const registry = wantType
      ? TEMPLATE_REGISTRY.filter((t) => t.templateType === wantType)
      : TEMPLATE_REGISTRY;

    if (wantType && registry.length === 0) {
      res.status(400).json({ success: false, error: `Unknown template "${wantType}"` });
      return;
    }

    // ── Phase 1: the documents ────────────────────────────────────────────
    //
    // Full documents, because completeness cannot be computed from a projection
    // — it is a count over every field the template defines. They are small
    // (text and S3 URLs; no binary), which is what makes this affordable.
    const perModel = await Promise.all(
      registry.map(async (entry) => {
        const [docs, total] = await Promise.all([
          entry.model
            .find({ isPublished: false })
            .sort({ createdAt: -1 })
            .limit(PER_MODEL_FETCH)
            .lean() as unknown as Promise<Record<string, unknown>[]>,
          entry.model.countDocuments({ isPublished: false }),
        ]);
        return { entry, docs, total, capped: total > PER_MODEL_FETCH };
      })
    );

    const grandTotal = perModel.reduce((n, m) => n + m.total, 0);
    const capped = perModel.some((m) => m.capped);

    // ── Phase 2: everything the rows need, in bulk ────────────────────────
    const flat = perModel.flatMap((m) => m.docs.map((doc) => ({ entry: m.entry, doc })));
    const userIds = [
      ...new Set(flat.map((f) => String(f.doc.userId ?? "")).filter((id) => mongoose.Types.ObjectId.isValid(id))),
    ];
    const pageIds = flat.map((f) => new mongoose.Types.ObjectId(String(f.doc._id)));

    const [users, orders, nudges, pricingEntries] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("name email").lean(),
      PaymentOrder.find({ pageId: { $in: pageIds } }).select("pageId status").lean(),
      DraftNudge.find({ pageId: { $in: pageIds } }).select("pageId sentAt").lean(),
      Promise.all(
        [...new Set(registry.map((r) => r.templateType))].map(async (type) => {
          const p = await getPricingBySlug(slugForTemplateType(type));
          return [type, { isFree: p.isFree, finalPricePaise: p.finalPricePaise }] as const;
        })
      ),
    ]);

    const userMap = new Map(
      (users as Array<{ _id: unknown; name?: string; email?: string }>).map((u) => [
        String(u._id),
        { name: u.name || "", email: u.email || "" },
      ])
    );
    const orderMap = new Map<string, string[]>();
    for (const o of orders as Array<{ pageId: unknown; status?: string }>) {
      const key = String(o.pageId);
      orderMap.set(key, [...(orderMap.get(key) || []), String(o.status || "")]);
    }
    const nudgeMap = new Map(
      (nudges as Array<{ pageId: unknown; sentAt?: Date }>).map((n) => [
        String(n.pageId),
        n.sentAt ? new Date(n.sentAt) : new Date(0),
      ])
    );
    const pricingMap = new Map(pricingEntries);

    // ── Phase 3: classify ─────────────────────────────────────────────────
    let rows: DraftRow[] = await Promise.all(
      flat.map(async ({ entry, doc }) => {
        const summary = summarizeDraft(entry, doc);
        const price = pricingMap.get(entry.templateType);
        const verdict = classifyStall({
          isPaid: !price?.isFree,
          finalPricePaise: price?.finalPricePaise ?? 0,
          orderStatuses: orderMap.get(String(doc._id)) || [],
          summary,
        });
        return buildRow(
          { templateType: entry.templateType, templateLabel: entry.label },
          doc,
          { users: userMap, orders: orderMap, nudges: nudgeMap, pricing: pricingMap, summary, verdict }
        );
      })
    );

    // A draft with no readable owner cannot be written to, and showing it as a
    // row with an empty email is an invitation to click Send and get an error.
    rows = rows.filter((r) => r.userEmail);

    if (search) {
      rows = rows.filter(
        (r) =>
          r.userEmail.toLowerCase().includes(search) ||
          r.userName.toLowerCase().includes(search) ||
          r.templateLabel.toLowerCase().includes(search)
      );
    }

    switch (filter) {
      case "price-blocked": rows = rows.filter((r) => r.blockedByPrice); break;
      case "free-stalled":  rows = rows.filter((r) => !r.blockedByPrice); break;
      case "not-contacted": rows = rows.filter((r) => !r.nudgedAt); break;
      case "contacted":     rows = rows.filter((r) => r.nudgedAt); break;
      case "idle":          rows = rows.filter((r) => r.daysIdle >= 7); break;
      default: break;
    }

    // Newest first, as chosen: the list is "what just happened", not a queue.
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const matched = rows.length;
    const pageRows = rows.slice((page - 1) * limit, (page - 1) * limit + limit);

    // Summary over everything the fan-out saw, not over the filter — the same
    // rule the feedback panel follows, for the same reason.
    const all = rows;
    res.json({
      success: true,
      data: {
        items: pageRows,
        pagination: {
          page,
          limit,
          total: matched,
          totalPages: Math.max(1, Math.ceil(matched / limit)),
        },
        stats: {
          totalDrafts: grandTotal,
          priceBlocked: all.filter((r) => r.blockedByPrice).length,
          freeStalled: all.filter((r) => !r.blockedByPrice).length,
          contacted: all.filter((r) => r.nudgedAt).length,
          capped,
        },
        templates: TEMPLATE_REGISTRY.map((t) => ({
          templateType: t.templateType,
          label: t.label,
        })),
        sesConfigured: sesConfigured(),
      },
    });
  } catch (error) {
    console.error("Get drafts error:", error);
    res.status(500).json({ success: false, error: "Failed to load drafts" });
  }
};

/** Shared loader for the three single-draft routes. Answers 400/404 itself. */
async function loadDraft(req: Request, res: Response) {
  const templateType = String(req.params.templateType || "").trim().toLowerCase();
  const pageId = String(req.params.pageId || "").trim();

  const entry = templateByType(templateType);
  if (!entry) {
    res.status(404).json({ success: false, error: "Unknown template" });
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(pageId)) {
    res.status(400).json({ success: false, error: "Invalid pageId" });
    return null;
  }

  const doc = (await entry.model.findById(pageId).lean()) as Record<string, unknown> | null;
  if (!doc) {
    res.status(404).json({ success: false, error: "Draft not found" });
    return null;
  }
  // Publishing between the list rendering and this call is the common race, and
  // it must not be possible to send "you never published this" to somebody who
  // just did.
  if (doc.isPublished === true) {
    res.status(409).json({
      success: false,
      error: "This page has since been published — nothing to follow up on.",
    });
    return null;
  }

  const user = await User.findById(String(doc.userId ?? "")).select("name email").lean();
  if (!user) {
    res.status(404).json({ success: false, error: "The creator's account no longer exists" });
    return null;
  }

  const price = await getPricingBySlug(slugForTemplateType(templateType));
  const orderStatuses = (
    await PaymentOrder.find({ pageId: new mongoose.Types.ObjectId(pageId) }).select("status").lean()
  ).map((o) => String((o as { status?: string }).status || ""));

  const summary = summarizeDraft(entry, doc);
  const verdict = classifyStall({
    isPaid: !price.isFree,
    finalPricePaise: price.finalPricePaise,
    orderStatuses,
    summary,
  });

  return {
    entry,
    pageId,
    doc,
    user: user as unknown as { name?: string; email?: string },
    summary,
    verdict,
    daysIdle: daysSince(doc.updatedAt as string | undefined),
  };
}

/** GET /api/admin/drafts/:templateType/:pageId */
export const getDraftDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const loaded = await loadDraft(req, res);
    if (!loaded) return;

    const existing = await DraftNudge.findOne({ pageId: loaded.pageId }).lean();
    const recent = await DraftNudge.findOne({
      userId: new mongoose.Types.ObjectId(String(loaded.doc.userId)),
      sentAt: { $gte: new Date(Date.now() - USER_COOLDOWN_DAYS * 86_400_000) },
    })
      .sort({ sentAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        pageId: loaded.pageId,
        templateType: loaded.entry.templateType,
        templateLabel: loaded.entry.label,
        user: { name: loaded.user.name || "", email: loaded.user.email || "" },
        summary: loaded.summary,
        verdict: loaded.verdict,
        daysIdle: loaded.daysIdle,
        alreadyContacted: existing
          ? { sentAt: existing.sentAt, subject: existing.subject, body: existing.body }
          : null,
        cooldown: recent
          ? { until: new Date(new Date(recent.sentAt).getTime() + USER_COOLDOWN_DAYS * 86_400_000) }
          : null,
        sesConfigured: sesConfigured(),
        // Named so the panel can show what the recipient will actually see.
        fromEmail: env.SES_FROM_EMAIL,
      },
    });
  } catch (error) {
    console.error("Get draft detail error:", error);
    res.status(500).json({ success: false, error: "Failed to load the draft" });
  }
};

/**
 * POST /api/admin/drafts/:templateType/:pageId/draft-email
 *
 * Writes an email and returns it. Sends nothing, saves nothing.
 */
export const draftEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const loaded = await loadDraft(req, res);
    if (!loaded) return;

    const draft = await draftNudgeEmail({
      userName: loaded.user.name || "",
      templateLabel: loaded.entry.label,
      verdict: loaded.verdict,
      summary: loaded.summary,
      daysIdle: loaded.daysIdle,
      // The profile, not a deep link into the editor. Six of the 43 editors do
      // not read `?edit=<id>`, so a deep link would silently open an empty
      // builder for them — a dead promise in an email we sent uninvited. The
      // profile lists every creation and is true for all 43.
      resumeUrl: profileUrl(),
    });

    res.json({ success: true, data: draft });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      res.status(503).json({ success: false, error: error.message || "The AI is unavailable" });
      return;
    }
    if (error instanceof AiRefusedError) {
      // Includes the offer-guard rejection, whose message names what it caught —
      // worth showing verbatim, because "it tried to promise a discount" is
      // information a super admin should have.
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    console.error("Draft nudge email error:", error);
    res.status(500).json({ success: false, error: "Failed to generate the email" });
  }
};

/**
 * POST /api/admin/drafts/:templateType/:pageId/send
 *
 * `{ subject, body, aiAssisted?, force? }` — sends exactly this text via SES.
 */
export const sendDraftEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const loaded = await loadDraft(req, res);
    if (!loaded) return;

    const subject = String(req.body?.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, SUBJECT_MAX);
    const body = String(req.body?.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, BODY_MAX);
    const aiAssisted = req.body?.aiAssisted === true;
    const force = req.body?.force === true;

    if (!subject) {
      res.status(400).json({ success: false, error: "The email needs a subject." });
      return;
    }
    if (body.length < BODY_MIN) {
      res.status(400).json({
        success: false,
        error: `Write at least ${BODY_MIN} characters before sending.`,
      });
      return;
    }
    const to = (loaded.user.email || "").trim();
    if (!to) {
      res.status(400).json({ success: false, error: "This creator has no email address." });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(String(loaded.doc.userId));

    if (!force) {
      const already = await DraftNudge.findOne({ pageId: loaded.pageId }).lean();
      if (already) {
        res.status(409).json({
          success: false,
          error: `Already followed up on this draft on ${new Date(already.sentAt).toDateString()}. Send again only if you mean to.`,
          code: "ALREADY_CONTACTED",
        });
        return;
      }
      const recent = await DraftNudge.findOne({
        userId: userObjectId,
        sentAt: { $gte: new Date(Date.now() - USER_COOLDOWN_DAYS * 86_400_000) },
      })
        .sort({ sentAt: -1 })
        .lean();
      if (recent) {
        res.status(409).json({
          success: false,
          error: `This person was emailed about another draft on ${new Date(recent.sentAt).toDateString()}. Wait out the ${USER_COOLDOWN_DAYS}-day gap, or send anyway.`,
          code: "USER_COOLDOWN",
        });
        return;
      }
    }

    // ── Send BEFORE recording ─────────────────────────────────────────────
    //
    // If SES refuses, nothing is written and the panel still shows the draft as
    // uncontacted, which is true. Recording first would show a follow-up that
    // never left the building.
    let messageId = "";
    try {
      const result = await sendSesEmail({
        to,
        subject,
        text: `${body}\n\n—\nYou are receiving this because you started a page on SubhSandesh and did not finish it. Reply to this email if you would rather we did not write again.\n${env.SES_FROM_EMAIL}`,
        html: renderDraftNudgeHtml({
          body,
          templateLabel: loaded.entry.label,
          fromEmail: env.SES_FROM_EMAIL,
          profileUrl: profileUrl(),
        }),
      });
      if (result.outcome === "skipped") {
        res.status(503).json({
          success: false,
          error:
            "SES is not configured on this deployment, so nothing was sent. Set SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY.",
          code: "SES_NOT_CONFIGURED",
        });
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

    // `updateOne` with upsert rather than `create`: with `force` the unique index
    // on pageId would otherwise reject the second send AFTER the email had
    // already gone out, leaving a sent message with no record of it.
    await DraftNudge.updateOne(
      { pageId: loaded.pageId },
      {
        $set: {
          userId: userObjectId,
          userName: loaded.user.name || "",
          userEmail: to.toLowerCase(),
          templateType: loaded.entry.templateType,
          templateLabel: loaded.entry.label,
          stallReason: loaded.verdict.reason,
          completeness: loaded.summary.completeness,
          subject,
          body,
          sentAt: new Date(),
          sentByEmail: (req.userEmail || "").toLowerCase(),
          aiAssisted,
          sesMessageId: messageId,
        },
      },
      { upsert: true }
    );

    await audit(req, {
      action: "draft.followup_sent",
      targetUserId: String(loaded.doc.userId),
      targetUserEmail: to,
      targetPageId: loaded.pageId,
      targetTemplateType: loaded.entry.templateType,
      reason: `${loaded.verdict.reason}${aiAssisted ? " · AI-assisted draft, approved and sent" : " · written by hand"}${force ? " · FORCED past the cooldown" : ""}`,
    });

    res.json({
      success: true,
      message: `Sent to ${to}`,
      data: { sentAt: new Date(), messageId },
    });
  } catch (error) {
    console.error("Send draft email error:", error);
    res.status(500).json({ success: false, error: "Failed to send the email" });
  }
};
