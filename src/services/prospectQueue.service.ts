// ─── The prospect send queue ─────────────────────────────────────────────────
//
// Sends ProspectMailJob rows one at a time: a random 2–6 minute gap between
// sends (PROSPECT_MIN/MAX_GAP_SECONDS, drawn once per send), only inside the
// local sending hours (09:00–21:00 IST by default), never more than
// PROSPECT_DAILY_CAP in any rolling 24 hours. A new domain identity sending 50 cold emails in a minute is the
// pattern spam filters are built to catch; the same 50 spread over two days
// is not.
//
// Every job is re-checked immediately before it goes (`canEmailProspect`), so
// an unsubscribe, reply, bounce or join that lands while a job waits always
// wins. A job interrupted mid-send (a restart) is marked failed rather than
// retried: whether SES accepted it is unknown, and a duplicate cold email is
// worse than a missing one.

import mongoose from "mongoose";
import { env } from "../config/env";
import InfluencerProspect from "../models/InfluencerProspect";
import ProspectMailJob from "../models/ProspectMailJob";
import EmailThread, { type IEmailThread } from "../models/EmailThread";
import { appendMessage, openThread } from "./threadStore.service";
import { threadingHeadersFor } from "./emailThread.service";
import { SesSendError } from "./ses.service";
import {
  InfluencerMailNotConfiguredError,
  influencerReplyToAddress,
  influencerSendMode,
  newThreadToken,
  sendInfluencerMail,
  type InfluencerSendInput,
  type MailTransport,
} from "./influencerMail.service";
import type { OutreachStyle } from "../models/ProspectMailJob";
import {
  canEmailProspect,
  envSendWindow,
  isSenderNotAllowedError,
  lintOutreach,
  nextSendDecision,
  personalSender,
  personalSenderBlockedMessage,
  personalSignature,
  pickGapMs,
  priorFollowupsOf,
  prospectHeaders,
  prospectMailHtml,
  prospectMailText,
  prospectPersonalText,
  renderMergeFields,
  unsubscribeUrl,
  type PacingInput,
  type PersonalSender,
  type QuietLaneState,
} from "./prospectMail.service";
import { getInfluencerSettings } from "./influencer.service";

const STALE_SENDING_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const TICK_MS = 15_000;

let lastError = "";
let lastTickAt: Date | null = null;

/**
 * Set when SES refused the personal From address (IAM ses:FromAddress).
 * While set (and for an hour at most), personal jobs wait in the queue —
 * they are NEVER re-sent from another address — and the panel shows it.
 */
let personalBlocked: { message: string; at: Date } | null = null;
const PERSONAL_RETRY_MS = 60 * 60_000;

export function personalSenderStatus(now: Date = new Date()): { message: string; at: Date } | null {
  if (personalBlocked && now.getTime() - personalBlocked.at.getTime() > 24 * 3_600_000) personalBlocked = null;
  return personalBlocked;
}

/**
 * The quiet sending lane (PROSPECT_SES_CONFIGURATION_SET) as the last send
 * found it. In memory, like personalBlocked: a restart forgets a "missing"
 * verdict and the next send finds out again (one extra SES call).
 */
let quietLane: { state: "unknown" | "ready" | "missing"; message: string; at: Date | null } = { state: "unknown", message: "", at: null };

export function quietLaneStatus(configurationSet: string = env.PROSPECT_SES_CONFIGURATION_SET): QuietLaneState {
  if (!configurationSet) return { configurationSet: "", state: "off", message: "PROSPECT_SES_CONFIGURATION_SET is off — prospect mail goes on the default configuration set (open tracking on)." };
  if (quietLane.state === "missing") {
    return { configurationSet, state: "missing", message: `Quiet lane not set up yet: ${quietLane.message} Sends fall back to the default configuration set (open tracking on) until it exists.` };
  }
  return { configurationSet, state: quietLane.state, message: "" };
}

/** Record what a send found out about the quiet lane. Exported for tests. */
export function noteQuietLane(result: { quietLane: "used" | "fallback" | "none"; quietLaneError?: string }, now: Date = new Date()): void {
  if (result.quietLane === "used") quietLane = { state: "ready", message: "", at: now };
  else if (result.quietLane === "fallback") quietLane = { state: "missing", message: result.quietLaneError || "SES refused the configuration set.", at: now };
}

/** Tests only. */
export function _resetQueueStateForTests(): void {
  personalBlocked = null;
  lastError = "";
  quietLane = { state: "unknown", message: "", at: null };
}

export async function pacingNow(now: Date = new Date()): Promise<PacingInput> {
  const since = new Date(now.getTime() - 86_400_000);
  const [sentLast24h, oldest, newest] = await Promise.all([
    ProspectMailJob.countDocuments({ state: "sent", sentAt: { $gte: since } }),
    ProspectMailJob.findOne({ state: "sent", sentAt: { $gte: since } }).sort({ sentAt: 1 }).select("sentAt").lean(),
    ProspectMailJob.findOne({ state: "sent" }).sort({ sentAt: -1 }).select("sentAt gapAfterMs").lean(),
  ]);
  const minS = env.PROSPECT_MIN_GAP_SECONDS;
  const maxS = Math.max(minS, env.PROSPECT_MAX_GAP_SECONDS);
  return {
    sentLast24h,
    oldestInWindow: oldest?.sentAt || null,
    lastSentAt: newest?.sentAt || null,
    lastGapMs: newest?.gapAfterMs ?? null,
    cap: env.PROSPECT_DAILY_CAP,
    minGapMs: minS * 1000,
    avgGapMs: ((minS + maxS) / 2) * 1000,
    window: envSendWindow(),
    instant: env.PROSPECT_INSTANT,
    now,
  };
}

/**
 * The send, dressed for its style. Pure, so the "what does the recipient get"
 * rules are tested without Mongo:
 *
 *   personal  plain text (body + signature), NO html part, NO List-Unsubscribe,
 *             NO footer, NO visible Ref token; From = Yash from SubhSandesh
 *             <yash@subhsandesh.in>; Reply-To = the SES receiving address
 *             (else the From address).
 *   classic   the original multipart email with footer + RFC 8058 headers.
 *
 * Both go out on the quiet lane (PROSPECT_SES_CONFIGURATION_SET), never the
 * domain's default configuration set with its open tracking.
 */
export function buildProspectSendInput(
  style: OutreachStyle,
  m: {
    to: string;
    subject: string;
    body: string;
    token: string;
    instagram: string;
    unsubscribeUrl: string;
    inReplyTo?: string;
    references?: string;
  },
  sender: PersonalSender = personalSender(),
  configurationSet: string = env.PROSPECT_SES_CONFIGURATION_SET
): InfluencerSendInput {
  const base = {
    to: m.to,
    subject: m.subject,
    body: m.body,
    token: m.token,
    inReplyTo: m.inReplyTo,
    references: m.references,
    ...(configurationSet ? { configurationSet } : {}),
  };
  if (style === "personal") {
    return {
      ...base,
      render: () => ({ text: prospectPersonalText({ body: m.body, signature: personalSignature() }), html: "" }),
      fromName: sender.fromName,
      fromAddress: sender.fromAddress,
      replyToAddress: sender.replyToAddress,
    };
  }
  const content = { body: m.body, signature: env.PROSPECT_SIGNATURE, instagram: m.instagram, unsubscribeUrl: m.unsubscribeUrl, token: m.token };
  return {
    ...base,
    render: () => ({ text: prospectMailText(content), html: prospectMailHtml(content) }),
    fromName: env.PROSPECT_FROM_NAME,
    extraHeaders: prospectHeaders(m.unsubscribeUrl, influencerReplyToAddress()),
  };
}

export type TickOutcome =
  | { did: "sent"; jobId: string }
  | { did: "failed" | "skipped"; jobId: string; reason: string }
  | { did: "idle"; reason: string };

/** One step of the queue: send at most one email. Exported for tests and the admin "status". */
export async function processProspectQueueOnce(
  opts: { now?: Date; transport?: MailTransport } = {}
): Promise<TickOutcome> {
  const now = opts.now || new Date();
  lastTickAt = now;

  // Anything left mid-send by a restart: unknown outcome → failed, visibly.
  await ProspectMailJob.updateMany(
    { state: "sending", updatedAt: { $lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    { $set: { state: "failed", live: false, error: "Interrupted mid-send (server restart). Check the conversation before sending again." } }
  );

  if (!opts.transport && influencerSendMode() === "off") return { did: "idle", reason: "SES not configured" };

  const pacing = await pacingNow(now);
  const decision = nextSendDecision(pacing);
  if (!decision.send) return { did: "idle", reason: decision.reason };

  // While SES refuses the personal sender, personal jobs wait (not re-sent
  // from another address); classic jobs carry on. A fresh filter object.
  const paused = personalBlocked && now.getTime() - personalBlocked.at.getTime() < PERSONAL_RETRY_MS;
  const job = await ProspectMailJob.findOneAndUpdate(
    { state: "queued", notBefore: { $lte: now }, ...(paused ? { style: { $ne: "personal" } } : {}) },
    { $set: { state: "sending" }, $inc: { attempts: 1 } },
    { sort: { createdAt: 1 }, new: true }
  );
  if (!job) return { did: "idle", reason: "empty" };
  const jobId = String(job._id);

  const finish = async (state: "sent" | "failed" | "skipped", set: Record<string, unknown> = {}) => {
    await ProspectMailJob.updateOne({ _id: job._id }, { $set: { state, live: false, ...set } });
  };

  const p = await InfluencerProspect.findById(job.prospectId);
  if (!p) {
    await finish("skipped", { error: "Prospect was removed." });
    return { did: "skipped", jobId, reason: "removed" };
  }
  // Re-checked now: an unsubscribe, bounce, complaint or join that landed
  // while this waited always wins; so does a "no" reply, unless the admin
  // explicitly confirmed sending to someone marked not interested.
  const verdict = canEmailProspect(p, now);
  if (!verdict.ok || !verdict.kinds.includes(job.kind) || (verdict.needsConfirm && !job.override)) {
    const reason = !verdict.ok
      ? verdict.reason
      : !verdict.kinds.includes(job.kind)
        ? `A ${job.kind} no longer fits (they can get: ${verdict.kinds.join(", ")}).`
        : "They said they're not interested since this was queued.";
    await finish("skipped", { error: reason });
    return { did: "skipped", jobId, reason };
  }
  const priorFollowups = priorFollowupsOf(p);

  const style = job.style === "personal" ? "personal" : "classic";
  const settings = await getInfluencerSettings();
  const target = { name: p.name, instagram: p.instagram };
  const subject = renderMergeFields(job.subject, target).replace(/[\r\n]+/g, " ").trim();
  const body = renderMergeFields(job.body, target).trim();
  const lint = lintOutreach(subject, body, {
    commissionPercent: settings.defaultCommissionPercent,
    template: { subject: job.subject, body: job.body },
    kind: job.kind,
    style,
    priorFollowups,
  });
  if (!lint.ok) {
    await finish("failed", { error: `Blocked by the spam check: ${lint.errors[0].message}` });
    return { did: "failed", jobId, reason: "lint" };
  }

  const existing = p.threadId ? await EmailThread.findById(p.threadId).lean<IEmailThread>() : null;
  // A follow-up / reply threads under the last message (In-Reply-To +
  // References, "Re:" subject). A NEW email ("fresh") starts its own thread
  // in their inbox — no In-Reply-To — but is still appended to the same
  // conversation here, so their answer to either lands in one place.
  const threading = job.kind === "fresh" || job.kind === "initial"
    ? { inReplyTo: "", references: "" }
    : threadingHeadersFor(
        (existing?.messages || []).map((m) => ({
          direction: m.direction,
          rfcMessageId: m.rfcMessageId,
          rfcMessageIdSource: m.rfcMessageIdSource,
          references: m.references,
        }))
      );
  const token = existing?.threadToken || newThreadToken();
  const unsub = unsubscribeUrl(p.unsubscribeToken);
  const person = personalSender();

  let sent;
  try {
    sent = await sendInfluencerMail(
      buildProspectSendInput(style, {
        to: p.email,
        subject,
        body,
        token,
        instagram: p.instagram,
        unsubscribeUrl: unsub,
        inReplyTo: threading.inReplyTo || undefined,
        references: threading.references || undefined,
      }),
      opts.transport
    );
  } catch (error) {
    if (error instanceof InfluencerMailNotConfiguredError) {
      // Nothing left the building: put it back, untouched.
      await ProspectMailJob.updateOne({ _id: job._id }, { $set: { state: "queued" }, $inc: { attempts: -1 } });
      lastError = error.message;
      return { did: "idle", reason: "SES not configured" };
    }
    const msg = (error as Error)?.message || "unknown error";
    if (style === "personal" && error instanceof SesSendError && isSenderNotAllowedError(msg)) {
      // The IAM policy does not (yet) allow the person's address. Nothing was
      // sent. The job waits — it is never retried from the team address.
      const message = personalSenderBlockedMessage(person.fromAddress);
      personalBlocked = { message, at: now };
      lastError = message;
      await ProspectMailJob.updateOne(
        { _id: job._id },
        { $set: { state: "queued", error: message.slice(0, 600), notBefore: new Date(now.getTime() + PERSONAL_RETRY_MS) }, $inc: { attempts: -1 } }
      );
      return { did: "failed", jobId, reason: "personal_sender_not_allowed" };
    }
    lastError = msg;
    if (error instanceof SesSendError && error.retryable && job.attempts < MAX_ATTEMPTS) {
      await ProspectMailJob.updateOne(
        { _id: job._id },
        { $set: { state: "queued", error: msg.slice(0, 600), notBefore: new Date(now.getTime() + job.attempts * 5 * 60_000) } }
      );
      return { did: "failed", jobId, reason: "retrying" };
    }
    await finish("failed", { error: msg.slice(0, 600) });
    return { did: "failed", jobId, reason: msg };
  }
  lastError = "";
  if (style === "personal") personalBlocked = null;
  if (sent.via === "ses") noteQuietLane(sent, now);

  // Thread opened only after SES accepted, so a refused send leaves nothing.
  let threadId = existing?._id as mongoose.Types.ObjectId | undefined;
  if (!threadId) {
    const opened = await openThread(
      { kind: "prospect", prospectId: String(p._id), userName: p.name, userEmail: p.email, threadToken: token },
      subject
    );
    threadId = opened._id as mongoose.Types.ObjectId;
  }
  await appendMessage(threadId, {
    direction: "outbound",
    subject,
    body,
    html: "",
    byEmail: job.byEmail,
    fromAddress: sent.fromAddress,
    aiAssisted: job.aiAssisted,
    providerMessageId: sent.providerMessageId,
    rfcMessageId: sent.rfcMessageId,
    rfcMessageIdSource: sent.rfcMessageId ? "reconstructed" : "",
    inReplyTo: threading.inReplyTo || "",
    references: threading.references ? threading.references.split(/\s+/) : [],
    source: "ses",
  });

  const set: Record<string, unknown> = { lastContactedAt: now, threadId };
  if (job.kind === "initial") {
    set.initialSentAt = now;
    set.outreachStyle = style;
  }
  const inc: Record<string, number> = { contactCount: 1 };
  if (job.kind === "followup") {
    set.followUpSentAt = now;
    // Rows from before the counter: count the dated follow-up too.
    if (!p.followUpCount && p.followUpSentAt) set.followUpCount = 2;
    else inc.followUpCount = 1;
  }
  if (p.status === "new") set.status = "contacted";
  await InfluencerProspect.updateOne({ _id: p._id }, { $set: set, $inc: inc });
  await finish("sent", {
    sentAt: now,
    providerMessageId: sent.providerMessageId,
    via: sent.via,
    error: "",
    gapAfterMs: pickGapMs(env.PROSPECT_MIN_GAP_SECONDS, env.PROSPECT_MAX_GAP_SECONDS),
  });
  return { did: "sent", jobId };
}

export function prospectQueueHealth() {
  return { lastError, lastTickAt };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Started by server.ts after the DB connects. Idempotent. */
/**
 * Drain whatever pacing allows right now. In instant mode that is the whole
 * queue (up to the cap); in paced mode pacing stops it after one send.
 */
async function drainProspectQueue(): Promise<void> {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const max = env.PROSPECT_INSTANT ? 100 : 5;
    for (let i = 0; i < max; i++) {
      const r = await processProspectQueueOnce();
      if (r.did === "idle") break;
    }
  } catch (err) {
    lastError = (err as Error)?.message || "queue error";
    console.error("Prospect queue tick failed:", lastError);
  } finally {
    running = false;
  }
}

/** Send now instead of waiting for the next tick — called right after Send. */
export function kickProspectQueue(): void {
  void drainProspectQueue();
}

export function startProspectQueue(): void {
  if (timer) return;
  timer = setInterval(() => void drainProspectQueue(), TICK_MS);
  timer.unref?.();
}
