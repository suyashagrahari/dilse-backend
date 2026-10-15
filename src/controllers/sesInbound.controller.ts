// ─── Inbound: a creator's reply arriving back ───────────────────────────────
//
// POST /api/webhooks/ses-inbound/:token
//
// SES Email Receiving publishes an arriving message to an SNS topic; SNS POSTs
// it here; this parses it and appends it to the right conversation.
//
// ── WHY THIS IS NOT SIMPLY "POINT MX AT SES" ────────────────────────────────
//
// `feedback@subhsandesh.in` is on the APEX domain, and the apex MX already
// points at the company mail provider — the same records that deliver
// support@, verify@ and personal mailboxes. Pointing the apex MX at SES would
// take every one of those with it. So SES cannot be made to receive
// `feedback@subhsandesh.in` directly, and that is a fact about their DNS, not a
// limitation of this code.
//
// What actually happens, and it satisfies the requirement exactly:
//
//   1. Every message we send sets `From: feedback@subhsandesh.in`, so a reply
//      goes to `feedback@subhsandesh.in`. That needs no code and no DNS — it is
//      already true, provided the mailbox exists at their provider.
//   2. To ALSO make the reply visible here, that mailbox forwards a copy to an
//      address on a receiving subdomain (`reply.subhsandesh.in`), whose MX can
//      point at SES without touching the apex.
//   3. SES receives the forwarded copy and posts it here.
//
// Step 2 is a forwarding rule in their mail provider, and until it exists this
// endpoint simply never fires. The panel's manual-paste path covers the gap —
// see `adminThread.controller.ts` — so the conversation view is useful on day
// one rather than after a DNS change.
//
// A forwarded copy keeps the original `In-Reply-To` and `References` headers,
// which is what rung 1 of the matching ladder needs. What it does NOT reliably
// keep is the original `From`: some providers rewrite it to the forwarding
// mailbox. So the sender is read from `Reply-To`, then the original `From`
// headers, then the envelope — see `senderOf`.
//
// ── DUPLICATES ─────────────────────────────────────────────────────────────
//
// SNS delivers at-least-once and retries anything that is not answered 200.
// Every message is therefore checked against its `Message-ID` before being
// stored, and this endpoint answers 200 to anything it has decided not to
// store. Answering 500 to a message we cannot use makes SNS send it again for
// hours.

import { Request, Response } from "express";
import crypto from "node:crypto";
import { simpleParser } from "mailparser";
import { env } from "../config/env";
import {
  SnsVerificationError,
  verifySnsMessage,
  type SnsMessage,
} from "../services/snsSignature";
import { ingestInboundMail, inboundText, RECIPIENT_HEADERS } from "../services/inboundIngest.service";
import { influencerInboundAddresses } from "../services/influencerMail.service";

/** Constant-time compare, so the token cannot be found a character at a time. */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(String(given || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  // `timingSafeEqual` throws on a length mismatch, which is itself a leak. Both
  // sides are hashed to a fixed width first.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** One header value from mailparser's map, whatever shape it came back as. */
function headerValue(headers: Map<string, unknown>, name: string): string {
  const raw = headers.get(name);
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map((r) => String(r)).join(" ");
  // mailparser returns structured objects for address and reference headers.
  const obj = raw as { text?: string; value?: unknown };
  if (typeof obj.text === "string") return obj.text;
  return String(raw);
}

/**
 * Every address that is US, and so can never be the author of an inbound
 * message.
 *
 * More than one, and the list has to stay complete. `Reply-To` is preferred
 * over `From` below, and our own mail now carries our RECEIVING address in
 * `Reply-To` — so a forwarded copy of something we sent arrives with our
 * address sitting in the very field that is consulted first. Excluding only
 * the From address, as this did, was enough while Reply-To and From were the
 * same address; the moment they diverged it stopped being enough.
 */
export function ourAddresses(): string[] {
  return [
    env.SES_FROM_EMAIL,
    env.SES_REPLY_TO_EMAIL,
    env.SES_OTP_FROM_EMAIL,
    // Influencer mail goes out as, and asks for replies at, its own
    // addresses. A forwarded copy carries them in From / Reply-To exactly as
    // feedback mail carries feedback@.
    ...influencerInboundAddresses(),
  ]
    .map((a) => String(a || "").toLowerCase().trim())
    // The env values may carry a display name; only the address matters.
    .map((a) => (a.match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/) || [""])[0])
    .filter(Boolean);
}

/**
 * Who actually wrote this, given a forwarded copy may have rewritten `From`.
 *
 * Order matters: `Reply-To` is what the ORIGINAL sender's client set and a
 * forwarder has no reason to touch, so it beats a `From` that may now say
 * "feedback@subhsandesh.in forwarded this".
 */
export function senderOf(
  replyTo: string,
  from: string,
  envelopeFrom: string,
  ours: string[] = ourAddresses()
): string {
  for (const candidate of [replyTo, from, envelopeFrom]) {
    // Every address in the field, not just the first. A forwarded copy can
    // carry both our address and the real author's in one header, and taking
    // only the first would stop at ours and fall through to the next field —
    // losing an author that was sitting right there.
    const found = String(candidate || "").match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/g);
    if (!found) continue;
    for (const raw of found) {
      const addr = raw.toLowerCase().replace(/[.,;]+$/, "");
      // Our own address is not a sender. On a forwarded copy it is exactly
      // what `From` says, and accepting it would attribute every reply to
      // ourselves and match it against a thread belonging to nobody.
      if (ours.includes(addr)) continue;
      return addr;
    }
  }
  return "";
}

export const sesInboundWebhook = async (req: Request, res: Response): Promise<void> => {
  // ── Gate 1: the shared secret in the path ──────────────────────────────
  if (!env.SES_INBOUND_TOKEN) {
    // Not configured means closed, not open. A 404 rather than a 403 so a scan
    // learns nothing about whether the route exists.
    res.status(404).json({ success: false, error: "Not found" });
    return;
  }
  if (!tokenMatches(String(req.params.token || ""), env.SES_INBOUND_TOKEN)) {
    res.status(404).json({ success: false, error: "Not found" });
    return;
  }

  // SNS posts with Content-Type: text/plain, so the route parses text and the
  // JSON is decoded here.
  let msg: SnsMessage;
  try {
    msg = typeof req.body === "string" ? JSON.parse(req.body) : (req.body as SnsMessage);
  } catch {
    res.status(400).json({ success: false, error: "Body is not JSON" });
    return;
  }
  if (!msg || typeof msg !== "object") {
    res.status(400).json({ success: false, error: "Body is not an SNS message" });
    return;
  }

  // ── Gate 2: it was signed by Amazon ────────────────────────────────────
  try {
    await verifySnsMessage(msg);
  } catch (error) {
    if (error instanceof SnsVerificationError) {
      console.warn("Rejected an SNS message:", error.message);
      res.status(403).json({ success: false, error: "Not a verified SNS message" });
      return;
    }
    throw error;
  }

  // ── Gate 3: it was OUR topic ───────────────────────────────────────────
  //
  // A valid Amazon signature says nothing about whose topic it is. Without
  // this, anybody with an AWS account could create a topic, publish a
  // perfectly-signed message to it, and have it appear as a creator's reply.
  if (env.SES_INBOUND_TOPIC_ARN && msg.TopicArn !== env.SES_INBOUND_TOPIC_ARN) {
    console.warn(`Rejected an SNS message from an unexpected topic: ${msg.TopicArn}`);
    res.status(403).json({ success: false, error: "Unexpected topic" });
    return;
  }

  // ── Subscription handshake ─────────────────────────────────────────────
  //
  // SNS will not deliver anything until the SubscribeURL is visited once.
  // Confirming it here rather than by hand means the subscription survives a
  // topic being recreated.
  if (msg.Type === "SubscriptionConfirmation") {
    const url = String(msg.SubscribeURL || "");
    try {
      // Safe to fetch: the message is signed, the topic is ours, and the host
      // is checked the same way the certificate host is.
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !/\.amazonaws\.com(\.cn)?$/.test(parsed.hostname)) {
        throw new Error(`refusing to confirm via ${parsed.hostname}`);
      }
      await fetch(url, { signal: AbortSignal.timeout(8000) });
      console.log("Confirmed the SES inbound SNS subscription");
    } catch (error) {
      console.error("Could not confirm the SNS subscription:", error);
    }
    res.json({ success: true, message: "Subscription confirmation handled" });
    return;
  }

  if (msg.Type !== "Notification") {
    res.json({ success: true, message: `Ignored a "${msg.Type}" message` });
    return;
  }

  // ── The SES payload ────────────────────────────────────────────────────
  let payload: {
    notificationType?: string;
    eventType?: string;
    content?: string;
    mail?: { source?: string; destination?: string[]; commonHeaders?: { subject?: string } };
    receipt?: { recipients?: string[]; action?: { type?: string } };
  };
  try {
    payload = JSON.parse(String(msg.Message || "{}"));
  } catch {
    res.json({ success: true, message: "Notification body was not JSON; ignored" });
    return;
  }

  // A configuration set's bounce/complaint events land on their own topic and
  // have `eventType`, not `notificationType: "Received"`. If both are wired to
  // one topic, this is what keeps them apart.
  if (payload.notificationType !== "Received") {
    res.json({
      success: true,
      message: `Not an inbound message (${payload.eventType || payload.notificationType || "unknown"}); ignored`,
    });
    return;
  }

  // `content` is present when the receipt rule action is SNS. With an S3 action
  // the mail is in a bucket instead and there is nothing to parse here.
  const raw = String(payload.content || "");
  if (!raw.trim()) {
    console.warn(
      "An inbound SES notification carried no content — the receipt rule is probably storing to S3 rather than publishing to SNS."
    );
    res.json({ success: true, message: "No message content; ignored" });
    return;
  }

  try {
    const parsed = await simpleParser(Buffer.from(raw, "utf8"));
    const headers = parsed.headers as Map<string, unknown>;

    const fromEmail = senderOf(
      headerValue(headers, "reply-to"),
      parsed.from?.text || headerValue(headers, "from"),
      String(payload.mail?.source || "")
    );

    // Who it was ADDRESSED to decides which ladder matches it (influencer
    // mail vs everything else). SES's own envelope list is the most reliable
    // record of that; the headers cover aliases and forwards.
    const recipients = [
      ...(payload.receipt?.recipients || []),
      ...(payload.mail?.destination || []),
      ...RECIPIENT_HEADERS.map((h) => headerValue(headers, h)),
    ].filter(Boolean);

    const result = await ingestInboundMail({
      fromEmail,
      fromName: parsed.from?.value?.[0]?.name || "",
      subject: String(parsed.subject || payload.mail?.commonHeaders?.subject || ""),
      text: inboundText(parsed),
      messageId: parsed.messageId || headerValue(headers, "message-id"),
      inReplyTo: headerValue(headers, "in-reply-to"),
      references: headerValue(headers, "references"),
      at: parsed.date || new Date(),
      recipients,
    });

    if (result.outcome === "duplicate") {
      // 200, not an error: SNS retries anything else, for hours.
      res.json({ success: true, message: "Already stored" });
      return;
    }

    console.log(
      `Stored an inbound reply from ${fromEmail || "an unknown sender"} (route: ${result.route}, matched by: ${result.rung})`
    );
    res.json({ success: true, message: "Stored", data: { matchedBy: result.rung, route: result.route } });
  } catch (error) {
    // A parse failure is ours, not Amazon's, and retrying will fail the same
    // way. 200 so SNS stops, with a loud log so it is not lost silently.
    console.error("Failed to store an inbound reply:", error);
    res.json({ success: true, message: "Could not parse; logged and dropped" });
  }
};
