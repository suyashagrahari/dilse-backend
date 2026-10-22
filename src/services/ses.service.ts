// ─── Amazon SES transport ────────────────────────────────────────────────────
//
// One function: `sendSesEmail`. Used by the draft follow-up flow, from
// `feedback@subhsandesh.in`.
//
// ── WHY A SECOND MAIL PROVIDER AT ALL ───────────────────────────────────────
//
// Resend already sends OTP codes, contact replies and feedback replies. Adding
// SES beside it is a deliberate split, not drift.
//
// Everything Resend sends is a reply or a response to something the recipient
// just did. The draft follow-up is the only mail here that arrives UNSOLICITED —
// somebody left a page half-finished and we write to ask why. That is the class
// of mail that attracts spam complaints, and complaints are scored per sending
// identity. Keeping it on its own identity, its own reputation and its own quota
// means a bad run of nudges cannot stop sign-in codes from being delivered. A
// sign-in email failing is an outage; a nudge failing is nothing.
//
// They do not conflict at the DNS level: each provider signs with its own DKIM
// selector and both can be published for one domain.
//
// ── WHAT MUST BE TRUE FOR THIS TO WORK ──────────────────────────────────────
//
//   1. `@aws-sdk/client-sesv2` installed.
//   2. `subhsandesh.in` verified as a DOMAIN identity in SES (region
//      us-east-1), with its three DKIM CNAMEs published. A domain identity is
//      preferred over verifying `feedback@` alone, because it needs no mailbox
//      and covers every future From address.
//   3. An IAM principal whose ONLY permission is `ses:SendEmail`, its key in
//      SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY.
//   4. Production access (not the sandbox). In the sandbox SES refuses any
//      recipient that is not itself verified, which for this feature means every
//      real user. A 200 emails/24h quota is the sandbox tell; 50,000 is not.
//
// See docs/ses-setup.md for the DNS records and the IAM policy document.
//
// ── UNCONFIGURED IS NOT AN ERROR ────────────────────────────────────────────
//
// With no credentials this logs the message and reports `skipped`, the same
// shape `utils/mailer` uses for a missing Resend key. That keeps a laptop and a
// test run from needing AWS at all. The caller is told which happened, so the
// panel can say "SES is not configured" rather than claiming a send.

import {
  SESv2Client,
  SendEmailCommand,
  AccountSuspendedException,
  MessageRejected,
  SendingPausedException,
  TooManyRequestsException,
} from "@aws-sdk/client-sesv2";
import { env } from "../config/env";
import { buildRawMime } from "./mime.service";

/** Raised for every SES failure, carrying something a human can act on. */
export class SesSendError extends Error {
  constructor(
    message: string,
    /** True when retrying the identical send might work. */
    readonly retryable: boolean = false,
    /**
     * Set when the refusal was about the configuration set the caller asked
     * for — it does not exist, or the IAM policy does not cover it. The caller
     * may retry once WITHOUT the override (prospect outreach's quiet lane).
     */
    readonly code: "" | "configuration_set_missing" | "configuration_set_denied" = ""
  ) {
    super(message);
    this.name = "SesSendError";
  }
}

/**
 * Was this SES failure about the configuration set we explicitly named, and
 * not about anything else? Pure, so the quiet-lane fallback is tested without
 * AWS. SESv2 answers a missing set with NotFoundException ("Configuration set
 * <name> does not exist"); SESv1 calls it ConfigurationSetDoesNotExist. An
 * IAM refusal names the resource: ".../configuration-set/<name>".
 */
export function configurationSetErrorCode(
  errorName: string,
  message: string,
  requestedSet: string
): "" | "configuration_set_missing" | "configuration_set_denied" {
  const set = String(requestedSet || "").trim();
  if (!set) return "";
  const m = String(message || "");
  if (/^ConfigurationSetDoesNotExist(Exception)?$/.test(errorName)) return "configuration_set_missing";
  if (errorName === "NotFoundException" && /configuration[ -_]?set/i.test(m)) return "configuration_set_missing";
  if (errorName === "AccessDeniedException" && m.includes(`configuration-set/${set}`)) return "configuration_set_denied";
  return "";
}

/** May the caller retry this send once without its configuration-set override? */
export function isConfigurationSetUnavailable(error: unknown): boolean {
  return error instanceof SesSendError && error.code !== "";
}

const isConfigured =
  !!env.SES_ACCESS_KEY_ID && !!env.SES_SECRET_ACCESS_KEY && !!env.SES_REGION;

const client = isConfigured
  ? new SESv2Client({
      region: env.SES_REGION,
      credentials: {
        accessKeyId: env.SES_ACCESS_KEY_ID,
        secretAccessKey: env.SES_SECRET_ACCESS_KEY,
      },
    })
  : null;

/** Whether a send would actually leave the building. Read by the admin panel. */
export function sesConfigured(): boolean {
  return isConfigured;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The address a threaded email must ask for its reply on.
 *
 * Every send that is part of a conversation — a feedback reply, a draft
 * follow-up, a reply from the conversation panel — has to use this rather than
 * the From address. See the note on `SES_REPLY_TO_EMAIL` in `config/env.ts`:
 * From is on the apex domain, whose mail belongs to GoDaddy, so a reply sent
 * back to it never reaches SES and never reaches the panel.
 *
 * OTP and contact mail deliberately do NOT use this. Those replies belong to a
 * human in the support mailbox, not to a conversation thread.
 *
 * Carries the display name so the recipient sees "SubhSandesh", not a raw
 * `inbox@` address that looks like a machine wrote it.
 */
export function threadReplyToAddress(): string {
  return formatReplyToAddress(env.SES_REPLY_TO_EMAIL, env.SES_FROM_EMAIL, env.SES_FROM_NAME);
}

/**
 * The decision behind `threadReplyToAddress`, with the environment lifted out.
 *
 * Separate because `config/env` freezes itself on first import, so a test that
 * reaches for the wrapper can only ever observe whichever environment happened
 * to load first. The rule this encodes is worth testing on its own terms.
 */
export function formatReplyToAddress(
  replyTo: string | undefined,
  fromEmail: string | undefined,
  fromName: string | undefined
): string {
  const fallback = String(fromEmail || "").trim();
  const name = String(fromName || "").replace(/[\r\n"<>]+/g, " ").trim();

  // Blank is the same as unset. The deploy step writes the variable
  // unconditionally, so a missing value arrives as an empty string rather than
  // as an absent key — and that must land on the ordinary fallback below, not
  // be mistaken for a malformed override.
  const override = String(replyTo || "").trim();
  const address = override || fallback;

  // A malformed override, on the other hand, is a misconfiguration worth
  // making visible: fall back to the bare From address, which sendSesEmail has
  // already validated, rather than emitting a header that breaks the send.
  if (!EMAIL_RE.test(address)) return fallback;
  return name ? `${name} <${address}>` : address;
}

export interface SesEmail {
  to: string;
  subject: string;
  /** Plain text. Required — a text part is what keeps mail out of spam folders. */
  text: string;
  html?: string;
  replyTo?: string;
  /**
   * Override the From address.
   *
   * Defaults to `SES_FROM_EMAIL` (feedback@), which is right for draft
   * follow-ups. OTP mail must go as `verify@` — a sign-in code arriving from
   * the address that sends unsolicited follow-ups is both confusing and worse
   * for deliverability, because the two have different engagement profiles.
   *
   * Must be on a verified SES identity. The domain identity covers every
   * address on subhsandesh.in, so no per-address verification is needed.
   */
  from?: string;
  fromName?: string;
  /**
   * Override the configuration set.
   *
   * Worth using: it is how bounce and complaint metrics for sign-in codes stay
   * separate from those for follow-ups. Mixed together, a bad run of one
   * silently poisons the reading of the other.
   */
  configurationSet?: string;
  /**
   * Extra headers, used for `In-Reply-To` and `References` so a follow-up lands
   * in the existing conversation rather than starting a second one.
   *
   * SES accepts arbitrary headers on a Simple send, with two limits that are
   * enforced below rather than left to fail at the API: a value may be at most
   * 995 characters, and a handful of names are reserved because SES writes them
   * itself. `Message-ID` is the important one — SES overwrites whatever you put
   * there, so asking for it is always a mistake and is refused here instead of
   * silently doing nothing. See `emailThread.service.ts`.
   */
  headers?: Record<string, string>;
  /**
   * Images shown inline in the HTML part (`<img src="cid:…">`). When present
   * the email is sent as Content.Raw (multipart/alternative → text +
   * multipart/related html + images) — see mime.service.ts. Requires `html`.
   */
  inlineImages?: { cid: string; filename: string; contentType: string; content: Buffer }[];
}

/**
 * Headers SES sets itself and will not accept from a caller.
 *
 * From the SES documentation: "If you provide a Message-ID header, Amazon SES
 * overrides the header with its own value", and a Simple send disallows the
 * headers it builds from the request fields.
 */
const RESERVED_HEADERS = new Set([
  "message-id",
  "from",
  "to",
  "cc",
  "bcc",
  "subject",
  "reply-to",
  "return-path",
  "date",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "dkim-signature",
]);

/** Header value cap, from the SES `MessageHeader` reference. */
const HEADER_VALUE_LIMIT = 995;
const HEADER_NAME_RE = /^[!-9;-@A-~]+$/;

/**
 * Turn a header map into SES's `MessageHeader[]`, dropping what cannot be sent.
 *
 * Empty values are dropped silently: `threadingHeadersFor` returns "" for a
 * message that opens a thread, and the caller passing that straight through is
 * the expected path, not an error. A reserved or malformed NAME throws, because
 * that is a programming mistake and swallowing it would produce mail that looks
 * threaded in our database and is not threaded in anybody's inbox.
 */
function toMessageHeaders(headers?: Record<string, string>) {
  const out: { Name: string; Value: string }[] = [];
  for (const [rawName, rawValue] of Object.entries(headers || {})) {
    const name = String(rawName || "").trim();
    const value = String(rawValue ?? "").replace(/[\r\n]+/g, " ").trim();
    if (!name || !value) continue;

    if (RESERVED_HEADERS.has(name.toLowerCase())) {
      throw new SesSendError(
        `"${name}" is set by SES and cannot be supplied. SES overwrites Message-ID in particular, so a thread must be anchored to the id SES reports back, not one chosen here.`
      );
    }
    if (!HEADER_NAME_RE.test(name)) {
      throw new SesSendError(`"${name}" is not a valid header name`);
    }
    if (value.length > HEADER_VALUE_LIMIT) {
      throw new SesSendError(
        `The "${name}" header is ${value.length} characters; SES allows ${HEADER_VALUE_LIMIT}. Trim the References chain before sending.`
      );
    }
    out.push({ Name: name, Value: value });
  }
  return out;
}

export interface SesSendResult {
  /** "sent" when SES accepted it, "skipped" when there are no credentials. */
  outcome: "sent" | "skipped";
  messageId?: string;
}


/**
 * Send one email through SES.
 *
 * Throws `SesSendError` on refusal. Returns `{ outcome: "skipped" }` when SES is
 * not configured, which is not a failure — see the header.
 */
export async function sendSesEmail(email: SesEmail): Promise<SesSendResult> {
  const to = String(email.to || "").trim();
  // Header injection: a newline in any of these would let a caller add its own
  // headers. Subjects are stripped rather than rejected because they are often
  // machine-written; an address with a newline in it is simply invalid.
  const subject = String(email.subject || "").replace(/[\r\n]+/g, " ").trim();

  if (!EMAIL_RE.test(to)) throw new SesSendError(`"${to}" is not a valid email address`);
  if (!subject) throw new SesSendError("The email needs a subject");
  if (!email.text?.trim()) throw new SesSendError("The email needs a text body");

  // Validated BEFORE the not-configured shortcut, so a bad header is caught on a
  // laptop with no AWS credentials instead of only in production.
  const messageHeaders = toMessageHeaders(email.headers);

  if (!client) {
    console.log(
      `\n[SES — not configured] From: ${email.from || env.SES_FROM_EMAIL}\nTo: ${to}\nSubject: ${subject}\n${messageHeaders
        .map((h) => `${h.Name}: ${h.Value}`)
        .join("\n")}\n\n${email.text}\n`
    );
    return { outcome: "skipped" };
  }

  const fromEmail = String(email.from || env.SES_FROM_EMAIL).trim();
  if (!EMAIL_RE.test(fromEmail)) {
    throw new SesSendError(`"${fromEmail}" is not a valid From address`);
  }
  // A display name with a newline or a quote in it would break the header, and
  // a caller cannot be trusted to have escaped it.
  const fromName = String(email.fromName || env.SES_FROM_NAME || "")
    .replace(/[\r\n"<>]+/g, " ")
    .trim();

  const configurationSet = email.configurationSet || env.SES_CONFIGURATION_SET;
  const command = await buildSendCommand(email, { to, subject, fromEmail, fromName, configurationSet, messageHeaders });

  try {
    const res = await client.send(command);
    return { outcome: "sent", messageId: res.MessageId };
  } catch (error) {
    describeSesError(error, email);
  }
}

/**
 * The SendEmail request for one email. Simple content normally; Raw when it
 * carries inline images. Exported for tests (the command is inspected, never
 * sent).
 */
/**
 * The Reply-To to put on the wire, or undefined for none. A Reply-To that only
 * repeats the From address says nothing, and a one-to-one email from a person
 * never carries one — so it is left off rather than echoed.
 */
export function replyToHeader(replyTo: string | undefined, fromEmail: string): string | undefined {
  const rt = String(replyTo || "").trim();
  if (!rt) return undefined;
  const bare = (rt.match(/<([^>]+)>/)?.[1] || rt).trim().toLowerCase();
  return bare === String(fromEmail || "").trim().toLowerCase() ? undefined : rt;
}

export async function buildSendCommand(
  email: SesEmail,
  o: { to: string; subject: string; fromEmail: string; fromName: string; configurationSet: string; messageHeaders: { Name: string; Value: string }[] }
): Promise<SendEmailCommand> {
  const { to, subject, fromEmail, fromName, configurationSet, messageHeaders } = o;
  const fromHeader = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const replyTo = replyToHeader(email.replyTo, fromEmail);
  if (email.inlineImages?.length) {
    if (!email.html) throw new SesSendError("An email with inline images needs an HTML part.");
    const raw = await buildRawMime({
      from: fromHeader,
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text: email.text,
      html: email.html,
      headers: messageHeaders,
      inlineImages: email.inlineImages,
    });
    return new SendEmailCommand({
      FromEmailAddress: fromHeader,
      Destination: { ToAddresses: [to] },
      ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
      Content: { Raw: { Data: raw } },
    });
  }
  return new SendEmailCommand({
    FromEmailAddress: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    Destination: { ToAddresses: [to] },
    ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
    // Only when set: SES rejects the whole send if it names a configuration set
    // that does not exist, so an empty string must not be passed through.
    ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
    Content: {
      Simple: {
        ...(messageHeaders.length > 0 ? { Headers: messageHeaders } : {}),
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: email.text, Charset: "UTF-8" },
          ...(email.html ? { Html: { Data: email.html, Charset: "UTF-8" } } : {}),
        },
      },
    },
  });
}

/** Turn an SES SDK error into a SesSendError a person can act on. */
function describeSesError(error: unknown, email: SesEmail): never {
  {
    // Each of these has a different fix, and a super admin staring at
    // "Failed to send" cannot tell them apart. Named individually so the panel
    // can say what to actually do.
    if (error instanceof MessageRejected) {
      throw new SesSendError(
        `SES rejected the message: ${error.message}. Usually the From address is not a verified identity, or the account is still in the sandbox and this recipient is not verified.`
      );
    }
    if (error instanceof TooManyRequestsException) {
      throw new SesSendError("SES is throttling — wait a moment and send again.", true);
    }
    if (error instanceof SendingPausedException) {
      throw new SesSendError(
        "SES has paused sending for this account, normally after a bounce or complaint spike. Check Reputation metrics in the SES console."
      );
    }
    if (error instanceof AccountSuspendedException) {
      throw new SesSendError("The SES account is suspended. Nothing can be sent until AWS lifts it.");
    }

    const name = (error as { name?: string })?.name || "";

    // The configuration set the caller named is missing or not allowed: said
    // apart, so a caller that asked for its own lane can fall back once.
    const setCode = email.configurationSet ? configurationSetErrorCode(name, (error as Error)?.message || "", email.configurationSet) : "";
    if (setCode) {
      throw new SesSendError(
        setCode === "configuration_set_missing"
          ? `SES has no configuration set "${email.configurationSet}". AWS said: ${(error as Error)?.message || name}`
          : `The IAM policy does not allow sending with configuration set "${email.configurationSet}". AWS said: ${(error as Error)?.message || name}`,
        false,
        setCode
      );
    }

    // ── Pass AWS's own text through ────────────────────────────────────────
    //
    // The first version of this branch replaced the message with "the IAM user
    // needs ses:SendEmail". That was actively misleading: the permission WAS
    // attached, and AWS's real message named a resource the policy had not
    // anticipated —
    //
    //   not authorized to perform 'ses:SendEmail' on resource
    //   'arn:...:configuration-set/my-first-configuration-set'
    //
    // A send is authorised against BOTH the identity and, when one applies, the
    // configuration set. Hiding which resource was refused cost real debugging
    // time, so the original message is now included verbatim.
    if (name === "AccessDeniedException" || name === "UnrecognizedClientException") {
      const detail = (error as Error)?.message || "";
      throw new SesSendError(
        `SES refused this send. AWS said: ${detail} — check that the IAM policy allows ses:SendEmail on the resource named above. A default configuration set on the identity needs its own statement (see docs/ses-setup.md).`
      );
    }

    console.error("SES send failed:", error);
    throw new SesSendError(
      `Could not send through SES: ${(error as Error)?.message || "unknown error"}`,
      true
    );
  }
}
