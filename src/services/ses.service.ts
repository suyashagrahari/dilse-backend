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

/** Raised for every SES failure, carrying something a human can act on. */
export class SesSendError extends Error {
  constructor(
    message: string,
    /** True when retrying the identical send might work. */
    readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "SesSendError";
  }
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

export interface SesEmail {
  to: string;
  subject: string;
  /** Plain text. Required — a text part is what keeps mail out of spam folders. */
  text: string;
  html?: string;
  replyTo?: string;
}

export interface SesSendResult {
  /** "sent" when SES accepted it, "skipped" when there are no credentials. */
  outcome: "sent" | "skipped";
  messageId?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (!client) {
    console.log(
      `\n[SES — not configured] To: ${to}\nSubject: ${subject}\n\n${email.text}\n`
    );
    return { outcome: "skipped" };
  }

  const command = new SendEmailCommand({
    FromEmailAddress: `${env.SES_FROM_NAME} <${env.SES_FROM_EMAIL}>`,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [email.replyTo || env.SES_FROM_EMAIL],
    // Only when set: SES rejects the whole send if it names a configuration set
    // that does not exist, so an empty string must not be passed through.
    ...(env.SES_CONFIGURATION_SET ? { ConfigurationSetName: env.SES_CONFIGURATION_SET } : {}),
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: email.text, Charset: "UTF-8" },
          ...(email.html ? { Html: { Data: email.html, Charset: "UTF-8" } } : {}),
        },
      },
    },
  });

  try {
    const res = await client.send(command);
    return { outcome: "sent", messageId: res.MessageId };
  } catch (error) {
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
