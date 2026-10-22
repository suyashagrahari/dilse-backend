// ─── Mail to and from influencers ───────────────────────────────────────────
//
// The influencer chat on /admin/influencers/:id is an `EmailThread` of kind
// "influencer" — the same conversation store, threading arithmetic, SES sender
// and inbound pipeline as feedback and draft follow-ups. What is specific to
// influencers lives here, and is kept pure where it can be so it is tested
// without Mongo or SES:
//
//   · which addresses are "ours" for influencer mail (From, Reply-To, any
//     receiving alias) — the inbound side routes on these;
//   · the thread reference printed in the footer, and reading it back out of a
//     reply whose headers were stripped;
//   · the branded HTML + plain-text body;
//   · the send itself, with an injectable transport so tests never reach SES.
//
// ── WHY THE FROM ADDRESS IS NOT THE REPLY ADDRESS BY DEFAULT ────────────────
//
// It IS, by default: the owner asked for replies to come back to
// influencer-support@, which is a GoDaddy mailbox a person can read. That
// address is on the apex domain, so SES never sees mail sent to it; the app
// only learns of a reply through IMAP or a forwarding rule. Setting
// INFLUENCER_REPLY_TO_EMAIL to an address on the SES receiving subdomain
// removes the GoDaddy hop entirely. Both are supported; the status endpoint
// says which one is live, and the panel says plainly when neither is.

import crypto from "node:crypto";
import { env } from "../config/env";
import { maskEmail } from "../config/influencerMath";
import { rfcMessageIdFor } from "./emailThread.service";
import { SesSendError, isConfigurationSetUnavailable, sendSesEmail, sesConfigured, type SesEmail, type SesSendResult } from "./ses.service";

const ADDRESS_RE = /[^\s<>,;"()]+@[^\s<>,;"()]+\.[^\s<>,;"()]+/g;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanAddress(value: string | undefined): string {
  const found = String(value || "").toLowerCase().match(ADDRESS_RE);
  const addr = found ? found[0].replace(/[.,;]+$/, "") : "";
  return EMAIL_RE.test(addr) ? addr : "";
}

/** The address influencer mail is sent FROM. */
export function influencerFromAddress(): string {
  return cleanAddress(env.INFLUENCER_FROM_EMAIL) || "influencer-support@subhsandesh.in";
}

/** Where an influencer's reply is asked to go. Defaults to the From address. */
export function influencerReplyToAddress(): string {
  return cleanAddress(env.INFLUENCER_REPLY_TO_EMAIL) || influencerFromAddress();
}

/**
 * Every address that marks an arriving message as influencer mail.
 *
 * Pure over its inputs so the routing rule can be tested; the no-argument
 * form reads the environment.
 */
export function influencerInboundAddresses(
  from: string = env.INFLUENCER_FROM_EMAIL,
  replyTo: string = env.INFLUENCER_REPLY_TO_EMAIL,
  extra: string = env.INFLUENCER_INBOUND_ADDRESSES,
  personalFrom: string = env.PROSPECT_PERSONAL_FROM_EMAIL
): string[] {
  const out = new Set<string>();
  // personalFrom: personal prospect mail has no Reply-To, so replies are
  // addressed to yash@ and reach SES through the GoDaddy forward.
  for (const raw of [from, replyTo, personalFrom, ...String(extra || "").split(",")]) {
    const a = cleanAddress(raw);
    if (a) out.add(a);
  }
  return [...out];
}

/**
 * Was this message addressed to an influencer address?
 *
 * `recipients` is every address-bearing header value and the SES envelope
 * destination list, flattened. Matching is on the address, never on a
 * substring, so a mail that merely MENTIONS influencer-support@ in its body or
 * display name is not routed here.
 */
export function isInfluencerRecipient(
  recipients: string[],
  wanted: string[] = influencerInboundAddresses()
): boolean {
  if (wanted.length === 0) return false;
  for (const value of recipients || []) {
    const found = String(value || "").toLowerCase().match(ADDRESS_RE) || [];
    for (const raw of found) {
      if (wanted.includes(raw.replace(/[.,;]+$/, ""))) return true;
    }
  }
  return false;
}

// ── The footer reference ────────────────────────────────────────────────────

/** Crockford-ish base32 with no 0/O/1/I/L, so a human can read it back too. */
const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TOKEN_LEN = 8;
const TOKEN_RE = new RegExp(`\\bINF-([${TOKEN_ALPHABET}]{${TOKEN_LEN}})\\b`, "i");

export function newThreadToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LEN);
  let s = "";
  for (let i = 0; i < TOKEN_LEN; i++) s += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return `INF-${s}`;
}

/**
 * The reference in a reply, if its quoted history kept our footer.
 *
 * Searched in the subject first (some people paste it there), then the body.
 * Returns the canonical upper-case form, or "".
 */
export function extractThreadToken(...texts: string[]): string {
  for (const t of texts) {
    const m = String(t || "").match(TOKEN_RE);
    if (m) return `INF-${m[1].toUpperCase()}`;
  }
  return "";
}

// ── The email itself ────────────────────────────────────────────────────────

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Bare http(s) links become anchors; everything else is escaped text. */
function linkify(escaped: string): string {
  return escaped.replace(
    /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g,
    (url) => `<a href="${url}" style="color:#8b5a2b;font-weight:600;">${url}</a>`
  );
}

export interface InfluencerMailContent {
  body: string;
  /** Printed in the footer; see `extractThreadToken`. */
  token: string;
  fromAddress: string;
  replyToAddress: string;
}

export function influencerMailText(c: InfluencerMailContent): string {
  return [
    c.body.trim(),
    "",
    "—",
    `SubhSandesh Creators · ${c.replyToAddress}`,
    "Just reply to this email — it comes straight to our team.",
    `Ref: ${c.token}`,
  ].join("\n");
}

export function influencerMailHtml(c: InfluencerMailContent): string {
  const paragraphs = c.body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#2e1a10;">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n            ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SubhSandesh Creators</title>
</head>
<body style="margin:0;padding:0;background-color:#f5ede6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5ede6;">
    <tr><td align="center" style="padding:32px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background-color:#fffdf9;border:1px solid #e4d8cc;border-radius:12px;">
        <tr>
          <td style="padding:24px 40px 0;">
            <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b09a88;">
              SubhSandesh &nbsp;&bull;&nbsp; <span style="color:#c9a84c;">Creator programme</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 24px;">
            ${paragraphs}
          </td>
        </tr>
        <tr>
          <td style="padding:0 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="height:1px;background-color:#e4d8cc;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 40px 22px;">
            <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#1c1008;">SubhSandesh Creators</p>
            <p style="margin:0 0 4px;font-size:12px;color:#7a6050;">
              <a href="mailto:${esc(c.replyToAddress)}" style="color:#7a6050;text-decoration:none;">${esc(c.replyToAddress)}</a>
              &nbsp;&bull;&nbsp; <a href="https://subhsandesh.in" style="color:#c9a84c;text-decoration:none;font-weight:600;">subhsandesh.in</a>
            </p>
            <p style="margin:10px 0 0;font-size:11px;color:#b09a88;line-height:1.6;">
              You are receiving this because you are part of the SubhSandesh creator programme. Just reply to this email — it comes straight to our team.
              <br>Ref: ${esc(c.token)}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Sending ─────────────────────────────────────────────────────────────────

export type MailTransport = (email: SesEmail) => Promise<SesSendResult>;

/** A transport that records nothing and sends nothing. Local dev and tests. */
export const stubTransport: MailTransport = async (email) => {
  // The address is masked: process logs are read more widely than the panel.
  console.log(`[influencer mail — STUB, not sent] To: ${maskEmail(email.to)} | Subject: ${email.subject}`);
  return { outcome: "sent", messageId: `stub-${crypto.randomBytes(12).toString("hex")}` };
};

/** What will actually happen if Send is pressed on this deployment. */
export function influencerSendMode(): "ses" | "stub" | "off" {
  if (env.INFLUENCER_MAIL_STUB) return "stub";
  return sesConfigured() ? "ses" : "off";
}

export class InfluencerMailNotConfiguredError extends Error {}

export interface InfluencerSendInput {
  to: string;
  subject: string;
  body: string;
  token: string;
  inReplyTo?: string;
  references?: string;
  /**
   * Prospect outreach supplies its own rendering (a plainer email with an
   * unsubscribe footer), its own display name, and List-Unsubscribe headers.
   * Unset → the influencer-chat email above, exactly as before.
   */
  render?: (c: { fromAddress: string; replyToAddress: string }) => { text: string; html: string };
  fromName?: string;
  extraHeaders?: Record<string, string>;
  /**
   * Personal invite mode sends AS a person. Both must be complete addresses;
   * there is deliberately no fallback to the team address when the person's
   * address is refused — see prospectQueue.service.
   */
  fromAddress?: string;
  replyToAddress?: string;
  /**
   * Send with this SES configuration set instead of the default one (prospect
   * outreach's quiet lane: no open tracking). If SES says it does not exist
   * or is not allowed, the send is retried ONCE without it and the result
   * says so (`quietLane: "fallback"`).
   */
  configurationSet?: string;
  /** Inline images for the HTML part (prospect outreach's analytics screenshot). Sent as raw MIME. */
  inlineImages?: SesEmail["inlineImages"];
}

export interface InfluencerSendResult {
  providerMessageId: string;
  rfcMessageId: string;
  fromAddress: string;
  replyToAddress: string;
  text: string;
  html: string;
  via: "ses" | "stub";
  /**
   * "used": sent with the requested configuration set. "fallback": that set
   * was missing / not allowed, so it went on the default lane
   * (`quietLaneError` says why). "none": no set was requested.
   */
  quietLane: "used" | "fallback" | "none";
  quietLaneError?: string;
}

/**
 * Send one influencer email. Throws `SesSendError` on a refusal and
 * `InfluencerMailNotConfiguredError` when nothing could leave the building —
 * never a silent success.
 */
export async function sendInfluencerMail(
  input: InfluencerSendInput,
  transport?: MailTransport
): Promise<InfluencerSendResult> {
  const mode = transport ? "ses" : influencerSendMode();
  if (mode === "off") {
    throw new InfluencerMailNotConfiguredError(
      "SES is not configured on this deployment, so nothing was sent."
    );
  }
  const send: MailTransport = transport || (mode === "stub" ? stubTransport : sendSesEmail);

  const fromAddress = input.fromAddress !== undefined ? cleanAddress(input.fromAddress) : influencerFromAddress();
  const replyToAddress = input.replyToAddress !== undefined ? cleanAddress(input.replyToAddress) || fromAddress : influencerReplyToAddress();
  if (!fromAddress) throw new SesSendError(`"${input.fromAddress}" is not a valid From address, so nothing was sent.`);
  const content = { body: input.body, token: input.token, fromAddress, replyToAddress };
  const rendered = input.render
    ? input.render({ fromAddress, replyToAddress })
    : { text: influencerMailText(content), html: influencerMailHtml(content) };
  const { text, html } = rendered;
  const fromName = input.fromName || env.INFLUENCER_FROM_NAME;

  const email: SesEmail = {
    to: input.to,
    subject: input.subject,
    text,
    html,
    from: fromAddress,
    fromName,
    replyTo: fromName
      ? `${fromName.replace(/[\r\n"<>]+/g, " ").trim()} <${replyToAddress}>`
      : replyToAddress,
    headers: {
      ...(input.extraHeaders || {}),
      "In-Reply-To": input.inReplyTo || "",
      References: input.references || "",
    },
    ...(input.inlineImages?.length ? { inlineImages: input.inlineImages } : {}),
  };
  const lane = String(input.configurationSet || "").trim();
  let quietLane: InfluencerSendResult["quietLane"] = lane ? "used" : "none";
  let quietLaneError = "";
  let result: SesSendResult;
  try {
    result = await send(lane ? { ...email, configurationSet: lane } : email);
  } catch (error) {
    if (!lane || !isConfigurationSetUnavailable(error)) throw error;
    // The quiet lane is not set up (or not allowed). Nothing was sent; send
    // ONCE more without the override, on the default lane, and say so.
    quietLaneError = (error as Error).message;
    quietLane = "fallback";
    console.warn(`[mail] Quiet lane not set up yet — configuration set "${lane}" unusable (${quietLaneError}). Retrying once on the default configuration set (open tracking applies).`);
    result = await send(email);
  }

  if (result.outcome !== "sent") {
    // sendSesEmail answers "skipped" when credentials vanished between the
    // mode check and the send. Same treatment: not sent, said loudly.
    throw new InfluencerMailNotConfiguredError("SES is not configured, so nothing was sent.");
  }

  const providerMessageId = result.messageId || "";
  return {
    providerMessageId,
    // A stub id is not an SES id and must not be reconstructed into one.
    rfcMessageId: mode === "stub" ? "" : rfcMessageIdFor(providerMessageId, env.SES_REGION),
    fromAddress,
    replyToAddress,
    text,
    html,
    via: mode === "stub" ? "stub" : "ses",
    quietLane,
    ...(quietLaneError ? { quietLaneError } : {}),
  };
}
