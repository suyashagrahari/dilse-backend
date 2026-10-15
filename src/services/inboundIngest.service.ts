// ─── One arriving email → one stored message ────────────────────────────────
//
// Both inbound mechanisms — the SES receiving webhook and the IMAP poller —
// end the same way: dedupe on Message-ID, decide which conversation it
// belongs to, open an "Unmatched" thread if none, append. That tail used to be
// written out twice; it lives here once so influencer routing cannot be added
// to one path and forgotten in the other.
//
// ── ROUTING ────────────────────────────────────────────────────────────────
//
// The one decision added for influencer mail: was this ADDRESSED to an
// influencer address? If so it is matched with `matchInfluencerInbound`
// (which knows every legitimate sender is a programme member); otherwise with
// the general ladder, which in turn never reaches into influencer threads.
// Routing is by recipient, not sender, because an influencer who also makes
// pages can write to feedback@ about a page and that is not programme mail.

import mongoose from "mongoose";
import {
  appendMessage,
  inboundAlreadyStored,
  matchInboundThread,
  matchInfluencerInbound,
  openThread,
  type MatchRung,
} from "./threadStore.service";
import { normalizeMessageId, parseMessageIds, stripQuotedReply } from "./emailThread.service";
import { extractThreadToken, isInfluencerRecipient, newThreadToken } from "./influencerMail.service";

const BODY_STORE_MAX = 60_000;

/** Headers that can name a recipient, as alias delivery scatters them. */
export const RECIPIENT_HEADERS = [
  "to", "cc", "bcc",
  "delivered-to", "x-original-to", "envelope-to", "x-envelope-to",
  "x-forwarded-to", "resent-to", "x-rcpt-to",
];

export interface InboundMail {
  fromEmail: string;
  fromName: string;
  subject: string;
  /** Plain text. When the mail had only HTML, the caller passes its text rendering. */
  text: string;
  messageId: string;
  inReplyTo: string;
  references: string;
  at: Date;
  /** Every recipient-bearing header value plus the envelope destinations. */
  recipients: string[];
}

export interface IngestResult {
  outcome: "stored" | "duplicate";
  route: "influencer" | "general";
  rung: MatchRung;
  threadId?: string;
}

/**
 * Plain text of an email for storage and display.
 *
 * Inbound HTML is NEVER stored or rendered — the panel shows text in a
 * React text node, which cannot execute anything. When a client sent HTML
 * only, mailparser's own HTML→text rendering is used instead.
 */
export function inboundText(parsed: { text?: string | false; html?: string | false; textAsHtml?: string }): string {
  const text = typeof parsed.text === "string" ? parsed.text : "";
  if (text.trim()) return text;
  const html = typeof parsed.html === "string" ? parsed.html : "";
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function ingestInboundMail(mail: InboundMail): Promise<IngestResult> {
  const rfcMessageId = normalizeMessageId(mail.messageId);
  const route = isInfluencerRecipient(mail.recipients) ? "influencer" : "general";

  if (rfcMessageId && (await inboundAlreadyStored(rfcMessageId))) {
    return { outcome: "duplicate", route, rung: "none" };
  }

  const subject = String(mail.subject || "").slice(0, 300);
  const rawText = String(mail.text || "").slice(0, BODY_STORE_MAX);
  const trimmed = stripQuotedReply(rawText);

  let threadId: mongoose.Types.ObjectId | undefined;
  let rung: MatchRung;
  /** Set when the reply belongs to outreach to a not-yet-joined creator. */
  let prospectThread = false;

  if (route === "influencer") {
    const match = await matchInfluencerInbound({
      fromEmail: mail.fromEmail,
      subject,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      messageId: rfcMessageId,
      // The quoted history is where our footer survives, so the RAW text.
      token: extractThreadToken(subject, rawText),
    });
    rung = match.rung;
    threadId = match.thread?._id as mongoose.Types.ObjectId | undefined;
    prospectThread = match.thread?.kind === "prospect";
    if (!threadId && match.prospect) {
      // A prospect writing in before (or apart from) our email reaching them.
      const opened = await openThread(
        {
          kind: "prospect",
          prospectId: String(match.prospect._id),
          userName: match.prospect.name || mail.fromName || "",
          userEmail: match.prospect.email,
          threadToken: newThreadToken(),
        },
        subject
      );
      threadId = opened._id as mongoose.Types.ObjectId;
      prospectThread = true;
    }
    if (!threadId && match.influencerUser) {
      // A known influencer writing in before we ever wrote to them. Their
      // chat starts here, with their message.
      const opened = await openThread(
        {
          kind: "influencer",
          userId: String(match.influencerUser._id),
          userName: match.influencerUser.name || mail.fromName || "",
          userEmail: match.influencerUser.email,
          threadToken: newThreadToken(),
        },
        subject
      );
      threadId = opened._id as mongoose.Types.ObjectId;
    }
  } else {
    const match = await matchInboundThread({
      fromEmail: mail.fromEmail,
      subject,
      inReplyTo: mail.inReplyTo,
      references: mail.references,
      messageId: rfcMessageId,
    });
    rung = match.rung;
    threadId = match.thread?._id as mongoose.Types.ObjectId | undefined;
  }

  if (!threadId) {
    // Nothing matched. Still stored — a reply that cannot be placed is the one
    // most likely to be somebody asking to be left alone.
    const opened = await openThread(
      {
        kind: "inbound",
        userEmail: mail.fromEmail || "unknown@unknown.invalid",
        userName: mail.fromName || "",
      },
      subject
    );
    threadId = opened._id as mongoose.Types.ObjectId;
  }

  await appendMessage(threadId, {
    direction: "inbound",
    subject,
    body: trimmed,
    rawBody: rawText,
    html: "",
    at: mail.at || new Date(),
    rfcMessageId,
    rfcMessageIdSource: rfcMessageId ? "received" : "",
    inReplyTo: parseMessageIds(mail.inReplyTo)[0] || "",
    references: parseMessageIds(mail.references),
    source: "inbound-ses",
    trimmed: trimmed !== rawText.trim(),
  });

  if (prospectThread) {
    // Status → replied (or unsubscribed / not interested when that is all the
    // reply says), and any queued follow-up is cancelled. Lazy import: the
    // prospect service pulls in models this module's tests never load.
    const { recordProspectReply } = await import("./prospect.service");
    await recordProspectReply(String(threadId), subject, trimmed).catch((err) =>
      console.error("recordProspectReply failed (reply is stored):", (err as Error)?.message)
    );
  }

  return { outcome: "stored", route, rung, threadId: String(threadId) };
}
