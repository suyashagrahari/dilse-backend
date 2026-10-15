// ─── Reading replies out of the shared mailbox ──────────────────────────────
//
// The second, and simpler, way a creator's reply reaches the panel. The SES
// webhook (`controllers/sesInbound.controller.ts`) needs an MX record on a
// subdomain and a forwarding rule; this needs one password.
//
// ── HOW THE MAIL ACTUALLY ARRIVES ──────────────────────────────────────────
//
//   creator replies  →  feedback@subhsandesh.in
//                       (an ALIAS at GoDaddy, no mailbox of its own)
//                    →  support@subhsandesh.in
//                       (the real mailbox — also read by a person)
//                    →  this poller, over IMAP, read-only
//
// Two consequences follow from that shape, and both are the whole design:
//
//   1. THE MAILBOX IS SOMEBODY'S INBOX. It is opened read-only, nothing is
//      marked read, moved or deleted. A poller that marked mail seen would
//      silently hide a customer's reply from the person whose job is to read
//      it. Position is remembered in `MailPollState` instead.
//
//   2. IT IS A SHARED INBOX. Ordinary support mail sits in it too. Only mail
//      ADDRESSED to a filter address is ingested — without that, every support
//      email would become an unmatched "conversation" in the admin panel. See
//      `addressedToFilter`, which is the one piece of logic here worth testing
//      hard, because both of its failure directions are bad: too strict and
//      replies never appear, too loose and unrelated mail does.
//
// ── FAILURE POSTURE ────────────────────────────────────────────────────────
//
// Nothing here may take the API down. A wrong password, a mailbox that has been
// renamed, GoDaddy being briefly unreachable — all of it is caught, recorded on
// the state document so the admin panel can show it, and retried on the next
// tick. Mail is not urgent; the server being up is.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "../config/env";
import { threadReplyToAddress } from "./ses.service";
import MailPollState from "../models/MailPollState";
import { ingestInboundMail, inboundText, RECIPIENT_HEADERS } from "./inboundIngest.service";
import { influencerInboundAddresses } from "./influencerMail.service";
/** Per tick. A backlog is worked through over several ticks rather than at once. */
const MAX_PER_RUN = 40;
/** First run on an empty watermark looks back this far, not to the beginning. */
const FIRST_RUN_LOOKBACK_DAYS = 14;

export function imapConfigured(): boolean {
  return !!env.IMAP_HOST && !!env.IMAP_USER && !!env.IMAP_PASSWORD;
}

/**
 * One mailbox to watch.
 *
 * There can be two: the shared support@ inbox (IMAP_*), and the dedicated
 * influencer-support@ mailbox (INFLUENCER_IMAP_*). Each keeps its own
 * watermark — `MailPollState` is keyed by host, user and folder.
 */
export interface MailboxConfig {
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  mailbox: string;
  /** Only mail addressed to one of these is ingested. */
  filter: string[];
}

export function primaryMailbox(): MailboxConfig {
  return {
    label: "support",
    host: env.IMAP_HOST,
    port: env.IMAP_PORT,
    user: env.IMAP_USER,
    password: env.IMAP_PASSWORD,
    mailbox: env.IMAP_MAILBOX,
    filter: filterAddresses(),
  };
}

export function influencerImapConfigured(): boolean {
  return !!env.INFLUENCER_IMAP_HOST && !!env.INFLUENCER_IMAP_USER && !!env.INFLUENCER_IMAP_PASSWORD;
}

export function influencerMailbox(): MailboxConfig {
  return {
    label: "influencer",
    host: env.INFLUENCER_IMAP_HOST,
    port: env.INFLUENCER_IMAP_PORT,
    user: env.INFLUENCER_IMAP_USER,
    password: env.INFLUENCER_IMAP_PASSWORD,
    mailbox: env.INFLUENCER_IMAP_MAILBOX,
    // A dedicated mailbox, but still filtered: a newsletter or a GoDaddy
    // notice sitting in it is not an influencer writing to us.
    filter: [...new Set([...influencerInboundAddresses(), env.INFLUENCER_IMAP_USER.toLowerCase()])].filter(Boolean),
  };
}

/** The addresses whose mail we want out of the shared inbox. */
export function filterAddresses(): string[] {
  return String(env.IMAP_FILTER_TO || "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Was this message addressed to one of our filter addresses?
 *
 * Alias delivery does not put the alias anywhere consistent. GoDaddy keeps the
 * original `To`, but other providers rewrite it and record the original in
 * `Delivered-To` or `X-Original-To`, and a message can reach an alias via `Cc`
 * or `Bcc` (where it appears in none of them, hence the envelope).
 *
 * So every plausible header is checked, and the match is on the ADDRESS not the
 * raw string: `"SubhSandesh Feedback" <feedback@subhsandesh.in>` and
 * `feedback@subhsandesh.in` are the same recipient, and a message merely
 * MENTIONING the address in its subject or body is not addressed to it.
 */
export function addressedToFilter(
  headers: Record<string, string>,
  wanted: string[]
): boolean {
  if (wanted.length === 0) return false;

  const fields = [
    "to", "cc", "bcc",
    "delivered-to", "x-original-to", "envelope-to", "x-envelope-to",
    "x-forwarded-to", "resent-to", "x-rcpt-to",
  ];

  for (const field of fields) {
    const raw = headers[field];
    if (!raw) continue;
    // Every address in the value, not the value itself: a header holding three
    // recipients must match on any one of them.
    const found = String(raw).toLowerCase().match(/[^\s<>,;"()]+@[^\s<>,;"()]+\.[^\s<>,;"()]+/g);
    if (!found) continue;
    for (const addr of found) {
      if (wanted.includes(addr.replace(/[.,;]+$/, ""))) return true;
    }
  }
  return false;
}

/** mailparser's header map flattened to lowercase name → string. */
function flattenHeaders(map: Map<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of map.entries()) {
    const key = String(k).toLowerCase();
    if (v === undefined || v === null) continue;
    if (typeof v === "string") out[key] = v;
    else if (Array.isArray(v)) out[key] = v.map((x) => String(x)).join(" ");
    else {
      const obj = v as { text?: string };
      out[key] = typeof obj.text === "string" ? obj.text : String(v);
    }
  }
  return out;
}

/**
 * Who wrote it, ignoring our own addresses.
 *
 * Our own address appears as the sender on anything we sent that is sitting in
 * the same mailbox, and attributing that to a creator would show us writing to
 * ourselves inside their conversation.
 */
export function senderFrom(headers: Record<string, string>, ours: string[]): string {
  for (const field of ["reply-to", "from", "return-path", "sender"]) {
    const raw = headers[field];
    if (!raw) continue;
    const found = String(raw).toLowerCase().match(/[^\s<>,;"()]+@[^\s<>,;"()]+\.[^\s<>,;"()]+/g);
    if (!found) continue;
    for (const addr of found) {
      const clean = addr.replace(/[.,;]+$/, "");
      if (ours.includes(clean)) continue;
      return clean;
    }
  }
  return "";
}

const stateKeyFor = (c: MailboxConfig) => `${c.host}:${c.user}:${c.mailbox}`;
const stateKey = () => stateKeyFor(primaryMailbox());

export interface PollResult {
  outcome: "ok" | "skipped" | "error";
  stored: number;
  skipped: number;
  error?: string;
}

/**
 * One pass over the mailbox. Safe to call repeatedly; safe to call twice at
 * once — a message already recorded is recognised by its `Message-ID`.
 */
export async function pollOnce(cfg: MailboxConfig = primaryMailbox()): Promise<PollResult> {
  if (!cfg.host || !cfg.user || !cfg.password) return { outcome: "skipped", stored: 0, skipped: 0 };

  const key = stateKeyFor(cfg);
  const wanted = cfg.filter;
  // Every address that is us, so our own sent mail is never read back in as a
  // creator's reply.
  const ours = [
    String(env.SES_FROM_EMAIL || "").toLowerCase(),
    // The address our outbound mail asks for replies at. `senderFrom` prefers
    // `Reply-To`, and that is now one of ours, so a copy of our own mail
    // sitting in this shared inbox would otherwise be read back as a creator
    // writing to themselves inside their own conversation.
    String(env.SES_REPLY_TO_EMAIL || "").toLowerCase(),
    String(env.IMAP_USER || "").toLowerCase(),
    String(cfg.user || "").toLowerCase(),
    ...influencerInboundAddresses(),
    ...wanted,
  ].filter(Boolean);

  let stored = 0;
  let skipped = 0;

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    // Without this a hung TLS handshake keeps the tick alive forever and the
    // interval stacks up connections.
    socketTimeout: 45_000,
  });

  try {
    await client.connect();
    // READ-ONLY. See the header: this is a person's inbox.
    const box = await client.mailboxOpen(cfg.mailbox, { readOnly: true });

    const state = await MailPollState.findOne({ key }).lean();
    const serverValidity = String(box.uidValidity ?? "");

    let lastUid = state?.lastUid || 0;
    if (state && state.uidValidity && state.uidValidity !== serverValidity) {
      // The mailbox was recreated; old UIDs mean nothing now and may have been
      // reused. Starting from 0 risks re-reading, which the Message-ID check
      // absorbs — skipping real mail would not be absorbed by anything.
      console.warn(
        `IMAP uidValidity changed (${state.uidValidity} → ${serverValidity}); resetting the watermark`
      );
      lastUid = 0;
    }

    // A first run must not ingest years of history. Date-bounded instead.
    const range = lastUid > 0 ? `${lastUid + 1}:*` : "1:*";
    const searchCriteria = lastUid > 0
      ? { uid: range }
      : { since: new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000) };

    const uids = (await client.search(searchCriteria, { uid: true })) || [];
    // `1:*` always returns at least the newest message even when nothing is
    // new, so anything at or below the watermark is dropped here.
    const fresh = uids.filter((u) => Number(u) > lastUid).sort((a, b) => Number(a) - Number(b));
    const batch = fresh.slice(0, MAX_PER_RUN);

    let highest = lastUid;

    for (const uid of batch) {
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) { skipped++; highest = Math.max(highest, Number(uid)); continue; }

        const parsed = await simpleParser(msg.source);
        const headers = flattenHeaders(parsed.headers as Map<string, unknown>);

        if (!addressedToFilter(headers, wanted)) {
          skipped++;
          highest = Math.max(highest, Number(uid));
          continue;
        }

        const fromEmail = senderFrom(headers, ours);
        if (!fromEmail) {
          // Addressed to feedback@ but apparently from us. Our own copy, or a
          // bounce notification. Not a creator's reply.
          skipped++;
          highest = Math.max(highest, Number(uid));
          continue;
        }

        const result = await ingestInboundMail({
          fromEmail,
          fromName: parsed.from?.value?.[0]?.name || "",
          subject: String(parsed.subject || ""),
          text: inboundText(parsed),
          messageId: parsed.messageId || headers["message-id"] || "",
          inReplyTo: headers["in-reply-to"] || "",
          references: headers["references"] || "",
          at: parsed.date || new Date(),
          recipients: RECIPIENT_HEADERS.map((h) => headers[h] || "").filter(Boolean),
        });
        if (result.outcome === "duplicate") {
          skipped++;
          highest = Math.max(highest, Number(uid));
          continue;
        }
        console.log(`IMAP[${cfg.label}]: stored a reply from ${fromEmail} (route: ${result.route}, matched by: ${result.rung})`);
        stored++;
        highest = Math.max(highest, Number(uid));
      } catch (error) {
        // One unparseable message must not stop the batch, and must not be
        // retried forever — the watermark moves past it.
        console.error(`IMAP: could not process uid ${uid}:`, error);
        skipped++;
        highest = Math.max(highest, Number(uid));
      }
    }

    await MailPollState.updateOne(
      { key },
      {
        $set: {
          lastUid: highest,
          uidValidity: serverValidity,
          lastRunAt: new Date(),
          lastOkAt: new Date(),
          lastError: "",
        },
        $inc: { totalStored: stored, totalSkipped: skipped },
      },
      { upsert: true }
    );

    if (fresh.length > batch.length) {
      console.log(`IMAP: ${fresh.length - batch.length} message(s) left for the next pass`);
    }
    return { outcome: "ok", stored, skipped };
  } catch (error) {
    const message = (error as Error)?.message || "unknown IMAP error";
    console.error("IMAP poll failed:", message);
    await MailPollState.updateOne(
      { key },
      { $set: { lastRunAt: new Date(), lastError: message.slice(0, 1000) } },
      { upsert: true }
    ).catch(() => {});
    return { outcome: "error", stored, skipped, error: message };
  } finally {
    try { await client.logout(); } catch { /* already gone */ }
  }
}

const timers: NodeJS.Timeout[] = [];

function startLoop(cfg: MailboxConfig): void {
  const seconds = Math.max(30, env.IMAP_POLL_SECONDS || 120);
  console.log(
    `IMAP poller[${cfg.label}]: watching ${cfg.user} every ${seconds}s for mail to ${cfg.filter.join(", ")}`
  );

  let running = false;
  const tick = async () => {
    // Overlap guard. A slow pass must not have a second one started on top of
    // it — two passes would fetch the same UIDs and race on the watermark.
    if (running) return;
    running = true;
    try {
      await pollOnce(cfg);
    } catch (error) {
      console.error(`IMAP poller[${cfg.label}] tick threw:`, error);
    } finally {
      running = false;
    }
  };

  // A short delay, not immediate: the process is still opening its Mongo
  // connection when this is called.
  setTimeout(tick, 8000);
  const timer = setInterval(tick, seconds * 1000);
  // Do not hold the process open on its own account.
  timer.unref?.();
  timers.push(timer);
}

/** Start the loops. A no-op for each mailbox that is not configured. */
export function startImapPoller(): void {
  if (timers.length) return;
  if (imapConfigured()) startLoop(primaryMailbox());
  else console.log("IMAP poller: not configured, replies must be pasted in by hand");

  if (influencerImapConfigured()) {
    const cfg = influencerMailbox();
    // Same login as the primary loop means the same mailbox — one loop
    // already reads it, and the recipient routing sorts influencer mail out.
    if (!imapConfigured() || stateKeyFor(cfg) !== stateKey()) startLoop(cfg);
  }
}

export function stopImapPoller(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}

/**
 * Is the SES receiving webhook armed?
 *
 * Only the token matters. Without it `sesInboundWebhook` answers 404 to
 * everything, so an unset token means the route is closed regardless of what
 * DNS says. The topic ARN is an additional restriction, not an enabler.
 */
export function sesInboundConfigured(): boolean {
  return !!env.SES_INBOUND_TOKEN;
}

/**
 * "Will a reply appear on its own, or does somebody have to paste it?"
 *
 * There are TWO independent ways in — this poller, and the SES receiving
 * webhook — and the panel needs the answer for EITHER. The first version of
 * this asked only about IMAP, which meant a deployment that had done all the
 * DNS work for SES receiving would still be told to paste replies in by hand,
 * and would still be offered a paste box for messages already arriving on
 * their own. Reporting one mechanism when two exist is worse than reporting
 * none, because it is confidently wrong.
 */
export async function inboundStatus() {
  const imap = imapConfigured();
  const webhook = sesInboundConfigured();

  const mechanisms: string[] = [];
  if (webhook) mechanisms.push("ses-webhook");
  if (imap) mechanisms.push("imap");

  return {
    // The spread goes FIRST, deliberately. `imapStatus()` returns its own
    // `configured` describing IMAP alone; spreading it afterwards overwrote the
    // combined value below, so a deployment with the webhook on and IMAP off
    // reported itself as not configured — the exact bug this function exists
    // to fix. tsc caught it; the ordering is load-bearing.
    ...(imap ? await imapStatus() : { filterAddresses: filterAddresses() }),
    configured: imap || webhook,
    mechanisms,
    // The address creators are actually TOLD to reply to.
    //
    // `filterAddresses` above describes the IMAP filter, which is a different
    // thing and only meaningful when IMAP is the mechanism. Showing that as
    // "where replies arrive" is how the earlier mismatch stayed hidden: the
    // panel named feedback@ while mail was being received on the reply
    // subdomain, so the two halves could disagree without anyone seeing it.
    replyToAddress: threadReplyToAddress(),
    // The webhook delivers in seconds; the poller on its interval. Reported so
    // the panel can promise the right thing rather than a guess.
    etaSeconds: webhook ? 15 : imap ? Math.max(30, env.IMAP_POLL_SECONDS || 120) : 0,
  };
}

/** IMAP detail only. Prefer `inboundStatus` — see the note there. */
export async function imapStatus() {
  const configured = imapConfigured();
  if (!configured) return { configured, filterAddresses: filterAddresses() };
  const state = await MailPollState.findOne({ key: stateKey() }).lean();
  return {
    configured,
    user: env.IMAP_USER,
    mailbox: env.IMAP_MAILBOX,
    filterAddresses: filterAddresses(),
    pollSeconds: Math.max(30, env.IMAP_POLL_SECONDS || 120),
    lastRunAt: state?.lastRunAt || null,
    lastOkAt: state?.lastOkAt || null,
    lastError: state?.lastError || "",
    totalStored: state?.totalStored || 0,
    totalSkipped: state?.totalSkipped || 0,
  };
}

/**
 * "Will an influencer's reply appear in the chat on its own?"
 *
 * Three ways it can: the dedicated mailbox is polled; the shared support@
 * poller's filter includes an influencer address (influencer-support@ set up
 * as an alias into support@); or the SES webhook is armed AND an influencer
 * address lives on the receiving subdomain (a forwarding target, or the
 * Reply-To itself). Anything else means the panel must say "not configured".
 */
export async function influencerInboundStatus() {
  const addresses = influencerInboundAddresses();
  const replyDomain = (env.SES_REPLY_TO_EMAIL.split("@")[1] || "").toLowerCase();
  const apex = (influencerInboundAddresses()[0] || "").split("@")[1] || "";

  const mechanisms: string[] = [];
  let state: { lastOkAt: Date | null; lastError: string } | null = null;

  if (influencerImapConfigured()) {
    mechanisms.push("imap-influencer");
    const row = await MailPollState.findOne({ key: stateKeyFor(influencerMailbox()) }).lean();
    state = { lastOkAt: row?.lastOkAt || null, lastError: row?.lastError || "" };
  }
  if (imapConfigured() && filterAddresses().some((a) => addresses.includes(a))) {
    mechanisms.push("imap-shared");
  }
  const onReceivingDomain = addresses.some((a) => {
    const d = a.split("@")[1] || "";
    return !!d && d !== apex && (d === replyDomain || d.startsWith("reply."));
  });
  if (sesInboundConfigured() && onReceivingDomain) mechanisms.push("ses-webhook");

  return {
    configured: mechanisms.length > 0,
    mechanisms,
    addresses,
    lastOkAt: state?.lastOkAt || null,
    lastError: state?.lastError || "",
    etaSeconds: mechanisms.includes("ses-webhook") ? 15 : mechanisms.length ? Math.max(30, env.IMAP_POLL_SECONDS || 120) : 0,
  };
}
