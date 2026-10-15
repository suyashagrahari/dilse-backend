// ─── The prospect send queue ─────────────────────────────────────────────────
//
// Sends ProspectMailJob rows one at a time: never faster than one per
// PROSPECT_MIN_GAP_SECONDS, never more than PROSPECT_DAILY_CAP in any rolling
// 24 hours. A new domain identity sending 50 cold emails in a minute is the
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
  type MailTransport,
} from "./influencerMail.service";
import {
  canEmailProspect,
  lintOutreach,
  nextSendDecision,
  prospectHeaders,
  prospectMailHtml,
  prospectMailText,
  renderMergeFields,
  unsubscribeUrl,
  type PacingInput,
} from "./prospectMail.service";
import { getInfluencerSettings } from "./influencer.service";

const STALE_SENDING_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const TICK_MS = 15_000;

let lastError = "";
let lastTickAt: Date | null = null;

export async function pacingNow(now: Date = new Date()): Promise<PacingInput> {
  const since = new Date(now.getTime() - 86_400_000);
  const [sentLast24h, oldest, newest] = await Promise.all([
    ProspectMailJob.countDocuments({ state: "sent", sentAt: { $gte: since } }),
    ProspectMailJob.findOne({ state: "sent", sentAt: { $gte: since } }).sort({ sentAt: 1 }).select("sentAt").lean(),
    ProspectMailJob.findOne({ state: "sent" }).sort({ sentAt: -1 }).select("sentAt").lean(),
  ]);
  return {
    sentLast24h,
    oldestInWindow: oldest?.sentAt || null,
    lastSentAt: newest?.sentAt || null,
    cap: env.PROSPECT_DAILY_CAP,
    minGapMs: env.PROSPECT_MIN_GAP_SECONDS * 1000,
    now,
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

  const job = await ProspectMailJob.findOneAndUpdate(
    { state: "queued", notBefore: { $lte: now } },
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
  const verdict = canEmailProspect(p, now);
  if (!verdict.ok || verdict.kind !== job.kind) {
    const reason = verdict.ok ? `They are now due a ${verdict.kind}, not a ${job.kind}.` : verdict.reason;
    await finish("skipped", { error: reason });
    return { did: "skipped", jobId, reason };
  }

  const settings = await getInfluencerSettings();
  const target = { name: p.name, instagram: p.instagram };
  const subject = renderMergeFields(job.subject, target).replace(/[\r\n]+/g, " ").trim();
  const body = renderMergeFields(job.body, target).trim();
  const lint = lintOutreach(subject, body, {
    commissionPercent: settings.defaultCommissionPercent,
    template: { subject: job.subject, body: job.body },
    kind: job.kind,
  });
  if (!lint.ok) {
    await finish("failed", { error: `Blocked by the spam check: ${lint.errors[0].message}` });
    return { did: "failed", jobId, reason: "lint" };
  }

  const existing = p.threadId ? await EmailThread.findById(p.threadId).lean<IEmailThread>() : null;
  const threading = threadingHeadersFor(
    (existing?.messages || []).map((m) => ({
      direction: m.direction,
      rfcMessageId: m.rfcMessageId,
      rfcMessageIdSource: m.rfcMessageIdSource,
      references: m.references,
    }))
  );
  const token = existing?.threadToken || newThreadToken();
  const unsub = unsubscribeUrl(p.unsubscribeToken);
  const content = { body, signature: env.PROSPECT_SIGNATURE, instagram: p.instagram, unsubscribeUrl: unsub, token };

  let sent;
  try {
    sent = await sendInfluencerMail(
      {
        to: p.email,
        subject,
        body,
        token,
        inReplyTo: threading.inReplyTo,
        references: threading.references,
        render: () => ({ text: prospectMailText(content), html: prospectMailHtml(content) }),
        fromName: env.PROSPECT_FROM_NAME,
        extraHeaders: prospectHeaders(unsub, influencerReplyToAddress()),
      },
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
    inReplyTo: threading.inReplyTo,
    references: threading.references ? threading.references.split(/\s+/) : [],
    source: "ses",
  });

  const set: Record<string, unknown> = { lastContactedAt: now, threadId };
  if (job.kind === "initial") set.initialSentAt = now;
  if (job.kind === "followup") set.followUpSentAt = now;
  if (p.status === "new") set.status = "contacted";
  await InfluencerProspect.updateOne({ _id: p._id }, { $set: set, $inc: { contactCount: 1 } });
  await finish("sent", { sentAt: now, providerMessageId: sent.providerMessageId, via: sent.via, error: "" });
  return { did: "sent", jobId };
}

export function prospectQueueHealth() {
  return { lastError, lastTickAt };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Started by server.ts after the DB connects. Idempotent. */
export function startProspectQueue(): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (running || mongoose.connection.readyState !== 1) return;
    running = true;
    try {
      // Drain whatever is allowed right now; pacing stops it after one send
      // unless the gap is tiny, so this is one email per tick in practice.
      for (let i = 0; i < 5; i++) {
        const r = await processProspectQueueOnce();
        if (r.did === "idle") break;
      }
    } catch (err) {
      lastError = (err as Error)?.message || "queue error";
      console.error("Prospect queue tick failed:", lastError);
    } finally {
      running = false;
    }
  }, TICK_MS);
  timer.unref?.();
}
