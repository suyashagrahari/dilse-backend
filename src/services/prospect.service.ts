// ─── Prospects: the database half ────────────────────────────────────────────
//
// Pure rules live in prospectMail.service; this file applies them to Mongo:
// adding with duplicate detection, the reply / bounce / unsubscribe / join
// transitions, and queueing mail. The worker that SENDS the queue is
// prospectQueue.service.
//
// Every transition into a suppressed status also cancels that prospect's
// queued mail, so the order in which events land never lets a queued email
// slip out after an unsubscribe.

import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env";
import InfluencerProspect, { type IInfluencerProspect, type ProspectStatus } from "../models/InfluencerProspect";
import ProspectMailJob, { type FirstTouch, type IProspectMailJob, type JobKind, type OutreachStyle } from "../models/ProspectMailJob";
import EmailThread from "../models/EmailThread";
import User from "../models/User";
import { getInfluencerSettings } from "./influencer.service";
import { classifyProspectReply, type ProspectInput, type SesFeedback } from "./prospectMail.service";
import type { ProgrammeFacts } from "./prospectAi.service";

export function newUnsubscribeToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export async function programmeFacts(now: Date = new Date()): Promise<ProgrammeFacts> {
  const s = await getInfluencerSettings();
  return {
    commissionPercent: s.defaultCommissionPercent,
    attributionDays: s.attributionDays,
    joinUrl: env.PROSPECT_JOIN_URL,
    today: now.toISOString().slice(0, 10),
  };
}

// ── Duplicates ──────────────────────────────────────────────────────────────

export interface DuplicateInfo {
  prospect?: { id: string; name: string; email: string; status: ProspectStatus; deleted: boolean };
  influencer?: { id: string; name: string; email: string; instagram: string };
}

/** Is this person already a prospect, or already an influencer? */
export async function findDuplicates(email: string, instagram: string, excludeId?: string): Promise<DuplicateInfo> {
  const out: DuplicateInfo = {};
  const or: Record<string, unknown>[] = [{ email }];
  if (instagram) or.push({ instagram });
  const p = await InfluencerProspect.findOne({
    $or: or,
    ...(excludeId ? { _id: { $ne: new mongoose.Types.ObjectId(excludeId) } } : {}),
  })
    .select("name email status deletedAt")
    .lean();
  if (p) {
    out.prospect = { id: String(p._id), name: p.name, email: p.email, status: p.status, deleted: !!p.deletedAt };
  }
  const uOr: Record<string, unknown>[] = [{ email }];
  if (instagram) uOr.push({ "influencer.instagram": instagram });
  const u = await User.findOne({ influencer: { $exists: true, $ne: null }, $or: uOr })
    .select("name email influencer.instagram")
    .lean<{ _id: unknown; name: string; email: string; influencer?: { instagram?: string } }>();
  if (u) out.influencer = { id: String(u._id), name: u.name, email: u.email, instagram: u.influencer?.instagram || "" };
  return out;
}

/**
 * Add one prospect. A soft-deleted row with the same email is RESTORED with
 * the new details — unless it is suppressed, in which case it stays exactly
 * as it is and the caller is told why.
 */
export async function addProspect(
  input: ProspectInput,
  by: { userId?: string; email?: string },
  source: "manual" | "csv" = "manual"
): Promise<
  | { ok: true; prospect: IInfluencerProspect; restored: boolean }
  | { ok: false; code: "duplicate" | "influencer" | "suppressed"; dup: DuplicateInfo; message: string }
> {
  const dup = await findDuplicates(input.email, input.instagram);
  if (dup.influencer) {
    return { ok: false, code: "influencer", dup, message: `${dup.influencer.name} is already an influencer.` };
  }
  if (dup.prospect && !dup.prospect.deleted) {
    return { ok: false, code: "duplicate", dup, message: `${dup.prospect.name} is already a prospect (${dup.prospect.status.replace("_", " ")}).` };
  }
  if (dup.prospect?.deleted) {
    const old = await InfluencerProspect.findById(dup.prospect.id);
    if (old && ["unsubscribed", "bounced"].includes(old.status)) {
      return {
        ok: false,
        code: "suppressed",
        dup,
        message: old.status === "unsubscribed" ? "This address unsubscribed earlier and can't be added again." : "This address bounced earlier and can't be added again.",
      };
    }
    if (old && old.email === input.email) {
      old.set({ ...input, deletedAt: undefined, source });
      await old.save();
      return { ok: true, prospect: old, restored: true };
    }
  }
  const prospect = await InfluencerProspect.create({
    ...input,
    source,
    status: "new",
    createdBy: by.userId && mongoose.Types.ObjectId.isValid(by.userId) ? new mongoose.Types.ObjectId(by.userId) : undefined,
    createdByEmail: by.email || "",
    unsubscribeToken: newUnsubscribeToken(),
  });
  return { ok: true, prospect, restored: false };
}

// ── Transitions ─────────────────────────────────────────────────────────────

/** Cancel every queued (not yet sending) email to these prospects. */
export async function cancelQueued(prospectIds: (string | mongoose.Types.ObjectId)[], reason: string): Promise<number> {
  if (!prospectIds.length) return 0;
  const r = await ProspectMailJob.updateMany(
    { prospectId: { $in: prospectIds.map((id) => new mongoose.Types.ObjectId(String(id))) }, state: "queued" },
    { $set: { state: "cancelled", live: false, error: reason.slice(0, 600) } }
  );
  return r.modifiedCount || 0;
}

export async function setSuppressed(
  ids: string[],
  status: "not_interested" | "unsubscribed" | "bounced",
  extra: Record<string, unknown> = {}
): Promise<number> {
  const oids = ids.filter((i) => mongoose.Types.ObjectId.isValid(i)).map((i) => new mongoose.Types.ObjectId(i));
  // Joined outranks everything; a bounce outranks a "not interested".
  const r = await InfluencerProspect.updateMany(
    { _id: { $in: oids }, status: { $nin: ["joined", ...(status === "not_interested" ? ["unsubscribed", "bounced"] : [])] } },
    { $set: { status, ...extra } }
  );
  await cancelQueued(oids, `Cancelled: marked ${status.replace("_", " ")}.`);
  return r.modifiedCount || 0;
}

/** A reply arrived on a prospect thread. */
export async function recordProspectReply(threadId: string, subject: string, body: string): Promise<void> {
  const thread = await EmailThread.findById(threadId).select("prospectId kind").lean();
  if (!thread?.prospectId) return;
  const p = await InfluencerProspect.findById(thread.prospectId);
  if (!p) return;
  const cls = classifyProspectReply(subject, body);
  const now = new Date();
  if (cls === "unsubscribe") {
    await setSuppressed([String(p._id)], "unsubscribed", { unsubscribedAt: now, lastReplyAt: now });
    return;
  }
  if (cls === "not_interested") {
    await setSuppressed([String(p._id)], "not_interested", { lastReplyAt: now });
    return;
  }
  const set: Record<string, unknown> = { lastReplyAt: now };
  if (["new", "contacted"].includes(p.status)) set.status = "replied";
  await InfluencerProspect.updateOne({ _id: p._id }, { $set: set });
  // A queued follow-up / new email would now talk past their reply.
  await ProspectMailJob.updateMany(
    { prospectId: p._id, state: "queued", kind: { $in: ["followup", "fresh"] } },
    { $set: { state: "cancelled", live: false, error: "Cancelled: they replied." } }
  );
}

/** Public unsubscribe link / one-click POST. Idempotent. */
export async function unsubscribeByToken(token: string): Promise<"done" | "already" | "unknown"> {
  const t = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return "unknown";
  const p = await InfluencerProspect.findOne({ unsubscribeToken: t }).select("status");
  if (!p) return "unknown";
  if (p.status === "unsubscribed") return "already";
  await InfluencerProspect.updateOne({ _id: p._id }, { $set: { status: p.status === "joined" ? "joined" : "unsubscribed", unsubscribedAt: new Date() } });
  await cancelQueued([p._id as mongoose.Types.ObjectId], "Cancelled: they unsubscribed.");
  return "done";
}

/** SES told us an address bounced or complained. Prospects only. */
export async function applySesFeedbackToProspects(fb: SesFeedback): Promise<number> {
  if (!fb.recipients.length) return 0;
  // A soft (transient) bounce is a full mailbox or a greylist; it is not a
  // reason to stop forever.
  if (fb.type === "bounce" && !fb.permanent) return 0;
  const rows = await InfluencerProspect.find({ email: { $in: fb.recipients } }).select("_id").lean();
  const ids = rows.map((r) => String(r._id));
  if (!ids.length) return 0;
  const now = new Date();
  return fb.type === "bounce"
    ? setSuppressed(ids, "bounced", { bouncedAt: now })
    : setSuppressed(ids, "unsubscribed", { complainedAt: now, unsubscribedAt: now });
}

// ── Join hook ───────────────────────────────────────────────────────────────

export interface JoinedUser {
  _id: unknown;
  email: string;
  instagram?: string;
}

export interface JoinDeps {
  findProspects(email: string, instagram: string): Promise<{ _id: unknown; threadId?: unknown }[]>;
  markJoined(ids: unknown[], userId: unknown, at: Date): Promise<void>;
  convertThread(threadId: unknown, userId: unknown): Promise<void>;
  cancel(ids: unknown[]): Promise<void>;
}

export const mongoJoinDeps: JoinDeps = {
  findProspects: (email, instagram) =>
    InfluencerProspect.find({
      deletedAt: null,
      status: { $ne: "joined" },
      $or: [{ email }, ...(instagram ? [{ instagram }] : [])],
    })
      .select("_id threadId")
      .lean(),
  markJoined: async (ids, userId, at) => {
    await InfluencerProspect.updateMany(
      { _id: { $in: ids } },
      { $set: { status: "joined", joinedUserId: userId, joinedAt: at } }
    );
  },
  convertThread: async (threadId, userId) => {
    // Numbered after any influencer thread they already have, so the
    // influencer page (newest seq first) opens this conversation.
    const newest = await EmailThread.findOne({ kind: "influencer", userId }).sort({ seq: -1 }).select("seq").lean<{ seq: number }>();
    await EmailThread.updateOne(
      { _id: threadId, kind: "prospect" },
      { $set: { kind: "influencer", userId, seq: (newest?.seq || 0) + 1 } }
    );
  },
  cancel: async (ids) => {
    await cancelQueued(ids.map(String), "Cancelled: they joined.");
  },
};

/**
 * Called by the influencer join flow. Matches on the account email OR the
 * Instagram handle they entered, marks those prospects joined, and moves the
 * outreach thread onto their influencer page. Never throws — joining must not
 * fail because of bookkeeping.
 */
export async function markProspectJoined(user: JoinedUser, deps: JoinDeps = mongoJoinDeps): Promise<number> {
  try {
    const email = String(user.email || "").trim().toLowerCase();
    const ig = String(user.instagram || "").trim().toLowerCase().replace(/^@+/, "");
    if (!email && !ig) return 0;
    const found = await deps.findProspects(email, ig);
    if (!found.length) return 0;
    const ids = found.map((p) => p._id);
    await deps.markJoined(ids, user._id, new Date());
    await deps.cancel(ids);
    for (const p of found) if (p.threadId) await deps.convertThread(p.threadId, user._id);
    return found.length;
  } catch (err) {
    console.error("markProspectJoined failed (non-fatal):", (err as Error)?.message);
    return 0;
  }
}

// ── Queueing ────────────────────────────────────────────────────────────────

export interface EnqueueItem {
  prospectId: string;
  kind: JobKind;
  subject: string;
  body: string;
  style: OutreachStyle;
  /** Connect (a hello) or pitch — see FIRST_TOUCHES. */
  touch?: FirstTouch;
  /** The admin confirmed sending to someone marked not interested. */
  override?: boolean;
  /** The traction proof snapshot (numbers allowed; screenshot inline when attach). */
  proof?: IProspectMailJob["proof"];
}

/**
 * Write one job per recipient. A prospect that already has a live job is
 * reported, not queued twice (the unique index enforces it under races too).
 */
export async function enqueueJobs(
  items: EnqueueItem[],
  meta: { aiAssisted: boolean; byEmail: string }
): Promise<{ batchId: string; queued: string[]; already: string[] }> {
  const batchId = `b_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  const queued: string[] = [];
  const already: string[] = [];
  for (const it of items) {
    try {
      await ProspectMailJob.create({
        prospectId: new mongoose.Types.ObjectId(it.prospectId),
        batchId,
        kind: it.kind,
        style: it.style,
        touch: it.touch || "pitch",
        subject: it.subject,
        body: it.body,
        aiAssisted: meta.aiAssisted,
        override: !!it.override,
        proof: it.proof || null,
        state: "queued",
        live: true,
        notBefore: new Date(),
        byEmail: meta.byEmail,
      });
      queued.push(it.prospectId);
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) already.push(it.prospectId);
      else throw err;
    }
  }
  return { batchId, queued, already };
}
