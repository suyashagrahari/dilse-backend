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
//
// A third case sits outside both: once the creator has REPLIED, answering them
// is not unsolicited mail at all, it is a conversation. Neither guard applies —
// see `guardsApply` below.
//
// ── SAME THREAD OR A NEW ONE ────────────────────────────────────────────────
//
// `threadMode` on the send:
//
//   "same" — the message continues the newest conversation about this page. Its
//            subject is DERIVED (`Re: <the thread's subject>`) and whatever the
//            client sent is ignored. That is deliberate: subject is one of the
//            three things holding a thread together, and letting it drift would
//            silently break the one thing this mode promises. The panel shows
//            the derived subject read-only and says why.
//
//   "new"  — opens a fresh conversation with its own subject and no threading
//            headers. Right when the topic genuinely changed; wrong as a habit,
//            because two threads about one page is what the creator sees as two
//            unrelated emails.
//
// Absent, it defaults to "same" when a conversation exists and "new" otherwise,
// so the safe thing happens when nobody chose.

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
  humanizeFieldPath,
  summarizeDraft,
  type DraftSummary,
  type StallVerdict,
} from "../services/draftInsight.service";
import {
  DEFAULT_SENDER_ID,
  listSenderOptions,
  resolveSenderAddress,
} from "../services/replySenders";
import {
  AiRefusedError,
  AiUnavailableError,
  draftNudgeEmail,
} from "../services/draftNudgeAi.service";
import {
  sendSesEmail,
  sesConfigured,
  SesSendError,
  threadReplyToAddress,
} from "../services/ses.service";
import { inboundStatus } from "../services/imapPoller.service";
import {
  replySubject,
  rfcMessageIdFor,
  threadingHeadersFor,
} from "../services/emailThread.service";
import {
  appendMessage,
  latestThreadForPage,
  openThread,
  threadsForPage,
} from "../services/threadStore.service";
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
  /**
   * The account whose admin profile this row opens, or "".
   *
   * Not `userId`: that id can point at a deleted account, and a link built
   * from one 404s — which reads as the panel being broken rather than as the
   * account being gone. See profileLink.service.
   */
  profileUserId: string;
  /** The template's own public route, so the panel can show what they were making. */
  templateSlug: string;
  /** How many of the template's fields are still empty. Exact, not capped. */
  missingCount: number;
  /** The first few of them, in words: "Recipient name", "Photo". */
  missingFields: string[];
}

/** How many missing-field names a row carries. The panel shows 3 and counts the rest. */
const ROW_MISSING_FIELDS = 6;

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
    profileIds: Map<string, string>;
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
    profileUserId: ctx.profileIds.get(pageId) ?? "",
    templateSlug: slugForTemplateType(entry.templateType),
    // Derived from the counts, not from the name list, which the service caps
    // at 40 — a template with 60 empty fields would otherwise report 40.
    missingCount: Math.max(0, ctx.summary.totalFields - ctx.summary.filledFields),
    missingFields: ctx.summary.missingFieldNames
      .slice(0, ROW_MISSING_FIELDS)
      .map(humanizeFieldPath),
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
    /**
     * One person's drafts only.
     *
     * Added for the Drafts tab on the admin user profile. It narrows the Mongo
     * query rather than filtering the fan-out afterwards, so that screen costs
     * 43 tiny indexed lookups instead of reading 43 × 400 documents to throw
     * almost all of them away — and it is immune to the `capped` limitation,
     * because one person never has 400 drafts in a single template.
     */
    const wantUser = String(req.query.userId || "").trim();
    if (wantUser && !mongoose.Types.ObjectId.isValid(wantUser)) {
      res.status(400).json({ success: false, error: "Invalid userId" });
      return;
    }

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
    const where: Record<string, unknown> = { isPublished: false };
    if (wantUser) where.userId = new mongoose.Types.ObjectId(wantUser);

    const perModel = await Promise.all(
      registry.map(async (entry) => {
        const [docs, total] = await Promise.all([
          entry.model
            .find(where)
            .sort({ createdAt: -1 })
            .limit(PER_MODEL_FETCH)
            .lean() as unknown as Promise<Record<string, unknown>[]>,
          entry.model.countDocuments(where),
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

    // ── Whose profile does each row open? ─────────────────────────────────
    //
    // `userMap` is already the answer. It is the result of one
    // `User.find({ _id: { $in: … } })`, so a userId present in it is an account
    // that EXISTS — which is the whole thing a profile link has to be sure of,
    // because one built from a dangling ref opens a 404 that reads as this
    // panel being broken rather than as the account being gone.
    //
    // So no `resolveProfileUserIds` call here, unlike the feedback and
    // conversation panels. Those need it because an unmatched thread has no
    // userId at all and has to be resolved by email; a draft always has one,
    // and a draft whose owner cannot be read is dropped from the list a few
    // lines below anyway — it cannot be written to.
    const profileIds = new Map<string, string>(
      flat.map(({ doc }) => {
        const owner = String(doc.userId ?? "");
        return [String(doc._id), userMap.has(owner) ? owner : ""];
      })
    );

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
          {
            users: userMap, orders: orderMap, nudges: nudgeMap, pricing: pricingMap,
            profileIds, summary, verdict,
          }
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

/**
 * A thread as the panel needs it: messages in order, ids kept out.
 *
 * `rfcMessageIdSource` DOES go through, because "how confident are we that this
 * is really one thread" is something the person reading it should be able to
 * see. Everything else about the plumbing stays server-side.
 */
export function shapeThread(t: {
  _id: unknown;
  threadKey: string;
  subject: string;
  seq: number;
  messageCount: number;
  lastMessageAt: Date;
  lastDirection: string;
  unread: boolean;
  status: string;
  notes?: string;
  messages: {
    direction: string;
    subject: string;
    body: string;
    rawBody?: string;
    at: Date;
    byEmail?: string;
    fromAddress?: string;
    aiAssisted?: boolean;
    rfcMessageIdSource?: string;
    source: string;
    trimmed?: boolean;
  }[];
}) {
  return {
    id: String(t._id),
    threadKey: t.threadKey,
    subject: t.subject,
    seq: t.seq,
    messageCount: t.messageCount,
    lastMessageAt: t.lastMessageAt,
    lastDirection: t.lastDirection,
    unread: t.unread,
    status: t.status,
    notes: t.notes || "",
    messages: (t.messages || []).map((m) => ({
      direction: m.direction,
      subject: m.subject,
      body: m.body,
      // Only when the trim actually removed something — otherwise the panel
      // would offer to expand a message into the identical text.
      rawBody: m.trimmed ? m.rawBody || "" : "",
      at: m.at,
      byEmail: m.byEmail || "",
      // Which of our addresses this went out as. Empty on inbound mail and on
      // anything sent before replies could choose.
      fromAddress: m.fromAddress || "",
      aiAssisted: m.aiAssisted === true,
      confidence: m.rfcMessageIdSource || "",
      source: m.source,
      trimmed: m.trimmed === true,
    })),
  };
}

/** GET /api/admin/drafts/:templateType/:pageId */
export const getDraftDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const loaded = await loadDraft(req, res);
    if (!loaded) return;

    const existing = await DraftNudge.findOne({ pageId: loaded.pageId }).lean();
    const threads = await threadsForPage(loaded.pageId);
    // `loadDraft` answers 404 when the creator's account is gone, so reaching
    // here is proof it exists and the raw id is safe to link.
    const profileUserId = String(loaded.doc.userId ?? "");
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
        // The admin profile this draft's creator opens, or "" when the account
        // is gone. The panel hides the button rather than linking to a 404.
        profileUserId: profileUserId || "",
        templateSlug: slugForTemplateType(loaded.entry.templateType),
        summary: loaded.summary,
        // What they never filled in, in words. Names only — see the note on
        // `missingFieldNames`: an empty field discloses nothing, which is why
        // this list is not filtered the way the filled one is.
        missingFields: loaded.summary.missingFieldNames.map(humanizeFieldPath),
        missingCount: Math.max(
          0,
          loaded.summary.totalFields - loaded.summary.filledFields
        ),
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
        // ── Which address this may go out as ──────────────────────────────
        //
        // The same closed list of ids the conversation panel offers, for the
        // same reason: a follow-up about a payment that failed and one about a
        // half-finished Rakhi card do not want the same return address, and
        // until now this composer sent from `feedback@` with no way to see it
        // beforehand, let alone choose.
        senderOptions: listSenderOptions(),
        defaultSenderId: DEFAULT_SENDER_ID,
        // Where a reply lands, whichever From is chosen. Not selectable and
        // shown next to the picker so the split reads as deliberate.
        replyToAddress: threadReplyToAddress(),
        // Whether a reply will appear here on its own, or has to be pasted.
        // The panel says which, because "paste a reply" is confusing advice
        // when the poller is already collecting them.
        inbound: await inboundStatus(),
        threads: threads.map(shapeThread),
        // What the compose box should default to, worked out here rather than in
        // the panel so the rule lives in one place.
        defaultThreadMode: threads.length > 0 ? "same" : "new",
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
 * `{ subject, body, aiAssisted?, force?, threadMode? }` — sends exactly this
 * text via SES, into an existing conversation or a new one.
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
    /**
     * Which of our verified addresses this leaves from.
     *
     * An ID, never an address — see replySenders.ts: SES sends only from a
     * verified identity, and the value is interpolated into a mail header,
     * where a newline is header injection. An unknown id falls back to the
     * default rather than refusing, because a follow-up that will not send
     * because a dropdown carried something odd is worse than one sent from the
     * address it would have used anyway.
     */
    const fromAddress = resolveSenderAddress(req.body?.senderId);

    const rawMode = String(req.body?.threadMode ?? "").trim().toLowerCase();
    if (rawMode && rawMode !== "same" && rawMode !== "new") {
      res.status(400).json({
        success: false,
        error: `threadMode must be "same" or "new".`,
      });
      return;
    }

    const existingThread = await latestThreadForPage(loaded.pageId);
    // Absent means "do the safe thing": continue a conversation if there is
    // one, because a second unconnected email is the failure this whole feature
    // exists to avoid.
    const threadMode: "same" | "new" =
      rawMode === "same" || rawMode === "new"
        ? (rawMode as "same" | "new")
        : existingThread
          ? "same"
          : "new";

    if (threadMode === "same" && !existingThread) {
      res.status(409).json({
        success: false,
        error: "There is no conversation about this draft yet, so there is nothing to reply into. Send it as a new thread.",
        code: "NO_THREAD",
      });
      return;
    }

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

    // ── When the two guards do NOT apply ──────────────────────────────────
    //
    // Both guards exist to stop UNSOLICITED mail arriving twice. Once the
    // creator has written back, the next message is an answer to a person who
    // asked us something, and refusing to send it — or making a super admin
    // click "send anyway" to reply to their own customer — would be absurd.
    //
    // The test is the thread's own last direction, not whether a thread exists:
    // a second nudge into a conversation the creator never answered is still
    // unsolicited, and still guarded.
    const theyReplied = threadMode === "same" && existingThread?.lastDirection === "inbound";
    const guardsApply = !force && !theyReplied;

    if (guardsApply) {
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

    // ── The subject is derived, not accepted, when replying ───────────────
    //
    // See the header. In "same" mode the outgoing subject is `Re: <the thread's
    // subject>` regardless of what the panel sent, because subject is one of
    // the three things that hold a thread together and a drifting one breaks
    // threading in exactly the clients that need it most.
    const outSubject =
      threadMode === "same" && existingThread
        ? replySubject(existingThread.subject).slice(0, SUBJECT_MAX)
        : subject;

    // ── Threading headers ─────────────────────────────────────────────────
    //
    // Empty strings in "new" mode; `sendSesEmail` drops empty values, so the
    // same call shape covers both modes without a branch at the send site.
    const threading =
      threadMode === "same" && existingThread
        ? threadingHeadersFor(existingThread.messages || [])
        : { inReplyTo: "", references: "", confidence: "none" as const };

    // ── Send BEFORE recording ─────────────────────────────────────────────
    //
    // If SES refuses, nothing is written and the panel still shows the draft as
    // uncontacted, which is true. Recording first would show a follow-up that
    // never left the building.
    let messageId = "";
    try {
      const result = await sendSesEmail({
        to,
        subject: outSubject,
        // The footer is dropped on a reply. It explains why an unexpected email
        // arrived, which is exactly right for first contact and wrong on the
        // third message of a conversation the person is actively having with
        // us — there it reads as a form letter.
        // Every place the address appears reads the CHOSEN one. Sending as
        // support@ while the signature and the footer both say feedback@ is a
        // worse failure than not offering the choice: the recipient sees two
        // different addresses in one email and neither is obviously the right
        // one to answer.
        from: fromAddress,
        text:
          threadMode === "same"
            ? `${body}\n\n—\n${env.SES_FROM_NAME} · ${fromAddress}`
            : `${body}\n\n—\nYou are receiving this because you started a page on SubhSandesh and did not finish it. Reply to this email if you would rather we did not write again.\n${fromAddress}`,
        html: renderDraftNudgeHtml({
          body,
          templateLabel: loaded.entry.label,
          fromEmail: fromAddress,
          profileUrl: profileUrl(),
          isReply: threadMode === "same",
        }),
        // Passing no replyTo let this fall through to the From address, which
        // is on the apex domain GoDaddy serves — so every creator who replied
        // to a follow-up was answering into a mailbox this app cannot read.
        replyTo: threadReplyToAddress(),
        headers: {
          "In-Reply-To": threading.inReplyTo,
          References: threading.references,
        },
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
          subject: outSubject,
          body,
          sentAt: new Date(),
          sentByEmail: (req.userEmail || "").toLowerCase(),
          aiAssisted,
          sesMessageId: messageId,
        },
      },
      { upsert: true }
    );

    // ── Record it in the conversation ─────────────────────────────────────
    //
    // Separately from DraftNudge, and deliberately so: that row is the
    // one-per-page ledger that enforces no-double-contact, and it cannot also
    // be a growing list of messages. See models/EmailThread.ts.
    //
    // Failing here must NOT fail the request. The email has already gone out;
    // reporting a failure would tell a super admin nothing was sent and invite
    // them to send it twice. A missing conversation entry is a display problem,
    // a duplicate unsolicited email is not.
    let thread = threadMode === "same" ? existingThread : null;
    try {
      if (!thread) {
        thread = await openThread(
          {
            kind: "draft",
            userId: String(loaded.doc.userId),
            userName: loaded.user.name || "",
            userEmail: to,
            pageId: loaded.pageId,
            templateType: loaded.entry.templateType,
            templateLabel: loaded.entry.label,
          },
          outSubject
        );
      }
      await appendMessage(thread._id as mongoose.Types.ObjectId, {
        direction: "outbound",
        subject: outSubject,
        body,
        at: new Date(),
        byEmail: req.userEmail || "",
        aiAssisted,
        providerMessageId: messageId,
        // A guess at the header SES wrote, not a fact — see rfcMessageIdFor.
        rfcMessageId: rfcMessageIdFor(messageId, env.SES_REGION),
        rfcMessageIdSource: messageId ? "reconstructed" : "",
        // Distinct from byEmail, which is the admin who typed it. This is the
        // address the creator sees, and the one they will reply to if they
        // ignore the Reply-To.
        fromAddress,
        inReplyTo: threading.inReplyTo,
        references: threading.references ? threading.references.split(/\s+/) : [],
        source: "ses",
      });
    } catch (error) {
      console.error("Recorded the send but failed to write the conversation:", error);
    }

    await audit(req, {
      action: "draft.followup_sent",
      targetUserId: String(loaded.doc.userId),
      targetUserEmail: to,
      targetPageId: loaded.pageId,
      targetTemplateType: loaded.entry.templateType,
      reason: `${loaded.verdict.reason} · as ${fromAddress}${aiAssisted ? " · AI-assisted draft, approved and sent" : " · written by hand"}${force ? " · FORCED past the cooldown" : ""}${threadMode === "same" ? ` · replied in thread ${thread?.threadKey || "?"} (${threading.confidence})` : " · new thread"}${theyReplied ? " · answering their reply, guards not applicable" : ""}`,
    });

    res.json({
      success: true,
      message: `Sent to ${to} from ${fromAddress}`,
      data: {
        sentAt: new Date(),
        messageId,
        subject: outSubject,
        threadMode,
        threadId: thread ? String(thread._id) : "",
        threadConfidence: threading.confidence,
        fromAddress,
      },
    });
  } catch (error) {
    console.error("Send draft email error:", error);
    res.status(500).json({ success: false, error: "Failed to send the email" });
  }
};
