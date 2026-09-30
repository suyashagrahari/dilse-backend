// ─── /admin/outreach — one email to a chosen group of creators ───────────────
//
// Pick an audience (filters, or people ticked by hand), describe what to tell
// them, let the AI write it, edit it, preview it, send a test to yourself, then
// confirm and send. Super-admin only: this puts mail in many real inboxes at
// once, in the company's name.
//
// ── THE ROUTES ARE THE WORKFLOW ─────────────────────────────────────────────
//
//   GET  /outreach/audience     who matches a filter (paged) + the numbers
//   POST /outreach/recipients   the exact list a selection resolves to — what
//                               the confirmation dialog shows
//   POST /outreach/draft        brief → subject + body. Calls the model, never mails.
//   POST /outreach/preview      subject + body → the real email HTML
//   POST /outreach/test         mails the draft to the signed-in super admin only
//   POST /outreach/send         mails the selection. Never calls the model.
//   GET  /outreach/broadcasts   history;  GET /:id  one send, live progress
//   POST /outreach/broadcasts/:id/resume   finish a send a restart interrupted
//   PATCH /outreach/users/:userId/opt-out  keep somebody out of every broadcast
//
// ── WHY SEND DEMANDS THE COUNT BACK ─────────────────────────────────────────
//
// The client sends `expectedCount` — the number the super admin just confirmed.
// The server resolves the selection again and refuses if the numbers differ.
// Between opening the dialog and pressing Send, a user can sign up, verify or
// opt out; without the check "send to these 212" could quietly mail 214. With
// it, what was confirmed is what goes, or nothing does.
//
// ── HOW THE MAIL GOES OUT ───────────────────────────────────────────────────
//
// The Broadcast row is written with every recipient `pending`, the route
// answers straight away, and a loop in this process sends one at a time with a
// small gap (SES allows 14/s; we stay well under). Progress is saved every few
// sends, so the panel's progress bar is reading the database, not a guess. A
// restart mid-send leaves the unsent rows `pending`; the history marks the
// send `interrupted` and offers Resume, which mails only those.

import { Request, Response } from "express";
import mongoose from "mongoose";
import Broadcast, { type IBroadcastRecipient } from "../models/Broadcast";
import User from "../models/User";
import {
  applyFilters,
  describeFilters,
  invalidateAudience,
  isSendable,
  loadAudience,
  parseFilters,
  type AudienceFilters,
  type AudienceRow,
} from "../services/audience.service";
import {
  AiRefusedError,
  AiUnavailableError,
  BRIEF_MAX,
  BROADCAST_BODY_MAX,
  BROADCAST_BODY_MIN,
  BROADCAST_SUBJECT_MAX,
  LENGTHS,
  STRAY_PLACEHOLDER,
  TONES,
  draftBroadcast,
  type Length,
  type Tone,
} from "../services/broadcastAi.service";
import { renderBroadcast, safeCtaUrl, type BroadcastContent } from "../utils/broadcastEmail";
import { sendSesEmail, sesConfigured, SesSendError } from "../services/ses.service";
import { audit } from "../services/adminAudit";
import { templateLabel } from "../config/templateCatalog";
import { env } from "../config/env";

const PAGE_SIZE_MAX = 100;
/** One broadcast's ceiling. Bigger than today's user base; a guard against a runaway, not a quota. */
const MAX_RECIPIENTS = 10_000;
const SEND_GAP_MS = 120;
const SAVE_EVERY = 10;
/** A `sending` row untouched for this long is not sending any more. */
const STALE_MS = 3 * 60_000;

const fail = (res: Response, code: number, error: string, extra: Record<string, unknown> = {}) =>
  res.status(code).json({ success: false, error, ...extra });

const fromEmail = () => env.SES_FROM_EMAIL;

// ─── Selection ───────────────────────────────────────────────────────────────

type Selection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filter"; filters: AudienceFilters; excludeIds: string[] };

function parseSelection(raw: unknown): Selection | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(String).filter((x) => mongoose.isValidObjectId(x)).slice(0, MAX_RECIPIENTS);
  if (s.mode === "ids") {
    const list = [...new Set(ids(s.ids))];
    return list.length ? { mode: "ids", ids: list } : null;
  }
  if (s.mode === "filter") {
    return { mode: "filter", filters: parseFilters((s.filters ?? {}) as Record<string, unknown>), excludeIds: ids(s.excludeIds) };
  }
  return null;
}

/**
 * The people a selection mails, after the unconditional rule (`isSendable`)
 * and de-duplication by address. `skipped` explains anyone who was dropped.
 */
async function resolveSelection(sel: Selection) {
  const all = await loadAudience();
  let picked: AudienceRow[];
  if (sel.mode === "ids") {
    const want = new Set(sel.ids);
    picked = all.filter((r) => want.has(r.userId));
  } else {
    const ex = new Set(sel.excludeIds);
    picked = applyFilters(all, sel.filters).filter((r) => !ex.has(r.userId));
  }

  const skipped = { unverified: 0, inactive: 0, optedOut: 0, duplicate: 0 };
  const seen = new Set<string>();
  const recipients: AudienceRow[] = [];
  for (const r of picked) {
    if (!isSendable(r)) {
      if (r.optedOut) skipped.optedOut++;
      else if (r.status !== "active") skipped.inactive++;
      else skipped.unverified++;
      continue;
    }
    const key = r.email.toLowerCase();
    if (seen.has(key)) { skipped.duplicate++; continue; }
    seen.add(key);
    recipients.push(r);
  }
  return { recipients, skipped, label: sel.mode === "ids" ? `${sel.ids.length} people picked by hand` : describeFilters(sel.filters) };
}

// ─── Content validation ──────────────────────────────────────────────────────

function parseContent(body: Record<string, unknown>): { content: BroadcastContent } | { error: string } {
  const subject = String(body.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  const text = String(body.body ?? "").replace(/\r\n/g, "\n").trim();
  const ctaLabel = String(body.ctaLabel ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  const ctaUrlRaw = String(body.ctaUrl ?? "").trim();
  if (!subject) return { error: "The email needs a subject" };
  if (subject.length > BROADCAST_SUBJECT_MAX) return { error: `Keep the subject under ${BROADCAST_SUBJECT_MAX} characters` };
  if (text.length < BROADCAST_BODY_MIN) return { error: "The email body is too short" };
  if (text.length > BROADCAST_BODY_MAX) return { error: `Keep the email under ${BROADCAST_BODY_MAX} characters` };
  // A blank the model or a person left in would reach every inbox as literal text.
  if (STRAY_PLACEHOLDER.test(`${subject}\n${text}`)) {
    return { error: "The email still has a blank to fill in (like {{link}} or [date]). Only {{firstName}} is filled automatically." };
  }
  const ctaUrl = ctaUrlRaw ? safeCtaUrl(ctaUrlRaw) : "";
  if (ctaUrlRaw && !ctaUrl) return { error: "The button link must be a full http(s) address" };
  if (ctaLabel && !ctaUrl) return { error: "The button needs a link, or clear its label" };
  return { content: { subject, body: text, ctaLabel: ctaUrl ? ctaLabel : "", ctaUrl } };
}

// ─── Audience ────────────────────────────────────────────────────────────────

export const getAudience = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req.query as Record<string, unknown>);
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(10, parseInt(String(req.query.limit ?? "25"), 10) || 25));

    const all = await loadAudience();
    const rows = applyFilters(all, filters);
    const sendable = rows.filter(isSendable);

    const rated = rows.filter((r) => r.avgRating !== null);
    const ratingCounts: Record<string, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    // Counted with the rating chip itself ignored, so the numbers on the star
    // chips say what clicking each one would give instead of collapsing to 0.
    for (const r of applyFilters(all, { ...filters, ratings: [] })) for (const x of r.ratings) ratingCounts[x]++;

    const tplCount = new Map<string, number>();
    for (const r of all) for (const t of r.templates) tplCount.set(t.type, (tplCount.get(t.type) || 0) + 1);

    res.json({
      success: true,
      data: {
        rows: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
        page,
        pages: Math.max(1, Math.ceil(rows.length / limit)),
        label: describeFilters(filters),
        stats: {
          totalUsers: all.length,
          verifiedUsers: all.filter((r) => r.verified).length,
          matching: rows.length,
          sendable: sendable.length,
          withFeedback: rows.filter((r) => r.feedbackCount > 0).length,
          avgRating: rated.length ? Math.round((rated.reduce((a, r) => a + (r.avgRating || 0), 0) / rated.length) * 10) / 10 : null,
          pages: rows.reduce((a, r) => a + r.pages, 0),
          optedOut: all.filter((r) => r.optedOut).length,
        },
        ratingCounts,
        templates: [...tplCount.entries()]
          .map(([type, users]) => ({ type, label: templateLabel(type), users }))
          .sort((a, b) => b.users - a.users),
        sesConfigured: sesConfigured(),
      },
    });
  } catch (error) {
    console.error("Outreach audience error:", error);
    fail(res, 500, "Failed to load the audience");
  }
};

export const getRecipients = async (req: Request, res: Response): Promise<void> => {
  try {
    const sel = parseSelection(req.body?.selection);
    if (!sel) return void fail(res, 400, "Choose who this goes to first");
    const { recipients, skipped, label } = await resolveSelection(sel);
    res.json({
      success: true,
      data: {
        count: recipients.length,
        label,
        skipped,
        tooMany: recipients.length > MAX_RECIPIENTS,
        recipients: recipients.map((r) => ({ userId: r.userId, email: r.email, name: r.name })),
      },
    });
  } catch (error) {
    console.error("Outreach recipients error:", error);
    fail(res, 500, "Failed to resolve the recipients");
  }
};

// ─── Writing ─────────────────────────────────────────────────────────────────

export const draftEmail = async (req: Request, res: Response): Promise<void> => {
  const brief = String(req.body?.brief ?? "").trim();
  if (brief.length < 8) return void fail(res, 400, "Tell the AI a little more about what to say");
  if (brief.length > BRIEF_MAX) return void fail(res, 400, `Keep the brief under ${BRIEF_MAX} characters`);
  const tone = (TONES as readonly string[]).includes(req.body?.tone) ? (req.body.tone as Tone) : "warm";
  const length = (LENGTHS as readonly string[]).includes(req.body?.length) ? (req.body.length as Length) : "medium";
  try {
    const draft = await draftBroadcast({
      brief,
      tone,
      length,
      audienceLabel: String(req.body?.audienceLabel ?? "").slice(0, 300),
      audienceSize: Math.max(0, Number(req.body?.audienceSize) || 0),
    });
    res.json({ success: true, data: draft });
  } catch (error) {
    if (error instanceof AiUnavailableError) return void fail(res, 503, error.message || "The AI is unavailable");
    if (error instanceof AiRefusedError) return void fail(res, 422, error.message || "The AI could not write this");
    console.error("Outreach draft error:", error);
    fail(res, 500, "Failed to write the email");
  }
};

export const previewEmail = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseContent(req.body ?? {});
  // A preview of a half-written email is still useful; only refuse the unrenderable.
  const content: BroadcastContent =
    "content" in parsed
      ? parsed.content
      : { subject: String(req.body?.subject ?? "").slice(0, BROADCAST_SUBJECT_MAX), body: String(req.body?.body ?? "").slice(0, BROADCAST_BODY_MAX), ctaLabel: String(req.body?.ctaLabel ?? ""), ctaUrl: String(req.body?.ctaUrl ?? "") };
  const name = String(req.body?.sampleName ?? "Priya").slice(0, 60);
  const out = renderBroadcast(content, { name }, fromEmail());
  res.json({ success: true, data: { ...out, from: `${env.SES_FROM_NAME} <${fromEmail()}>`, problem: "error" in parsed ? parsed.error : null } });
};

// ─── Sending ─────────────────────────────────────────────────────────────────

function listUnsubscribe(): Record<string, string> {
  return { "List-Unsubscribe": `<mailto:${fromEmail()}?subject=unsubscribe>` };
}

export const sendTest = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseContent(req.body ?? {});
  if ("error" in parsed) return void fail(res, 400, parsed.error);
  const me = await User.findById(req.userId).select("name email").lean();
  if (!me?.email) return void fail(res, 400, "Your account has no email to test with");
  const out = renderBroadcast(parsed.content, { name: me.name || "" }, fromEmail());
  try {
    const r = await sendSesEmail({ to: me.email, subject: `[Test] ${out.subject}`, text: out.text, html: out.html, headers: listUnsubscribe() });
    if (r.outcome === "skipped") return void fail(res, 503, "SES is not configured on this deployment, so nothing was sent.", { code: "SES_NOT_CONFIGURED" });
    res.json({ success: true, data: { to: me.email } });
  } catch (error) {
    if (error instanceof SesSendError) return void fail(res, 502, error.message);
    console.error("Outreach test send error:", error);
    fail(res, 500, "Failed to send the test");
  }
};

/** Mails every `pending` recipient on the row, saving progress as it goes. */
async function runBroadcast(id: string): Promise<void> {
  const doc = await Broadcast.findById(id);
  if (!doc) return;
  const content: BroadcastContent = { subject: doc.subject, body: doc.body, ctaLabel: doc.ctaLabel, ctaUrl: doc.ctaUrl };
  const from = fromEmail();
  let dirty = 0;

  for (const r of doc.recipients as IBroadcastRecipient[]) {
    if (r.status !== "pending") continue;
    const out = renderBroadcast(content, { name: r.name }, from);
    try {
      const result = await sendSesEmail({ to: r.email, subject: out.subject, text: out.text, html: out.html, headers: listUnsubscribe() });
      if (result.outcome === "skipped") {
        r.status = "failed";
        r.error = "SES is not configured";
      } else {
        r.status = "sent";
        r.messageId = result.messageId;
        r.sentAt = new Date();
      }
    } catch (error) {
      r.status = "failed";
      r.error = error instanceof Error ? error.message.slice(0, 300) : "Send failed";
    }
    if (++dirty >= SAVE_EVERY) {
      doc.sentCount = doc.recipients.filter((x) => x.status === "sent").length;
      doc.failedCount = doc.recipients.filter((x) => x.status === "failed").length;
      doc.markModified("recipients");
      await doc.save();
      dirty = 0;
    }
    await new Promise((ok) => setTimeout(ok, SEND_GAP_MS));
  }

  doc.sentCount = doc.recipients.filter((x) => x.status === "sent").length;
  doc.failedCount = doc.recipients.filter((x) => x.status === "failed").length;
  doc.status = doc.failedCount === 0 ? "sent" : doc.sentCount === 0 ? "failed" : "partial";
  doc.finishedAt = new Date();
  doc.markModified("recipients");
  await doc.save();
  invalidateAudience();
}

function startBroadcast(id: string) {
  runBroadcast(id).catch(async (error) => {
    console.error(`[outreach] broadcast ${id} crashed:`, error);
    await Broadcast.updateOne({ _id: id }, { status: "interrupted" }).catch(() => undefined);
  });
}

export const sendBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseContent(req.body ?? {});
    if ("error" in parsed) return void fail(res, 400, parsed.error);
    const sel = parseSelection(req.body?.selection);
    if (!sel) return void fail(res, 400, "Choose who this goes to first");
    if (!sesConfigured()) {
      return void fail(res, 503, "SES is not configured on this deployment, so nothing can be sent.", { code: "SES_NOT_CONFIGURED" });
    }

    // One broadcast at a time. Two overlapping sends are how the same person
    // gets the same email twice.
    const running = await Broadcast.findOne({ status: "sending", updatedAt: { $gt: new Date(Date.now() - STALE_MS) } }).select("_id").lean();
    if (running) return void fail(res, 409, "Another broadcast is still sending. Wait for it to finish.", { runningId: String(running._id) });

    const { recipients, label } = await resolveSelection(sel);
    if (!recipients.length) return void fail(res, 400, "Nobody in this selection can receive email");
    if (recipients.length > MAX_RECIPIENTS) return void fail(res, 400, `One broadcast can reach at most ${MAX_RECIPIENTS} people`);
    const expected = Number(req.body?.expectedCount);
    if (expected !== recipients.length) {
      return void fail(res, 409, `The audience changed from ${expected} to ${recipients.length} while you were confirming. Review the list again.`, {
        code: "COUNT_CHANGED",
        count: recipients.length,
      });
    }

    const doc = await Broadcast.create({
      ...parsed.content,
      brief: String(req.body?.brief ?? "").slice(0, BRIEF_MAX),
      audienceLabel: label,
      filters: sel.mode === "filter" ? { ...sel.filters, excluded: sel.excludeIds.length } : { pickedByHand: sel.ids.length },
      recipients: recipients.map((r) => ({ userId: r.userId, email: r.email, name: r.name, status: "pending" })),
      total: recipients.length,
      status: "sending",
      createdBy: req.userId,
      createdByEmail: req.userEmail || "",
      startedAt: new Date(),
    });

    await audit(req, {
      action: "outreach.broadcast_sent",
      reason: `${recipients.length} recipients · ${label} · “${parsed.content.subject}”`,
    });

    startBroadcast(String(doc._id));
    res.status(202).json({ success: true, data: { id: String(doc._id), total: recipients.length } });
  } catch (error) {
    console.error("Outreach send error:", error);
    fail(res, 500, "Failed to start the broadcast");
  }
};

// ─── History ─────────────────────────────────────────────────────────────────

/** A `sending` row nobody has touched in minutes was cut off by a restart. */
async function markStale() {
  await Broadcast.updateMany({ status: "sending", updatedAt: { $lt: new Date(Date.now() - STALE_MS) } }, { status: "interrupted" });
}

export const listBroadcasts = async (_req: Request, res: Response): Promise<void> => {
  try {
    await markStale();
    const rows = await Broadcast.find({}).select("-recipients -filters").sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Outreach history error:", error);
    fail(res, 500, "Failed to load past broadcasts");
  }
};

export const getBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return void fail(res, 404, "Not found");
    await markStale();
    const doc = await Broadcast.findById(req.params.id).lean();
    if (!doc) return void fail(res, 404, "Not found");
    const pending = doc.recipients.filter((r) => r.status === "pending").length;
    res.json({ success: true, data: { ...doc, pending } });
  } catch (error) {
    console.error("Outreach broadcast error:", error);
    fail(res, 500, "Failed to load the broadcast");
  }
};

export const resumeBroadcast = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return void fail(res, 404, "Not found");
    await markStale();
    // Atomic claim: only an interrupted row flips back to sending, so two
    // clicks cannot start two loops over the same pending list.
    const doc = await Broadcast.findOneAndUpdate({ _id: req.params.id, status: "interrupted" }, { status: "sending" }, { new: true }).select("_id").lean();
    if (!doc) return void fail(res, 409, "Only an interrupted broadcast can be resumed");
    startBroadcast(String(doc._id));
    res.json({ success: true });
  } catch (error) {
    console.error("Outreach resume error:", error);
    fail(res, 500, "Failed to resume");
  }
};

export const setOptOut = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return void fail(res, 404, "User not found");
    const optOut = req.body?.optOut === true;
    const user = await User.findByIdAndUpdate(req.params.userId, { emailOptOut: optOut }, { new: true }).select("email").lean();
    if (!user) return void fail(res, 404, "User not found");
    await audit(req, {
      action: "outreach.opt_out",
      targetUserId: String(req.params.userId),
      targetUserEmail: user.email,
      changes: { emailOptOut: { from: !optOut, to: optOut } },
    });
    invalidateAudience();
    res.json({ success: true, data: { optOut } });
  } catch (error) {
    console.error("Outreach opt-out error:", error);
    fail(res, 500, "Failed to update");
  }
};
