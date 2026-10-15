// ─── Reading and writing conversations ──────────────────────────────────────
//
// The database half of threading. The header arithmetic lives in
// `emailThread.service.ts` and is pure; everything here touches Mongo.
//
// ── THE HARD PART IS INBOUND MATCHING ───────────────────────────────────────
//
// Sending into a thread is easy: we know which thread, we read its ids, we set
// the headers. The difficult direction is a reply ARRIVING and having to be put
// in the right conversation, because the only evidence is what the sender's mail
// client chose to include, and clients vary enormously.
//
// So matching is a ladder, tried in order, most reliable first. Every rung is
// there because some real client fails the one above it:
//
//   1. `In-Reply-To` / `References` against an id we already hold.
//      Correct whenever the client behaved. Note this can match on OUR
//      reconstructed id (see `rfcMessageIdFor`) — if the reconstruction was
//      right, this rung fires and everything downstream is exact.
//
//   2. Same person + same base subject.
//      Catches the case where rung 1 could not fire because the reconstruction
//      was wrong and this is the FIRST reply, so there is no received id yet to
//      match against. This is the rung that makes a wrong guess survivable.
//
//   3. Same person, newest open thread.
//      A client that rewrote the subject entirely, or a person who replied from
//      their phone to a mail we sent about something else. Bounded to a recent
//      window so a reply in December is not stapled to a conversation from
//      March.
//
//   4. Nothing matched: a new thread of `kind: "inbound"`.
//      NOT a discard. The footer of every follow-up says a reply will be read,
//      so a reply that cannot be placed still has to be visible — see the
//      header of `models/EmailThread.ts`.
//
// A reply matched by rung 3 or 4 is marked so the panel can show HOW it was
// matched. A super admin reading a conversation needs to know when a message
// was placed by guesswork.

import mongoose from "mongoose";
import EmailThread, { IEmailThread, IThreadMessage, MessageSource } from "../models/EmailThread";
import {
  baseSubject,
  normalizeMessageId,
  parseMessageIds,
  subjectKey,
} from "./emailThread.service";

/** Rung 3 will not reach further back than this. */
const LOOSE_MATCH_WINDOW_DAYS = 45;

/**
 * A subject that announces itself as a reply.
 *
 * Deliberately narrow — only the prefixes mail clients actually prepend. It
 * must NOT match a subject that merely begins with those letters, or every
 * email titled "Refund request" or "Reference for my page" would be treated as
 * a continuation of whatever that person last wrote about.
 */
const REPLY_PREFIX = /^\s*(?:re|aw|sv|antw|ref|res|r|fw|fwd|forward)\s*(?:\[\d+\])?\s*:/i;

export type MatchRung = "headers" | "token" | "subject" | "sender" | "recent" | "none";

export interface ThreadIdentity {
  kind: "draft" | "feedback" | "inbound" | "influencer";
  userId?: string;
  userName?: string;
  userEmail: string;
  pageId?: string;
  templateType?: string;
  templateLabel?: string;
  /** Influencer threads only: the footer reference. */
  threadToken?: string;
}

/** Every conversation about one page, newest first. Bodies included. */
export async function threadsForPage(pageId: string): Promise<IEmailThread[]> {
  if (!mongoose.Types.ObjectId.isValid(pageId)) return [];
  return EmailThread.find({ pageId: new mongoose.Types.ObjectId(pageId) })
    .sort({ seq: -1 })
    .lean<IEmailThread[]>();
}

/**
 * The thread a "reply in the same conversation" send should go into: the
 * highest-numbered one for this page.
 */
export async function latestThreadForPage(pageId: string): Promise<IEmailThread | null> {
  if (!mongoose.Types.ObjectId.isValid(pageId)) return null;
  return EmailThread.findOne({ pageId: new mongoose.Types.ObjectId(pageId) })
    .sort({ seq: -1 })
    .lean<IEmailThread>();
}

/**
 * Create the next conversation about a page.
 *
 * `seq` is derived from what already exists, and the unique index on
 * `threadKey` is what actually makes it safe: two simultaneous sends both
 * reading seq=1 would both try to write `draft:<page>:2`, and the second gets a
 * duplicate-key error rather than a second thread with the same number. The
 * caller retries.
 */
export async function openThread(
  identity: ThreadIdentity,
  subject: string
): Promise<IEmailThread> {
  const base = baseSubject(subject);

  let seq = 1;
  let keyPrefix: string;

  if (identity.kind === "influencer" && identity.userId && mongoose.Types.ObjectId.isValid(identity.userId)) {
    // One conversation per influencer, numbered the same way page threads
    // are, and made race-safe by the same unique `threadKey`.
    const newest = await EmailThread.findOne({
      kind: "influencer",
      userId: new mongoose.Types.ObjectId(identity.userId),
    })
      .sort({ seq: -1 })
      .select("seq")
      .lean<{ seq: number }>();
    seq = (newest?.seq || 0) + 1;
    keyPrefix = `influencer:${identity.userId}`;
  } else if (identity.pageId && mongoose.Types.ObjectId.isValid(identity.pageId)) {
    const newest = await EmailThread.findOne({ pageId: new mongoose.Types.ObjectId(identity.pageId) })
      .sort({ seq: -1 })
      .select("seq")
      .lean<{ seq: number }>();
    seq = (newest?.seq || 0) + 1;
    keyPrefix = `${identity.kind}:${identity.pageId}`;
  } else {
    // No page to key on — an inbound reply we could not place. The message id
    // is already unique, so the caller passes it in as the subject-side key.
    keyPrefix = `${identity.kind}:${new mongoose.Types.ObjectId().toString()}`;
  }

  return EmailThread.create({
    threadKey: `${keyPrefix}:${seq}`,
    kind: identity.kind,
    userId: identity.userId && mongoose.Types.ObjectId.isValid(identity.userId)
      ? new mongoose.Types.ObjectId(identity.userId)
      : undefined,
    userName: identity.userName || "",
    userEmail: (identity.userEmail || "").toLowerCase(),
    pageId: identity.pageId && mongoose.Types.ObjectId.isValid(identity.pageId)
      ? new mongoose.Types.ObjectId(identity.pageId)
      : undefined,
    templateType: identity.templateType || "",
    templateLabel: identity.templateLabel || "",
    subject: base,
    subjectKey: subjectKey(base),
    seq,
    ...(identity.threadToken ? { threadToken: identity.threadToken } : {}),
    messages: [],
    messageCount: 0,
    lastMessageAt: new Date(),
    lastDirection: "outbound",
    unread: false,
    status: "open",
  });
}

export interface AppendInput {
  direction: "outbound" | "inbound";
  subject: string;
  body: string;
  rawBody?: string;
  html?: string;
  at?: Date;
  byEmail?: string;
  /** The address the message left FROM. Outbound only. */
  fromAddress?: string;
  aiAssisted?: boolean;
  providerMessageId?: string;
  rfcMessageId?: string;
  rfcMessageIdSource?: "received" | "reconstructed" | "";
  inReplyTo?: string;
  references?: string[];
  source: MessageSource;
  trimmed?: boolean;
}

/**
 * Add one message to a thread and roll up the denormalised fields.
 *
 * `$push` plus `$set` in a single update rather than load-mutate-save: two
 * sends landing at once must both be recorded, and a `save()` of a stale
 * document would drop one of them.
 */
export async function appendMessage(
  threadId: mongoose.Types.ObjectId | string,
  input: AppendInput
): Promise<void> {
  const at = input.at || new Date();
  const message: Partial<IThreadMessage> = {
    direction: input.direction,
    subject: input.subject || "",
    body: input.body || "",
    rawBody: input.rawBody || "",
    html: input.html || "",
    at,
    byEmail: (input.byEmail || "").toLowerCase(),
    fromAddress: (input.fromAddress || "").toLowerCase(),
    aiAssisted: input.aiAssisted === true,
    providerMessageId: input.providerMessageId || "",
    rfcMessageId: normalizeMessageId(input.rfcMessageId || ""),
    rfcMessageIdSource: input.rfcMessageIdSource || "",
    inReplyTo: normalizeMessageId(input.inReplyTo || ""),
    references: (input.references || []).map(normalizeMessageId).filter(Boolean),
    source: input.source,
    trimmed: input.trimmed === true,
  };

  await EmailThread.updateOne(
    { _id: threadId },
    {
      $push: { messages: message as IThreadMessage },
      $inc: { messageCount: 1 },
      $set: {
        lastMessageAt: at,
        lastDirection: input.direction,
        // An inbound message is unread until somebody opens the thread. An
        // outbound one clears it: we have just read it in order to reply.
        unread: input.direction === "inbound",
      },
    }
  );
}

export interface InboundEvidence {
  fromEmail: string;
  subject: string;
  inReplyTo: string;
  references: string;
  messageId: string;
}

export interface InboundMatch {
  thread: IEmailThread | null;
  rung: MatchRung;
}

/**
 * Which conversation an arriving reply belongs to. See the header for the ladder.
 *
 * Returns `{ thread: null, rung: "none" }` when nothing matched — the caller
 * opens an inbound thread rather than dropping the message.
 */
export async function matchInboundThread(ev: InboundEvidence): Promise<InboundMatch> {
  const from = String(ev.fromEmail || "").trim().toLowerCase();

  // ── Rung 1: the headers ────────────────────────────────────────────────
  const candidates = [
    ...parseMessageIds(ev.inReplyTo),
    // Newest ancestor first: References is oldest-to-newest, and the nearest
    // ancestor is the most likely to identify the right conversation when a
    // person has several.
    ...parseMessageIds(ev.references).reverse(),
  ];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = await EmailThread.findOne({ "messages.rfcMessageId": id }).lean<IEmailThread>();
    if (hit) return { thread: hit, rung: "headers" };
  }

  if (!from) return { thread: null, rung: "none" };

  // ── Rung 2: same person, same subject ──────────────────────────────────
  const key = subjectKey(ev.subject);
  if (key) {
    // A fresh filter object per query, never a shared one — and influencer
    // threads are out of reach here: mail to feedback@ / the general reply
    // inbox that merely comes from an influencer's address is about their
    // pages, not the programme. Influencer mail has its own ladder below.
    const hit = await EmailThread.findOne({ userEmail: from, subjectKey: key, kind: { $ne: "influencer" } })
      .sort({ lastMessageAt: -1 })
      .lean<IEmailThread>();
    if (hit) return { thread: hit, rung: "subject" };
  }

  // ── Rung 3: same person, a recent open conversation ────────────────────
  //
  // ONLY for messages that look like replies. This guard was missing, and its
  // absence was a real bug: somebody who already had an open conversation and
  // then wrote to feedback@ about something completely different — new subject,
  // no quoted history — had that new message appended to the old thread. The
  // conversation then held two unrelated topics, and the AI drafter, which is
  // given the whole thread, would answer a mixture of both.
  //
  // "Looks like a reply" means one of:
  //   · the subject carries a Re:/Fwd: prefix, or
  //   · it has In-Reply-To or References headers that simply did not match
  //     anything we hold — which is precisely the case rung 3 exists for: a
  //     genuine reply whose parent id we never learned, because SES never told
  //     us the Message-ID it wrote.
  //
  // A fresh subject with no threading headers at all is a NEW topic. It gets
  // its own thread, which is both more accurate and easier to correct — two
  // threads can be read separately, whereas one thread holding two topics
  // cannot be pulled apart.
  const looksLikeReply =
    REPLY_PREFIX.test(String(ev.subject || "")) ||
    parseMessageIds(ev.inReplyTo).length > 0 ||
    parseMessageIds(ev.references).length > 0;

  if (looksLikeReply) {
    const since = new Date(Date.now() - LOOSE_MATCH_WINDOW_DAYS * 86_400_000);
    const recent = await EmailThread.findOne({
      userEmail: from,
      kind: { $ne: "influencer" },
      status: "open",
      lastMessageAt: { $gte: since },
    })
      .sort({ lastMessageAt: -1 })
      .lean<IEmailThread>();
    if (recent) return { thread: recent, rung: "recent" };
  }

  return { thread: null, rung: "none" };
}

/** Has this exact message already been recorded? SNS delivers at-least-once. */
export async function inboundAlreadyStored(rfcMessageId: string): Promise<boolean> {
  const id = normalizeMessageId(rfcMessageId);
  if (!id) return false;
  const hit = await EmailThread.findOne({ "messages.rfcMessageId": id }).select("_id").lean();
  return !!hit;
}

// ─── Influencer mail: its own ladder ────────────────────────────────────────
//
// Mail ADDRESSED to an influencer address (influencer-support@, or the
// receiving alias it forwards to) is matched here instead of above. The rungs
// differ because the population differs: every legitimate sender is a known
// influencer with exactly one conversation, so "same person" is strong
// evidence on its own and needs no reply-shaped guard.
//
//   1. headers — In-Reply-To / References against an id we hold (any kind:
//      an exact header match is never wrong).
//   2. token   — the `Ref: INF-XXXXXXXX` from our footer, found in the
//      subject or the quoted history. Survives a client that strips headers
//      AND a reply from a different address.
//   3. sender  — the newest influencer thread for this address.
//   4. sender  — no thread yet, but the address belongs to an influencer:
//      `influencerUser` is returned and the caller opens their thread.
//   5. none    — an unmatched inbound thread, as for any other mail.
//
// The lookups are injected so the ladder is tested without Mongo.

export interface InfluencerMatchDeps {
  byMessageId(id: string): Promise<IEmailThread | null>;
  byToken(token: string): Promise<IEmailThread | null>;
  latestForEmail(email: string): Promise<IEmailThread | null>;
  influencerUserByEmail(email: string): Promise<{ _id: unknown; name?: string; email: string } | null>;
}

export interface InfluencerInboundEvidence extends InboundEvidence {
  /** The token pulled from subject/body by the caller, or "". */
  token: string;
}

export interface InfluencerMatch extends InboundMatch {
  /** Set on rung 4: the influencer whose first thread must be opened. */
  influencerUser?: { _id: unknown; name?: string; email: string } | null;
}

export const mongoInfluencerMatchDeps: InfluencerMatchDeps = {
  byMessageId: (id) => EmailThread.findOne({ "messages.rfcMessageId": id }).lean<IEmailThread>(),
  byToken: (token) => EmailThread.findOne({ threadToken: token }).lean<IEmailThread>(),
  latestForEmail: (email) =>
    EmailThread.findOne({ kind: "influencer", userEmail: email })
      .sort({ lastMessageAt: -1 })
      .lean<IEmailThread>(),
  influencerUserByEmail: async (email) => {
    // Imported lazily: the model pulls in the whole user schema, and the
    // pure parts of this module are imported by tests that never touch Mongo.
    const { default: User } = await import("../models/User");
    return User.findOne({ email, influencer: { $exists: true, $ne: null } })
      .select("_id name email")
      .lean<{ _id: unknown; name?: string; email: string }>();
  },
};

export async function matchInfluencerInbound(
  ev: InfluencerInboundEvidence,
  deps: InfluencerMatchDeps = mongoInfluencerMatchDeps
): Promise<InfluencerMatch> {
  const from = String(ev.fromEmail || "").trim().toLowerCase();

  const seen = new Set<string>();
  for (const id of [...parseMessageIds(ev.inReplyTo), ...parseMessageIds(ev.references).reverse()]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const hit = await deps.byMessageId(id);
    if (hit) return { thread: hit, rung: "headers" };
  }

  if (ev.token) {
    const hit = await deps.byToken(ev.token);
    if (hit) return { thread: hit, rung: "token" };
  }

  if (!from) return { thread: null, rung: "none" };

  const latest = await deps.latestForEmail(from);
  if (latest) return { thread: latest, rung: "sender" };

  const user = await deps.influencerUserByEmail(from);
  if (user) return { thread: null, rung: "sender", influencerUser: user };

  return { thread: null, rung: "none" };
}
