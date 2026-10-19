// ─── /admin/super/prospects — outreach to creators who have not joined ───────
//
//   GET    /prospects               list + counts + what this deployment can do
//   POST   /prospects               add one (duplicate / already-influencer check)
//   POST   /prospects/import        bulk paste, "name, email, instagram[, note]"
//   GET    /prospects/:id           one prospect + its conversation + its jobs
//   PATCH  /prospects/:id           edit details, or mark not interested / reopen
//   POST   /prospects/status        bulk "not interested"
//   POST   /prospects/delete        soft delete (suppression survives)
//   POST   /prospects/draft         AI: 1 → personal, 2+ → template; two angles. Sends nothing.
//   POST   /prospects/preview       render for one recipient + the spam check + the plan
//   POST   /prospects/send          queue one job per recipient. Never calls AI.
//
// draft / preview / send take an optional `intent` (initial | followup |
// fresh | reply) and `allowNotInterested`; see planSelection.
//   POST   /prospects/cancel        cancel queued jobs
//
// Plus the public unsubscribe (GET page + POST one-click), mounted outside
// the admin router — see routes/prospectPublic.routes.ts.

import { Request, Response } from "express";
import mongoose from "mongoose";
import InfluencerProspect, { type IInfluencerProspect, PROSPECT_STATUSES } from "../models/InfluencerProspect";
import ProspectMailJob, { type FirstTouch, type JobKind, type OutreachStyle } from "../models/ProspectMailJob";
import EmailThread, { type IEmailThread } from "../models/EmailThread";
import { env } from "../config/env";
import { audit } from "../services/adminAudit";
import { shapeThread } from "./adminDraft.controller";
import { baseSubject, replySubject } from "../services/emailThread.service";
import { influencerFromAddress, influencerReplyToAddress, influencerSendMode } from "../services/influencerMail.service";
import {
  canEmailProspect,
  connectSender,
  connectSignature,
  envSendWindow,
  estimateFinish,
  inboxCheck,
  lintOutreach,
  parseProspectCsv,
  parseProspectInput,
  planSelection,
  priorFollowupsOf,
  RECENT_SEND_HOURS,
  personalDress,
  personalSender,
  personalSignature,
  personalWriterName,
  prospectMailHtml,
  prospectMailText,
  renderMergeFields,
  touchFor,
  unsubscribeUrl,
  type ContactVerdict,
} from "../services/prospectMail.service";
import {
  addProspect,
  cancelQueued,
  enqueueJobs,
  findDuplicates,
  programmeFacts,
  setSuppressed,
  unsubscribeByToken,
} from "../services/prospect.service";
import { kickProspectQueue, pacingNow, personalSenderStatus, prospectQueueHealth, quietLaneStatus } from "../services/prospectQueue.service";
import { readProofChoice } from "./outreachProof.controller";
import { personalEmailParts, proofAllowedNumbers, screenshotAlt, SOURCE_NAME } from "../services/outreachProof.service";
import {
  ThreadAiRefusedError,
  ThreadAiUnavailableError,
  draftProspectAlternatives,
  type ProspectDraftContext,
} from "../services/prospectAi.service";

const MAX_SELECTION = 200;
const SUBJECT_MAX = 200;
const BODY_MAX = 6000;

const oid = (v: unknown) => (mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

function idList(raw: unknown): mongoose.Types.ObjectId[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SELECTION) return null;
  const out = new Map<string, mongoose.Types.ObjectId>();
  for (const v of raw) {
    const o = oid(v);
    if (!o) return null;
    out.set(String(o), o);
  }
  return [...out.values()];
}

function shapeProspect(
  p: IInfluencerProspect,
  extra: { thread?: { unread: boolean; messageCount: number; lastDirection: string } | null; job?: unknown; verdict?: ContactVerdict }
) {
  return {
    id: String(p._id),
    name: p.name,
    email: p.email,
    instagram: p.instagram || "",
    note: p.note || "",
    niche: p.niche || "",
    followerRange: p.followerRange || "",
    status: p.status,
    source: p.source,
    contactCount: p.contactCount || 0,
    lastContactedAt: p.lastContactedAt || null,
    initialSentAt: p.initialSentAt || null,
    followUpSentAt: p.followUpSentAt || null,
    followUpCount: priorFollowupsOf(p),
    lastReplyAt: p.lastReplyAt || null,
    joinedUserId: p.joinedUserId ? String(p.joinedUserId) : null,
    createdAt: p.createdAt,
    threadId: p.threadId ? String(p.threadId) : null,
    outreachStyle: p.outreachStyle || "",
    firstTouch: p.firstTouch || (p.initialSentAt ? "pitch" : ""),
    unread: !!extra.thread?.unread,
    messages: extra.thread?.messageCount || 0,
    lastDirection: extra.thread?.lastDirection || "",
    job: extra.job || null,
    due: extra.verdict || null,
  };
}

async function deploymentStatus() {
  const [pacing, queued, facts] = await Promise.all([
    pacingNow(),
    ProspectMailJob.countDocuments({ state: { $in: ["queued", "sending"] } }),
    programmeFacts(),
  ]);
  const health = prospectQueueHealth();
  const person = personalSender();
  const blocked = personalSenderStatus();
  const w = envSendWindow();
  return {
    sendMode: influencerSendMode(),
    fromAddress: influencerFromAddress(),
    fromName: env.PROSPECT_FROM_NAME,
    replyToAddress: influencerReplyToAddress(),
    defaultStyle: "personal" as OutreachStyle,
    /** A personal first email is a Connect note unless the admin picks Pitch. */
    defaultTouch: "connect" as FirstTouch,
    /** A send to someone emailed less than this many hours ago is warned about. */
    recentHours: RECENT_SEND_HOURS,
    /** Above this many recipients at once the dialog suggests spreading out. */
    bulkWarnAbove: 10,
    recommendedPerDay: 15,
    personal: {
      fromAddress: person.fromAddress,
      fromName: person.fromName,
      replyToAddress: person.replyToAddress,
      blocked: blocked ? { message: blocked.message, at: blocked.at } : null,
      /** The signature exactly as it is appended ("Yash\nSubhSandesh"). */
      signature: personalSignature(),
      /** Who writes in the first person ("Yash"); "" for a team signature. */
      writer: personalWriterName(),
      /** Connect notes: the From name (PROSPECT_CONNECT_FROM_NAME, else the normal one) and signature. */
      connectFromName: connectSender().fromName,
      connectSignature: connectSignature(),
    },
    /** The quiet SES lane prospect mail goes out on (no open tracking). */
    quietLane: quietLaneStatus(),
    sendWindow: w.startHour === w.endHour ? null : { startHour: w.startHour, endHour: w.endHour, tzOffsetMinutes: w.tzOffsetMinutes },
    maxGapSeconds: Math.max(env.PROSPECT_MIN_GAP_SECONDS, env.PROSPECT_MAX_GAP_SECONDS),
    aiConfigured: !!env.OPENAI_API_KEY,
    commissionPercent: facts.commissionPercent,
    attributionDays: facts.attributionDays,
    joinUrl: facts.joinUrl,
    followUpDays: env.PROSPECT_FOLLOWUP_DAYS,
    dailyCap: pacing.cap,
    instant: env.PROSPECT_INSTANT,
    sentLast24h: pacing.sentLast24h,
    minGapSeconds: env.PROSPECT_MIN_GAP_SECONDS,
    queued,
    queueFinishEstimate: queued ? estimateFinish(queued, pacing) : null,
    lastError: health.lastError,
  };
}

/** GET /admin/super/prospects */
export const listProspects = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await InfluencerProspect.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(2000).lean<IInfluencerProspect[]>();
    const ids = rows.map((r) => r._id);
    const threadIds = rows.map((r) => r.threadId).filter(Boolean);
    const [threads, jobs, status] = await Promise.all([
      threadIds.length
        ? EmailThread.find({ _id: { $in: threadIds } }).select("unread messageCount lastDirection").lean()
        : Promise.resolve([]),
      ProspectMailJob.aggregate([
        { $match: { prospectId: { $in: ids } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$prospectId", state: { $first: "$state" }, kind: { $first: "$kind" }, touch: { $first: "$touch" }, error: { $first: "$error" }, sentAt: { $first: "$sentAt" }, createdAt: { $first: "$createdAt" } } },
      ]),
      deploymentStatus(),
    ]);
    const T = new Map(threads.map((t) => [String(t._id), t]));
    const J = new Map(jobs.map((j) => [String(j._id), { state: j.state, kind: j.kind, touch: j.touch || "pitch", error: j.error || "", sentAt: j.sentAt || null, createdAt: j.createdAt }]));
    const now = new Date();
    const prospects = rows.map((p) =>
      shapeProspect(p, {
        thread: p.threadId ? (T.get(String(p.threadId)) as never) : null,
        job: J.get(String(p._id)),
        verdict: canEmailProspect(p, now),
      })
    );
    const counts: Record<string, number> = { all: prospects.length };
    for (const s of PROSPECT_STATUSES) counts[s] = prospects.filter((p) => p.status === s).length;
    counts.unread = prospects.filter((p) => p.unread).length;
    res.json({ success: true, data: { prospects, counts, status } });
  } catch (error) {
    console.error("List prospects error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to load prospects" });
  }
};

/** POST /admin/super/prospects — { name, email, instagram?, note?, niche?, followerRange? } */
export const createProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parseProspectInput(req.body || {});
    if (!parsed.ok) {
      res.status(400).json({ success: false, field: parsed.field, error: parsed.error });
      return;
    }
    const r = await addProspect(parsed.value, { userId: req.userId, email: req.userEmail });
    if (!r.ok) {
      res.status(409).json({ success: false, code: r.code, error: r.message, duplicate: r.dup });
      return;
    }
    await audit(req, { action: "prospect.add", reason: `Added prospect ${r.prospect.name}${r.restored ? " (restored)" : ""}` });
    res.status(201).json({ success: true, data: shapeProspect(r.prospect, { verdict: canEmailProspect(r.prospect) }) });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      res.status(409).json({ success: false, code: "duplicate", error: "Someone with that email was just added." });
      return;
    }
    console.error("Create prospect error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to add the prospect" });
  }
};

/** POST /admin/super/prospects/check — live duplicate hint while typing. */
export const checkProspect = async (req: Request, res: Response): Promise<void> => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const parsed = parseProspectInput({ name: "xx", email, instagram: req.body?.instagram || "" });
  const ig = parsed.ok ? parsed.value.instagram : "";
  if (!email && !ig) {
    res.json({ success: true, data: {} });
    return;
  }
  const dup = await findDuplicates(email || "-", ig);
  res.json({ success: true, data: dup });
};

/** POST /admin/super/prospects/import — { text } */
export const importProspects = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows, errors } = parseProspectCsv(String(req.body?.text || ""));
    const added: string[] = [];
    const skipped: { line?: number; email?: string; error: string }[] = errors.map((e) => ({ line: e.line, error: e.error }));
    for (const row of rows) {
      const r = await addProspect(row, { userId: req.userId, email: req.userEmail }, "csv").catch((e) => ({
        ok: false as const,
        code: "duplicate" as const,
        dup: {},
        message: (e as { code?: number })?.code === 11000 ? "Already a prospect." : "Could not add.",
      }));
      if (r.ok) added.push(String(r.prospect._id));
      else skipped.push({ email: row.email, error: r.message });
    }
    await audit(req, { action: "prospect.import", reason: `Imported ${added.length} prospect(s), skipped ${skipped.length}` });
    res.json({ success: true, data: { added: added.length, skipped } });
  } catch (error) {
    console.error("Import prospects error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Import failed" });
  }
};

/** GET /admin/super/prospects/:id */
export const getProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = oid(req.params.id);
    const p = id ? await InfluencerProspect.findOne({ _id: id, deletedAt: null }).lean<IInfluencerProspect>() : null;
    if (!p) {
      res.status(404).json({ success: false, error: "Prospect not found" });
      return;
    }
    const thread = p.threadId ? await EmailThread.findById(p.threadId).lean<IEmailThread>() : null;
    if (thread?.unread) await EmailThread.updateOne({ _id: thread._id }, { $set: { unread: false } });
    const jobs = await ProspectMailJob.find({ prospectId: p._id }).sort({ createdAt: -1 }).limit(20).lean();
    res.json({
      success: true,
      data: {
        prospect: shapeProspect(p, { thread: thread ? { ...thread, unread: false } : null, verdict: canEmailProspect(p) }),
        thread: thread ? { ...shapeThread(thread as never), unread: false, userEmail: thread.userEmail, kind: thread.kind } : null,
        jobs: jobs.map((j) => ({ id: String(j._id), kind: j.kind, touch: j.style === "personal" ? j.touch || "pitch" : "pitch", state: j.state, error: j.error, subject: j.subject, sentAt: j.sentAt || null, createdAt: j.createdAt, via: j.via })),
      },
    });
  } catch (error) {
    console.error("Get prospect error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to load the prospect" });
  }
};

/** PATCH /admin/super/prospects/:id — details, or { status: "not_interested" | "reopen" } */
export const updateProspect = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = oid(req.params.id);
    const p = id ? await InfluencerProspect.findOne({ _id: id, deletedAt: null }) : null;
    if (!p) {
      res.status(404).json({ success: false, error: "Prospect not found" });
      return;
    }
    const status = String(req.body?.status || "");
    if (status === "not_interested" || status === "unsubscribed") {
      await setSuppressed([String(p._id)], status, status === "unsubscribed" ? { unsubscribedAt: new Date() } : {});
    } else if (status === "reopen") {
      // Only "not interested" can be undone by hand. Unsubscribed and bounced
      // are the recipient's decision / the mail system's, not ours.
      if (p.status !== "not_interested") {
        res.status(400).json({ success: false, error: "Only a prospect marked not interested can be reopened." });
        return;
      }
      p.status = p.lastReplyAt ? "replied" : p.initialSentAt ? "contacted" : "new";
      await p.save();
    } else if (status) {
      res.status(400).json({ success: false, error: "That status can't be set by hand." });
      return;
    } else {
      const parsed = parseProspectInput({ ...p.toObject(), ...req.body, email: req.body?.email ?? p.email });
      if (!parsed.ok) {
        res.status(400).json({ success: false, field: parsed.field, error: parsed.error });
        return;
      }
      if (parsed.value.email !== p.email || parsed.value.instagram !== p.instagram) {
        const dup = await findDuplicates(parsed.value.email, parsed.value.instagram, String(p._id));
        if (dup.prospect || dup.influencer) {
          res.status(409).json({ success: false, error: dup.influencer ? `${dup.influencer.name} is already an influencer.` : `${dup.prospect!.name} is already a prospect.`, duplicate: dup });
          return;
        }
      }
      if (parsed.value.email !== p.email && p.contactCount > 0) {
        res.status(400).json({ success: false, field: "email", error: "They've already been emailed at this address — add the new address as a separate prospect." });
        return;
      }
      p.set(parsed.value);
      await p.save();
    }
    await audit(req, { action: "prospect.update", reason: `Prospect ${p.name}: ${status || "details edited"}` });
    const fresh = await InfluencerProspect.findById(p._id).lean<IInfluencerProspect>();
    res.json({ success: true, data: shapeProspect(fresh!, { verdict: canEmailProspect(fresh!) }) });
  } catch (error) {
    console.error("Update prospect error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to update" });
  }
};

/** POST /admin/super/prospects/status — { ids, status: "not_interested" } */
export const bulkStatus = async (req: Request, res: Response): Promise<void> => {
  const ids = idList(req.body?.ids);
  if (!ids || req.body?.status !== "not_interested") {
    res.status(400).json({ success: false, error: "Pick prospects and a valid status." });
    return;
  }
  const n = await setSuppressed(ids.map(String), "not_interested");
  await audit(req, { action: "prospect.update", reason: `Marked ${n} prospect(s) not interested` });
  res.json({ success: true, data: { updated: n } });
};

/** POST /admin/super/prospects/delete — { ids } */
export const deleteProspects = async (req: Request, res: Response): Promise<void> => {
  const ids = idList(req.body?.ids);
  if (!ids) {
    res.status(400).json({ success: false, error: "Pick at least one prospect." });
    return;
  }
  await cancelQueued(ids, "Cancelled: prospect deleted.");
  const r = await InfluencerProspect.updateMany({ _id: { $in: ids }, deletedAt: null }, { $set: { deletedAt: new Date() } });
  await audit(req, { action: "prospect.delete", reason: `Deleted ${r.modifiedCount} prospect(s) (soft — unsubscribes are kept)` });
  res.json({ success: true, data: { deleted: r.modifiedCount } });
};

// ── Selection → who is eligible, for which kind of email ────────────────────
//
// One intent per send (first email / follow-up / new email / reply). The
// admin may pick it; otherwise the most common default in the selection is
// used. Everyone it fits is included, everyone else is listed with the reason
// (planSelection) — a mixed selection is never refused and never silently
// trimmed.

interface Selection {
  intent: JobKind | null;
  eligible: { p: IInfluencerProspect; kind: JobKind; thread: IEmailThread | null; verdict: ContactVerdict }[];
  skipped: { id: string; name: string; reason: string }[];
  reach: Record<JobKind, number>;
  needsConfirm: { id: string; name: string }[];
}

const INTENTS: JobKind[] = ["initial", "followup", "fresh", "reply"];
const readIntent = (req: Request): JobKind | null => (INTENTS.includes(req.body?.intent) ? (req.body.intent as JobKind) : null);
const readAllowNotInterested = (req: Request) => req.body?.allowNotInterested === true;

async function resolveSelection(ids: mongoose.Types.ObjectId[], intent: JobKind | null, allowNotInterested: boolean): Promise<Selection> {
  const rows = await InfluencerProspect.find({ _id: { $in: ids }, deletedAt: null }).lean<IInfluencerProspect[]>();
  const threadIds = rows.map((r) => r.threadId).filter(Boolean);
  const threads = threadIds.length ? await EmailThread.find({ _id: { $in: threadIds } }).lean<IEmailThread[]>() : [];
  const T = new Map(threads.map((t) => [String(t._id), t]));
  const now = new Date();
  const found = new Set(rows.map((r) => String(r._id)));
  const missing = ids.filter((id) => !found.has(String(id))).map((id) => ({ id: String(id), name: "", reason: "Not found." }));
  const byId = new Map(rows.map((p) => [String(p._id), { p, verdict: canEmailProspect(p, now) }]));
  const plan = planSelection(
    rows.map((p) => ({ id: String(p._id), name: p.name, verdict: byId.get(String(p._id))!.verdict })),
    { intent, allowNotInterested }
  );
  return {
    intent: plan.intent,
    eligible: plan.included.map(({ id }) => {
      const { p, verdict } = byId.get(id)!;
      return { p, kind: plan.intent as JobKind, thread: p.threadId ? T.get(String(p.threadId)) || null : null, verdict };
    }),
    skipped: [...missing, ...plan.excluded],
    reach: plan.reach,
    needsConfirm: plan.needsConfirm,
  };
}

/** What the admin asked for. Personal is the default; anything else is classic only when said. */
const readStyle = (req: Request): OutreachStyle => (req.body?.style === "classic" ? "classic" : "personal");

/** Personal first email: Connect (default) or Pitch. */
const readTouch = (req: Request): FirstTouch => (req.body?.touch === "pitch" ? "pitch" : "connect");

/** The first-touch profile one recipient's email is held to (see touchFor). */
const touchOf = (e: { p: IInfluencerProspect; kind: JobKind }, style: OutreachStyle, requested: FirstTouch): FirstTouch =>
  touchFor({ kind: e.kind, style, firstTouch: e.p.firstTouch, lastReplyAt: e.p.lastReplyAt }, requested);

/**
 * The style one recipient actually gets. A first email takes the requested
 * style; anything later keeps the style the conversation started in, so it
 * comes from the same sender. Prospects emailed before personal mode existed
 * were classic.
 */
function styleFor(e: { p: IInfluencerProspect; kind: JobKind }, requested: OutreachStyle): OutreachStyle {
  if (e.kind === "initial") return requested;
  return e.p.outreachStyle === "personal" ? "personal" : "classic";
}

/** Nothing to send to, or a multi-person reply: answer with the reason. */
function refuseSelection(sel: Selection, res: Response): boolean {
  if (sel.eligible.length === 0) {
    const why =
      sel.needsConfirm.length && sel.needsConfirm.length === sel.skipped.length
        ? "They said they're not interested — confirm to send anyway."
        : sel.skipped.length === 1
          ? sel.skipped[0].reason
          : "None of the selected prospects fit this kind of email.";
    res.status(400).json({ success: false, error: why, skipped: sel.skipped, reach: sel.reach, intent: sel.intent });
    return true;
  }
  if (sel.intent === "reply" && sel.eligible.length > 1) {
    res.status(400).json({ success: false, error: "Replies are personal — open each conversation and answer one at a time.", skipped: sel.skipped, reach: sel.reach, intent: sel.intent });
    return true;
  }
  return false;
}

const forAi = (t: IEmailThread | null) =>
  (t?.messages || []).map((m) => ({
    direction: m.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
    body: m.body || "",
    at: m.at,
  }));

/** The subject a follow-up / reply threads under: the latest message's, as "Re: …". */
function threadSubject(t: IEmailThread | null): string {
  const msgs = t?.messages || [];
  const last = [...msgs].reverse().find((m) => baseSubject(m.subject || ""));
  return baseSubject(last?.subject || t?.subject || "");
}

/** How many emails went to them and when (for "already sent" in the dialog). */
function sentSummary(p: IInfluencerProspect, t: IEmailThread | null) {
  const out = (t?.messages || []).filter((m) => m.direction === "outbound").map((m) => m.at);
  return {
    sentCount: Math.max(p.contactCount || 0, out.length),
    lastSentAt: p.lastContactedAt || out[out.length - 1] || null,
    sentDates: out.slice(-6),
  };
}

/** POST /admin/super/prospects/draft — { ids, intent?, note?, style?, allowNotInterested? } */
export const draftProspects = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = idList(req.body?.ids);
    if (!ids) {
      res.status(400).json({ success: false, error: `Select between 1 and ${MAX_SELECTION} prospects.` });
      return;
    }
    const sel = await resolveSelection(ids, readIntent(req), readAllowNotInterested(req));
    if (refuseSelection(sel, res)) return;
    const kind = sel.intent as JobKind;
    const programme = await programmeFacts();
    const one = sel.eligible.length === 1 ? sel.eligible[0] : null;
    const person = one
      ? { name: one.p.name, instagram: one.p.instagram, niche: one.p.niche, note: one.p.note, followerRange: one.p.followerRange }
      : undefined;
    const note = typeof req.body?.note === "string" ? req.body.note : "";
    const style = styleFor(sel.eligible[0], readStyle(req));
    // A template follow-up may carry a link only if EVERY recipient is past
    // their first follow-up.
    const priorFollowups = Math.min(...sel.eligible.map((e) => priorFollowupsOf(e.p)));
    const firstOut = sel.eligible[0].thread?.messages.find((m) => m.direction === "outbound")?.body || "";

    let ctx: ProspectDraftContext;
    if (kind === "initial") {
      ctx = one ? { mode: "personal", person, programme, adminNote: note } : { mode: "template", recipients: sel.eligible.length, programme, adminNote: note };
    } else if (kind === "followup" || kind === "fresh") {
      ctx = one
        ? { mode: kind, person, programme, messages: forAi(one.thread), adminNote: note, priorFollowups }
        : { mode: kind, recipients: sel.eligible.length, programme, firstEmail: firstOut, adminNote: note, priorFollowups };
    } else {
      ctx = { mode: "reply", person, programme, messages: forAi(one!.thread), adminNote: note };
    }
    ctx.style = style;
    // Connect for the whole selection only when every recipient gets it (a
    // template follow-up to mixed first emails is written as a pitch-free
    // bump only if all of them were Connect notes).
    const touches = sel.eligible.map((e) => touchOf(e, styleFor(e, readStyle(req)), readTouch(req)));
    const touch: FirstTouch = touches.every((t) => t === "connect") ? "connect" : "pitch";
    ctx.touch = touch;
    if (kind === "reply") ctx.afterConnect = style === "personal" && sel.eligible[0].p.firstTouch === "connect";
    // Numbers and the screenshot are saved for after they reply.
    const choice = touch === "connect" ? null : await readProofChoice(req.body);
    if (choice) ctx.proof = choice.proof;

    const drafts = await draftProspectAlternatives(ctx);
    // Follow-ups and replies continue each person's own thread, so the subject
    // is "Re: <their latest subject>", set per recipient at send time.
    const threaded = kind === "followup" || kind === "reply";
    const reSubject = one?.thread ? replySubject(threadSubject(one.thread)) : "";
    const alternatives = drafts.map((d) => ({ subject: threaded ? reSubject : d.subject, body: d.body, reading: d.reading, angle: d.angle, subjectFallback: !!d.subjectFallback }));
    res.json({
      success: true,
      data: {
        ...drafts[0],
        subject: alternatives[0].subject,
        alternatives,
        kind,
        intent: kind,
        style,
        touch,
        afterConnect: !!ctx.afterConnect,
        proofId: choice?.proof.id || null,
        subjectPerRecipient: threaded,
        eligible: sel.eligible.map((e) => ({ id: String(e.p._id), name: e.p.name })),
        skipped: sel.skipped,
        reach: sel.reach,
      },
    });
  } catch (error) {
    if (error instanceof ThreadAiUnavailableError) {
      res.status(503).json({ success: false, error: error.message, code: "AI_UNAVAILABLE" });
      return;
    }
    if (error instanceof ThreadAiRefusedError) {
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    console.error("Draft prospect mail error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to generate an email" });
  }
};

function readContent(req: Request) {
  return {
    subject: String(req.body?.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, SUBJECT_MAX),
    body: String(req.body?.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, BODY_MAX),
  };
}

const subjectFor = (kind: JobKind, typed: string, thread: IEmailThread | null) => {
  if (kind === "initial" || kind === "fresh") return typed;
  const base = threadSubject(thread);
  return base ? replySubject(base) : typed ? replySubject(typed) : "Re: Would love to connect";
};

/** POST /admin/super/prospects/preview — { ids, intent?, prospectId?, subject, body, style?, allowNotInterested? } */
export const previewProspectMail = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = idList(req.body?.ids);
    if (!ids) {
      res.status(400).json({ success: false, error: "Select at least one prospect." });
      return;
    }
    const { subject, body } = readContent(req);
    const sel = await resolveSelection(ids, readIntent(req), readAllowNotInterested(req));
    const pick =
      sel.eligible.find((e) => String(e.p._id) === String(req.body?.prospectId)) || sel.eligible[0];
    const { commissionPercent } = await programmeFacts();
    const planOut = { intent: sel.intent, reach: sel.reach, needsConfirm: sel.needsConfirm, skipped: sel.skipped };
    if (!pick) {
      res.json({ success: true, data: { lint: null, eligible: [], ...planOut } });
      return;
    }
    const style = styleFor(pick, readStyle(req));
    const touch = touchOf(pick, style, readTouch(req));
    const connect = touch === "connect";
    const target = { name: pick.p.name, instagram: pick.p.instagram };
    const subj = renderMergeFields(subjectFor(pick.kind, subject, pick.thread), target);
    const text = renderMergeFields(body, target);
    const priorFollowups = priorFollowupsOf(pick.p);
    // A Connect note carries no numbers and no screenshot, whatever is toggled.
    const choice = connect ? null : await readProofChoice(req.body);
    const allowedNumbers = choice ? proofAllowedNumbers(choice.proof) : undefined;
    const lint = lintOutreach(subj, text, { commissionPercent, template: { subject, body }, kind: pick.kind, style, priorFollowups, allowedNumbers, touch });
    // The screenshot goes inline only in personal mail (classic has its own HTML).
    const attach = !!choice?.attach && style === "personal";
    const dress = personalDress(touch, pick.kind);
    const signature = dress.signature;
    const person = dress.sender;
    const sender =
      style === "personal"
        ? person
        : { fromAddress: influencerFromAddress(), fromName: env.PROSPECT_FROM_NAME, replyToAddress: influencerReplyToAddress() };
    const content = {
      body: text,
      signature: env.PROSPECT_SIGNATURE,
      instagram: pick.p.instagram,
      unsubscribeUrl: unsubscribeUrl("preview-token-not-real"),
      token: pick.thread?.threadToken || "INF-XXXXXXXX",
    };
    const threaded = pick.kind === "followup" || pick.kind === "reply";
    res.json({
      success: true,
      data: {
        to: { id: String(pick.p._id), name: pick.p.name, email: pick.p.email },
        kind: pick.kind,
        style,
        touch,
        afterConnect: pick.kind === "reply" && style === "personal" && pick.p.firstTouch === "connect",
        signature: style === "personal" ? signature : env.PROSPECT_SIGNATURE,
        from: `${sender.fromName} <${sender.fromAddress}>`,
        replyTo: sender.replyToAddress,
        subject: subj,
        threaded,
        // Personal + screenshot: the text and HTML twin exactly as sent, with
        // the CDN URL standing in for "cid:" so the preview shows the image.
        ...(style === "personal"
          ? personalEmailParts({ body: text, signature, proof: attach ? choice!.proof : null, imageSrc: attach ? choice!.proof.imageUrl : "" })
          : { text: prospectMailText(content), html: prospectMailHtml(content) }),
        headers: [...(style === "personal" ? [] : ["List-Unsubscribe", "List-Unsubscribe-Post"]), ...(threaded && pick.thread ? ["In-Reply-To", "References"] : [])],
        /** What goes inline, for the preview's attachment line. */
        image: attach
          ? { url: choice!.proof.imageUrl, alt: screenshotAlt(choice!.proof.source), source: SOURCE_NAME[choice!.proof.source], mime: "multipart/alternative: text/plain + multipart/related (text/html + inline image, cid)" }
          : null,
        proof: choice ? { id: choice.proof.id, allowedNumbers, attach } : null,
        lint,
        inboxCheck: inboxCheck({ style, kind: pick.kind, body: text, lint, sender, subject: subj, priorFollowups, quietLane: quietLaneStatus(), numbers: !!allowedNumbers?.length && style === "personal", image: attach, touch }),
        personalBlocked: style === "personal" ? personalSenderStatus()?.message || "" : "",
        eligible: sel.eligible.map((e) => {
          const v = e.verdict.ok ? e.verdict : null;
          return {
            id: String(e.p._id),
            name: e.p.name,
            kind: e.kind,
            hasNote: !!(e.p.note || "").trim(),
            firstTouch: e.p.firstTouch || "",
            ...sentSummary(e.p, e.thread),
            recent: v?.recent || "",
            notInterested: !!v?.needsConfirm,
          };
        }),
        ...planOut,
      },
    });
  } catch (error) {
    console.error("Preview prospect mail error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to preview" });
  }
};

/** POST /admin/super/prospects/send — { ids, intent?, subject, body, style?, aiAssisted?, allowNotInterested? } → queued, never sent inline. */
export const sendProspectMail = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = idList(req.body?.ids);
    if (!ids) {
      res.status(400).json({ success: false, error: `Select between 1 and ${MAX_SELECTION} prospects.` });
      return;
    }
    const { subject, body } = readContent(req);
    const sel = await resolveSelection(ids, readIntent(req), readAllowNotInterested(req));
    if (refuseSelection(sel, res)) return;
    const kind = sel.intent as JobKind;
    if ((kind === "initial" || kind === "fresh") && !baseSubject(subject)) {
      res.status(400).json({ success: false, error: "Add a subject." });
      return;
    }
    if (influencerSendMode() === "off") {
      res.status(503).json({ success: false, code: "SES_NOT_CONFIGURED", error: "SES is not configured on this deployment, so nothing can be sent." });
      return;
    }

    // The spam check, per recipient, on exactly what they will receive. One
    // failure blocks the whole send: the admin fixes the template once.
    const { commissionPercent } = await programmeFacts();
    const requested = readStyle(req);
    const requestedTouch = readTouch(req);
    const choice = await readProofChoice(req.body);
    if (req.body?.useNumbers === true && !choice) {
      res.status(400).json({ success: false, error: "That traction screenshot is gone or not confirmed yet — pick another, or switch “Show our numbers” off." });
      return;
    }
    const allowedNumbers = choice ? proofAllowedNumbers(choice.proof) : undefined;
    const items = [];
    for (const e of sel.eligible) {
      const subj = subjectFor(kind, subject, e.thread);
      const target = { name: e.p.name, instagram: e.p.instagram };
      const style = styleFor(e, requested);
      const touch = touchOf(e, style, requestedTouch);
      const lint = lintOutreach(renderMergeFields(subj, target), renderMergeFields(body, target), {
        commissionPercent,
        template: { subject: subj, body },
        kind,
        style,
        priorFollowups: priorFollowupsOf(e.p),
        allowedNumbers: touch === "connect" ? undefined : allowedNumbers,
        touch,
      });
      if (!lint.ok) {
        res.status(422).json({ success: false, code: "LINT", error: lint.errors[0].message, lint, for: e.p.name });
        return;
      }
      items.push({
        prospectId: String(e.p._id),
        kind,
        subject: subj,
        body,
        style,
        touch,
        override: !!(e.verdict.ok && e.verdict.needsConfirm),
        // Saved for after they reply: a Connect note never carries the numbers or the screenshot.
        proof: choice && touch !== "connect" ? { ...choice.proof, attach: choice.attach && style === "personal" } : null,
      });
    }

    const aiAssisted = req.body?.aiAssisted === true;
    const q = await enqueueJobs(items, { aiAssisted, byEmail: req.userEmail || "" });
    // Instant mode: start sending now rather than on the next queue tick.
    if (q.queued.length) kickProspectQueue();
    const pacing = await pacingNow();
    const totalQueued = await ProspectMailJob.countDocuments({ state: { $in: ["queued", "sending"] } });
    const overrides = items.filter((i) => i.override).length;
    await audit(req, {
      action: "prospect.mail_queued",
      reason: `Queued ${q.queued.length} ${kind} email(s) [${requested}${items.some((i) => i.touch === "connect") ? " · connect" : ""}] "${subject.slice(0, 80)}"${aiAssisted ? " · AI-assisted draft, reviewed" : " · written by hand"}${choice && items.some((i) => i.proof) ? ` · traction numbers${choice.attach ? " + screenshot inline" : ""}` : ""}${overrides ? ` · ${overrides} marked not interested, confirmed` : ""}${q.already.length ? ` · ${q.already.length} already queued` : ""}${sel.skipped.length ? ` · ${sel.skipped.length} excluded` : ""} [${q.batchId}]`,
      ...(sel.eligible.length === 1 ? { targetUserEmail: sel.eligible[0].p.email } : {}),
    });
    res.json({
      success: true,
      message: `${q.queued.length} email${q.queued.length === 1 ? "" : "s"} queued`,
      data: {
        batchId: q.batchId,
        queued: q.queued,
        already: q.already,
        skipped: sel.skipped,
        finishEstimate: totalQueued ? estimateFinish(totalQueued, pacing) : null,
        personalBlocked: items.some((i) => i.style === "personal") ? personalSenderStatus()?.message || "" : "",
      },
    });
  } catch (error) {
    console.error("Send prospect mail error:", (error as Error)?.message);
    res.status(500).json({ success: false, error: "Failed to queue the emails" });
  }
};

/** POST /admin/super/prospects/cancel — { ids } */
export const cancelProspectMail = async (req: Request, res: Response): Promise<void> => {
  const ids = idList(req.body?.ids);
  if (!ids) {
    res.status(400).json({ success: false, error: "Pick at least one prospect." });
    return;
  }
  const n = await cancelQueued(ids, "Cancelled by an admin.");
  await audit(req, { action: "prospect.mail_cancelled", reason: `Cancelled ${n} queued email(s)` });
  res.json({ success: true, data: { cancelled: n } });
};

// ── Public: the unsubscribe link ────────────────────────────────────────────

const page = (title: string, text: string, form = "") => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#faf6f1;color:#2a0a0e;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
main{max-width:420px;background:#fff;border:1px solid #eadfd3;border-radius:14px;padding:28px}h1{font-size:20px;margin:0 0 10px}p{line-height:1.55;margin:0 0 16px;color:#5a4040}
button{font:inherit;font-weight:700;padding:11px 20px;border-radius:999px;border:0;background:#3d0c11;color:#fff;cursor:pointer}</style></head>
<body><main><h1>${title}</h1><p>${text}</p>${form}</main></body></html>`;

function sendPage(res: Response, status: number, html: string) {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  res.send(html);
}

/**
 * GET shows a confirm button and changes nothing: link scanners and inbox
 * previews fetch every link in a message, and a GET that unsubscribed would
 * unsubscribe people who never clicked.
 */
export const unsubscribePage = async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token || "");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    sendPage(res, 404, page("Link not recognised", "This unsubscribe link isn't valid. Reply to the email with “unsubscribe” and we'll remove you by hand."));
    return;
  }
  sendPage(
    res,
    200,
    page(
      "Unsubscribe",
      "Press the button and SubhSandesh won't email you about the creator programme again.",
      `<form method="post"><input type="hidden" name="confirm" value="1"><button type="submit">Unsubscribe</button></form>`
    )
  );
};

/** POST — the button above, and RFC 8058 one-click from Gmail/Yahoo. */
export const unsubscribeOneClick = async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await unsubscribeByToken(String(req.params.token || ""));
    if (r === "unknown") {
      sendPage(res, 404, page("Link not recognised", "This unsubscribe link isn't valid. Reply to the email with “unsubscribe” and we'll remove you by hand."));
      return;
    }
    sendPage(res, 200, page("You're unsubscribed", "You won't get any more emails from us about the creator programme. Sorry for the bother."));
  } catch (error) {
    console.error("Unsubscribe error:", (error as Error)?.message);
    sendPage(res, 500, page("Something went wrong", "Please try again, or reply to the email with “unsubscribe”."));
  }
};
