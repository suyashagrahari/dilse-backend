import { Resend } from "resend";
import { sendSesEmail, threadReplyToAddress } from "../services/ses.service";
import { env } from "../config/env";
import { rfcMessageIdFor } from "../services/emailThread.service";
import { baseDaySlug } from "../config/valentineDays";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendContactReplyEmail(
  to: string,
  toName: string,
  replyBody: string,
  originalMessage: string,
  /** Optional subject; newlines stripped. Defaults to the historical one. */
  subjectLine?: string
): Promise<void> {
  const subject = (subjectLine || "").replace(/[\r\n]+/g, " ").trim().slice(0, 150) || "Re: Your message to SubhSandesh";
  if (!resend) {
    console.log(`\n[CONTACT REPLY — no RESEND_API_KEY] To: ${to} | Body: ${replyBody}\n`);
    return;
  }

  const escapedReply = replyBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

  await resend.emails.send({
    from: "SubhSandesh Support <support@subhsandesh.in>",
    to,
    replyTo: "support@subhsandesh.in",
    subject,
    text: `${replyBody}\n\n— SubhSandesh Support Team\nsupport@subhsandesh.in | subhsandesh.in`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SubhSandesh Support</title>
</head>
<body style="margin:0;padding:0;background-color:#f5ede6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5ede6;">
    <tr><td align="center" style="padding:40px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background-color:#fffdf9;border:1px solid #e4d8cc;border-radius:10px;">

        <!-- Email body: only what admin typed, no auto greeting -->
        <tr>
          <td style="padding:44px 52px 36px;">
            <p style="margin:0;font-size:15px;line-height:1.85;color:#2e1a10;">${escapedReply}</p>
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 52px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="height:1px;background-color:#e4d8cc;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="padding:22px 52px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <!-- Logo: cream rounded square, natural proportions -->
                <td style="padding-right:16px;vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background-color:#f5ede6;border-radius:14px;border:1px solid #e4d8cc;padding:12px;text-align:center;vertical-align:middle;">
                        <img src="https://subhsandesh.in/logo.png" alt="SubhSandesh" width="64" style="display:block;border:0;height:auto;" />
                      </td>
                    </tr>
                  </table>
                </td>
                <!-- Brand info -->
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#1c1008;letter-spacing:-0.01em;">SubhSandesh</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#7a6050;">Support Team &nbsp;&bull;&nbsp; <a href="mailto:support@subhsandesh.in" style="color:#7a6050;text-decoration:none;">support@subhsandesh.in</a></p>
                  <a href="https://subhsandesh.in" style="font-size:12px;color:#c9a84c;text-decoration:none;font-weight:600;letter-spacing:0.03em;">subhsandesh.in</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer note -->
        <tr>
          <td style="padding:0 52px 22px;border-top:1px solid #f0e6da;">
            <p style="margin:14px 0 0;font-size:11px;color:#b09a88;line-height:1.6;">
              You received this because you contacted SubhSandesh. Reply directly to continue the conversation.
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>

</body>
</html>`,
  });
}

/**
 * What happened when we tried to send a sign-in code.
 *
 * Returned rather than thrown. Every caller has to make a decision — a user
 * waiting for a code that will never arrive needs to be told something
 * different from one whose code is on the way — and an exception makes that
 * decision easy to skip. It was skipped: two of the three call sites had a bare
 * `catch {}` and then told the user "a new code has been sent".
 */
export interface OtpSendOutcome {
  delivered: boolean;
  /** Which provider actually accepted it. "none" when nothing did. */
  via: "resend" | "ses" | "logged" | "none";
  /** Every attempt, in order, for the log. Never shown to a user. */
  attempts: { provider: string; ok: boolean; detail?: string }[];
}

/**
 * Send a sign-in code, trying Resend first and then SES.
 *
 * ── WHY TWO PROVIDERS FOR THIS ONE EMAIL ───────────────────────────────────
 *
 * A sign-in code is the only email here whose failure locks a person out of
 * the product. Everything else can be late.
 *
 * Resend is first because it is the established path and its templates and
 * delivery log are what support questions get answered from. But its free tier
 * is capped at 100 emails A DAY — which is the real constraint, not the 3,000
 * a month, because a launch or a festival spike blows through 100 while the
 * monthly figure still looks fine. When that cap is hit, Resend refuses and
 * SES — 50,000/day, and about 30 paise per thousand — carries it.
 *
 * SES sends as `verify@`, NOT as `feedback@`. The follow-up address sends
 * unsolicited mail; a sign-in code sharing its reputation would be the wrong
 * trade in the wrong direction. It gets its own configuration set too, so the
 * bounce and complaint numbers for codes stay readable on their own.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * It does not sign anybody in when both providers fail. That was asked for and
 * it is an account-takeover primitive rather than a fallback: SES refuses to
 * send to addresses on its account suppression list, and a recipient domain
 * can reject our IP for one address and nobody else — so "sending failed" is
 * targetable at a chosen victim, and anyone who could arrange it would be
 * signed in as them. Google sign-in is the safe availability answer, because
 * it needs no email delivery at all.
 */
export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string
): Promise<OtpSendOutcome> {
  const subject = `${otp} — your SubhSandesh sign-up code`;
  const text = `Hi ${name},\n\nYour SubhSandesh verification code is:\n\n${otp}\n\nThis code expires in 15 minutes. If you didn't sign up, you can ignore this email.\n\n— SubhSandesh Team\nsupport@subhsandesh.in`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f5ede6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede6;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#fff8f3;border-radius:20px;border:1px solid rgba(61,12,17,0.12);overflow:hidden;max-width:480px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#3d0c11 0%,#5a1219 100%);padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#c9a84c;font-size:11px;letter-spacing:0.22em;font-weight:700;text-transform:uppercase;">SubhSandesh</p>
            <p style="margin:6px 0 0;color:#f5ede6;font-size:22px;font-weight:700;letter-spacing:-0.01em;">Verify Your Email</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#2a0a0e;font-size:15px;">Hi <strong>${name}</strong>,</p>
            <p style="margin:0 0 24px;color:#7a5555;font-size:14px;line-height:1.6;">
              Use the code below to verify your SubhSandesh account.<br/>
              This code expires in <strong>15 minutes</strong>.
            </p>
            <div style="background:linear-gradient(135deg,#fbf6f1 0%,#f5ede6 100%);border:2px solid rgba(201,168,76,0.45);border-radius:16px;padding:28px;text-align:center;margin-bottom:24px;">
              <p style="margin:0 0 6px;color:#9a7070;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">Your Verification Code</p>
              <p style="margin:0;font-size:44px;font-weight:800;letter-spacing:0.22em;color:#2a0a0e;font-family:'Courier New',monospace;">${otp}</p>
            </div>
            <p style="margin:0;color:#9a7070;font-size:12px;line-height:1.6;">
              If you didn't create a SubhSandesh account, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid rgba(61,12,17,0.08);text-align:center;">
            <p style="margin:0;color:#c9a84c;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">SubhSandesh &bull; Digital Celebrations</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const attempts: OtpSendOutcome["attempts"] = [];

  // ── 1. Resend ───────────────────────────────────────────────────────────
  if (resend) {
    try {
      const result = await resend.emails.send({
        from: "SubhSandesh <verify@subhsandesh.in>",
        to,
        // support@ is a real mailbox; team@ was not, so a reply to a sign-in
        // code bounced. See docs/ses-inbound-setup.md.
        replyTo: "support@subhsandesh.in",
        subject,
        text,
        html,
      });
      // The SDK reports a refusal in `error` rather than by throwing, so a
      // rate-limit rejection looks exactly like success unless it is read.
      if (result?.error) {
        attempts.push({
          provider: "resend",
          ok: false,
          detail: result.error.message || String(result.error),
        });
      } else {
        attempts.push({ provider: "resend", ok: true });
        return { delivered: true, via: "resend", attempts };
      }
    } catch (error) {
      attempts.push({
        provider: "resend",
        ok: false,
        detail: (error as Error)?.message || "threw",
      });
    }
  } else {
    attempts.push({ provider: "resend", ok: false, detail: "no RESEND_API_KEY" });
  }

  // ── 2. SES ──────────────────────────────────────────────────────────────
  try {
    const result = await sendSesEmail({
      to,
      subject,
      text,
      html,
      from: env.SES_OTP_FROM_EMAIL,
      fromName: "SubhSandesh",
      replyTo: "support@subhsandesh.in",
      configurationSet: env.SES_OTP_CONFIGURATION_SET || undefined,
    });
    if (result.outcome === "sent") {
      attempts.push({ provider: "ses", ok: true });
      console.warn(
        `OTP for ${to} went via SES after Resend did not send it: ${attempts
          .filter((a) => !a.ok)
          .map((a) => `${a.provider}=${a.detail}`)
          .join(", ")}`
      );
      return { delivered: true, via: "ses", attempts };
    }
    attempts.push({ provider: "ses", ok: false, detail: "not configured" });
  } catch (error) {
    attempts.push({
      provider: "ses",
      ok: false,
      detail: (error as Error)?.message || "threw",
    });
  }

  // ── 3. Neither is configured: a laptop or a test run ────────────────────
  //
  // Printing the code keeps local development and the integration scripts
  // working with no mail provider at all. `logged` is NOT `delivered` — the
  // caller must still tell the user something went wrong, because in
  // production this branch means nothing was sent.
  const noneConfigured = attempts.every(
    (a) => a.detail === "no RESEND_API_KEY" || a.detail === "not configured"
  );
  if (noneConfigured) {
    console.log(`\n[OTP EMAIL — no mail provider configured] To: ${to} | Name: ${name} | Code: ${otp}\n`);
    return { delivered: false, via: "logged", attempts };
  }

  console.error(
    `OTP for ${to} was NOT SENT. Attempts: ${attempts
      .map((a) => `${a.provider}=${a.ok ? "ok" : a.detail}`)
      .join(", ")}`
  );
  return { delivered: false, via: "none", attempts };
}

export async function sendApologyAgreementEmail(opts: {
  to: string[];
  cc?: string[];
  senderName: string;
  recipientName: string;
  signerName: string;
  tokenId: string;
  pdf: Buffer;
}): Promise<void> {
  const norm = (arr: string[] | undefined) =>
    Array.from(new Set((arr || []).map((e) => (e || "").trim().toLowerCase()).filter(Boolean)));

  let recipients = norm(opts.to);
  // CC = extras not already in `to` (so both the delivery inbox and the creator get it).
  let ccList = norm(opts.cc).filter((e) => !recipients.includes(e));

  // Never send with an empty `to`: if only a CC address exists, promote it.
  if (recipients.length === 0 && ccList.length > 0) {
    recipients = ccList;
    ccList = [];
  }

  if (recipients.length === 0) {
    console.log(`[APOLOGY AGREEMENT — no recipients] Token: ${opts.tokenId}`);
    return;
  }

  if (!resend) {
    console.log(
      `\n[APOLOGY AGREEMENT — no RESEND_API_KEY] To: ${recipients.join(", ")}${ccList.length ? ` | Cc: ${ccList.join(", ")}` : ""} | Signed by: ${opts.signerName} | Token: ${opts.tokenId}\n`
    );
    return;
  }

  try {
    await resend.emails.send({
      from: "SubhSandesh <love@subhsandesh.in>",
      to: recipients,
      ...(ccList.length ? { cc: ccList } : {}),
      replyTo: "support@subhsandesh.in",
      subject: `💖 Forgiveness Agreement — signed by ${opts.signerName}`,
      text: `Wonderful news! ${opts.signerName} just forgave ${opts.senderName} 💖\n\nThe apology has been lovingly accepted, and the official Forgiveness Agreement has been signed. Your signed agreement is attached to this email as a keepsake.\n\nToken: ${opts.tokenId}\n\nMade with love,\n— SubhSandesh\nsupport@subhsandesh.in | subhsandesh.in`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#ffeef2;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffeef2;padding:40px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#fff5f5;border-radius:22px;border:2px solid #ff5f8a;overflow:hidden;max-width:500px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#ff5f8a 0%,#e64072 100%);padding:30px 32px;text-align:center;">
            <p style="margin:0;color:#ffe3ec;font-size:11px;letter-spacing:0.22em;font-weight:700;text-transform:uppercase;">SubhSandesh</p>
            <p style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.01em;">💖 Forgiveness Granted</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;color:#3a2233;font-size:17px;font-weight:700;text-align:center;">
              ${escapeHtml(opts.signerName)} just forgave ${escapeHtml(opts.senderName)} 💖
            </p>
            <p style="margin:0 0 20px;color:#8a5c6f;font-size:14px;line-height:1.7;text-align:center;">
              The apology to <strong style="color:#e64072;">${escapeHtml(opts.recipientName)}</strong> has been lovingly accepted,
              and the official Apology &amp; Forgiveness Agreement is now signed and sealed.
            </p>
            <div style="background:#fff0f4;border-radius:16px;padding:22px;text-align:center;margin-bottom:20px;">
              <p style="margin:0 0 6px;color:#a56f82;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;">Your signed agreement is attached 📎</p>
              <p style="margin:0;color:#3a2233;font-size:13px;line-height:1.6;">Keep it forever as a sweet reminder of love, patience, and second chances.</p>
            </div>
            <p style="margin:0;color:#a56f82;font-size:12px;line-height:1.6;text-align:center;">
              Token: <strong style="color:#e64072;">${escapeHtml(opts.tokenId)}</strong> &bull; Expires: Never ∞
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 26px;border-top:1px solid rgba(255,95,138,0.2);text-align:center;">
            <p style="margin:0;color:#ff5f8a;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;">SubhSandesh &bull; made with 💗</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
      attachments: [
        {
          filename: `apology-agreement-${opts.tokenId}.pdf`,
          content: opts.pdf,
        },
      ],
    });
  } catch (err) {
    console.error(
      `[APOLOGY AGREEMENT] Failed to send email for token ${opts.tokenId}:`,
      err
    );
  }
}

/**
 * The invitation was answered. Goes to the page owner, so the person who
 * planned the evening hears "she said yes" without having to keep checking.
 */
export async function sendDateRsvpEmail(opts: {
  to: string;
  senderName: string;
  recipientName: string;
  state: "accepted" | "declined" | "reschedule";
  proposedDate: string;
  startsAt: string;
  link: string;
}): Promise<void> {
  const who = opts.recipientName || "They";
  const fmt = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isNaN(t)
      ? ""
      : new Date(t).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
  };
  const copy =
    opts.state === "accepted"
      ? { subject: `💘 ${who} said yes to your date`, head: `${who} said yes 💘`, body: `It's a date${fmt(opts.startsAt) ? ` — ${fmt(opts.startsAt)}` : ""}. Open the invitation on the night: only you can tap "we're here", and the plan unlocks for both of you.` }
      : opts.state === "reschedule"
        ? { subject: `📅 ${who} suggested another day`, head: `${who} suggested another day 📅`, body: `${who} would love to go${fmt(opts.proposedDate) ? ` on ${fmt(opts.proposedDate)}` : " on a different day"} instead.` }
        : { subject: `${who} answered your invitation`, head: `${who} answered`, body: `${who} said not this time. Thank you for asking so kindly.` };

  if (!resend) {
    console.log(`\n[DATE RSVP — no RESEND_API_KEY] To: ${opts.to} | ${copy.subject}\n`);
    return;
  }
  try {
    await resend.emails.send({
      from: "SubhSandesh <love@subhsandesh.in>",
      to: [opts.to],
      replyTo: "support@subhsandesh.in",
      subject: copy.subject,
      text: `${copy.head}\n\n${copy.body}\n\nOpen the invitation: ${opts.link}\n\n— SubhSandesh`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#12081f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#12081f;padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1f0f33;border-radius:24px;border:1px solid rgba(255,255,255,.14);overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:linear-gradient(115deg,#ff4f8b,#ff7a5c,#ffb03c);padding:28px 30px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:11px;letter-spacing:.22em;font-weight:700;text-transform:uppercase;">SubhSandesh · The Invitation</p>
          <p style="margin:8px 0 0;color:#fff;font-size:26px;font-weight:800;">${escapeHtml(copy.head)}</p>
        </td></tr>
        <tr><td style="padding:28px 30px;text-align:center;">
          <p style="margin:0 0 22px;color:#fff6fb;font-size:15px;line-height:1.7;">${escapeHtml(copy.body)}</p>
          <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#d8ff5c;color:#1a0d26;font-weight:800;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;">Open the invitation</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim(),
    });
  } catch (err) {
    console.error("[DATE RSVP] Failed to send email:", err);
  }
}

/** Happy Birthday's "when?" answers, in the order the page offers them (client HB_PLANS). */
const BIRTHDAY_PLANS = ["tonight 🌙", "this weekend 🗓️", "whenever you plan it — surprise them ✨"] as const;

/**
 * A Valentine's-week question was answered (Propose Day, Valentine's Day).
 * Goes to the page owner — modelled on sendDateRsvpEmail. Usually "yes" (the
 * "No" button runs away); a page whose sender chose "Yes or No" can also
 * record a "no", which gets a gentle, kind note instead. Fired once per page
 * (the react beacon is first-wins: yes and no share one slot), never blocks
 * the recipient.
 */
export async function sendValentineAnswerEmail(opts: {
  to: string;
  senderName: string;
  recipientName: string;
  /** "Propose Day" / "Valentine's Day" */
  dayName: string;
  /** The question as the recipient saw it. */
  question: string;
  noDodges: number;
  link: string;
  /** The template — Halloween gets its own "boo" wording and night palette. */
  slug?: string;
  /** Default "yes". */
  answer?: "yes" | "no";
  /** Happy Birthday: the "when?" pick — 1 tonight · 2 this weekend · 3 you plan it. */
  count?: number;
}): Promise<void> {
  // The names and question are the page owner's free text and the name lands in
  // the subject line: fold line breaks / control characters to a space.
  const oneLine = (s: string) => (s || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  const who = oneLine(opts.recipientName) || "They";
  const question = oneLine(opts.question);
  // The premium twin ("happy-halloween-premium") gets the same wording.
  const halloween = baseDaySlug(opts.slug ?? "") === "happy-halloween";
  const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;
  const dandiya = opts.slug === "dandiya-partner";
  // The apology page: "yes" is forgiveness, and its only "no" is an honest "I need a little time".
  const sorry = opts.slug === "sorry";
  // Its premium edition ("After the Rain"): no runaway No; "no" is an honest "I need a little time".
  const sorryPremium = opts.slug === "sorry-premium";
  // The birthday page: yes to a birthday date, and (when the sender asked) when.
  const birthday = opts.slug === "happy-birthday" || opts.slug === "birthday-premium";
  const plan = birthday ? BIRTHDAY_PLANS[(opts.count ?? 0) - 1] ?? "" : "";
  // The long-distance page: the question is a small ask ("Video call tonight?"); its only "no" is a gentle "Not tonight 🌙".
  const missYou = opts.slug === "miss-you";
  // Its premium edition: "yes" to the call, and (by default) an honest "Later 🌙" instead of a no.
  const missPrem = opts.slug === "miss-you-premium";
  // The proposal page: "yes" makes it official; its only "no" is an honest "Let me think about it".
  // The Proposal ✦ Premium (the garden edition) words it the same way, with its No that wilts.
  const garden = opts.slug === "proposal-premium";
  const mine = opts.slug === "will-you-be-mine" || garden;
  // The birthday storybook has no runaway No: "hmm…" spins a prize wheel where every slice says yes.
  const storybook = opts.slug === "birthday-premium";
  // The anniversary museum: "another year of us?" — both of its buttons are a yes.
  const anniversary = opts.slug === "happy-anniversary";
  // The anniversary book: yes-only, answered by dragging a heart into the sender's.
  const anni = opts.slug === "anniversary-premium";
  const dodges = anniversary || anni
    ? ""
    : missPrem
    ? " They went through the whole day, morning to sunrise, first 🩵"
    : sorryPremium
    ? " The rain's gone 🌈"
    : birthday
    ? opts.noDodges > 0
      ? storybook
        ? ` They spun the “hmm…” wheel ${times(opts.noDodges)} first — it only says yes 🎡`
        : ` The No button ran away ${times(opts.noDodges)} first 🎈`
      : " First try, no hesitation 🎂"
    : missYou
    ? opts.noDodges > 0
      ? ` The No button ran away ${times(opts.noDodges)} first 🥹`
      : " First try. They miss you too 💗"
    : garden
    ? opts.noDodges > 0
      ? ` The No button wilted ${times(opts.noDodges)} first, and the YES button just kept blooming 🌷`
      : " First try. Not a second of doubt 💗"
    : mine
    ? opts.noDodges > 0
      ? ` The No button ran away ${times(opts.noDodges)} first, and the YES button just kept growing 🙈`
      : " First try. Not a second of doubt 💗"
    : sorry
    ? opts.noDodges > 0
      ? ` The No button ran away ${times(opts.noDodges)} first 🥺`
      : " First try. No hesitation 💗"
    : halloween
    ? opts.noDodges > 0
      ? ` The No button ghosted them ${times(opts.noDodges)} first 👻`
      : " First try, not even a little spooked."
    : dandiya
      ? opts.noDodges > 0
        ? ` The No button twirled away ${times(opts.noDodges)} first 🥢`
        : " First try, straight into the circle."
    : opts.noDodges > 0
      ? ` After chasing the "No" button ${times(opts.noDodges)} 😄`
      : " First try, no hesitation.";
  const no = opts.answer === "no";
  const subject = anniversary
    ? `💗 ${who} said yes to another year of you two`
    : anni
    ? `💞 ${who} said yes — happy anniversary`
    : missPrem
    ? no
      ? `🌙 ${who} said “later” — and they miss you too`
      : `📞 ${who} said yes to a call tonight`
    : birthday
    ? `🎂 ${who} said YES to a birthday date`
    : missYou
    ? no
      ? `🌙 ${who} saw your miss-you page`
      : `📞 ${who} said yes — they miss you too`
    : mine
    ? no
      ? `🤍 ${who} wants a little time to think`
      : `💍 ${who} said YES to being yours`
    : sorryPremium
    ? no
      ? `🌦️ ${who} read every word, and needs a little time`
      : `🌈 ${who} forgave you`
    : sorry
    ? no
      ? `🤍 ${who} read your sorry page`
      : `💗 ${who} forgave you`
    : no
    ? `${who} answered your ${opts.dayName} page`
    : halloween ? `👻 ${who} said YES to being your boo` : dandiya ? `🪔 ${who} said YES to being your Dandiya partner` : `💍 ${who} said YES`;
  const head = anniversary ? `${who} said yes to another year 💗` : anni ? `${who} said yes 💞` : missPrem ? (no ? `Later, but soon 🌙` : `${who} said yes 📞🩵`) : birthday ? `${who} said YES 🥳` : mine ? (no ? `${who} is thinking about it 🤍` : `${who} said YES 💍`) : missYou ? (no ? `Not tonight, but they miss you too 🌙` : `${who} said yes 📞💗`) : sorryPremium ? (no ? `${who} needs a little time 🌦️` : `${who} forgave you 🌈`) : sorry ? (no ? `${who} needs a little time 🤍` : `${who} forgave you 💗`) : no ? `${who} said no, kindly 💔` : halloween ? `${who} said YES 🎃` : dandiya ? `${who} said YES 💃` : `${who} said YES 💘`;
  const body = anniversary
    ? `${question ? `“${question}” — ` : ""}${who} walked through your whole little museum and said yes to another year. Happy anniversary, you two 🖼️💗`
    : anni
    ? `${question ? `“${question}” — ` : ""}${who} read your whole book — every chapter, every promise — and put their heart right next to yours. Happy anniversary 💗`
    : missPrem && no
    ? `${question ? `“${question}” — ` : ""}${who} walked through your whole long-distance day — the radio, the picnic, the stars — and said “later” to tonight. Not a no; keep your phone on loud. 🌙`
    : missPrem
    ? `${question ? `“${question}” — ` : ""}${who} said yes. Go call them 🩵${dodges}`
    : birthday
    ? `${question ? `“${question}” — ` : ""}${who} said yes!${plan ? ` When: ${plan}.` : ""}${dodges}`
    : missYou && no
    ? `${question ? `“${question}” — ` : ""}${who} went through your whole miss-you page and said “not tonight” this time. Same moon, different sky; they'll be thinking of you. 🌙`
    : missYou
    ? `${question ? `“${question}” — ` : ""}${who} said yes. Go call them 💗${dodges}`
    : mine && no
    ? `${who} saw everything you made — ${garden ? "every chapter, every petal" : "every chapter, every star"} — and wants a little time to think. That's not a no; give them a little space. 🤍`
    : mine
    ? `${question ? `“${question}” — ` : ""}${who} said yes. It's official: you're theirs, and they're yours 💗${dodges}`
    : sorryPremium && no
    ? `${who} opened the door, read every word and signed your peace contract, and needs a little time before the sun comes out. Give them some space; they know you're sorry. 🌦️`
    : sorryPremium
    ? `${question ? `“${question}” — ` : ""}${who} said yes and pushed the last clouds away. You're forgiven; go give them that hug.${dodges}`
    : sorry && no
    ? `${who} read every word of your apology and needs a little time. Give them some space; they know you're sorry. 🤍`
    : sorry
    ? `${question ? `“${question}” — ` : ""}${who} said yes. You're forgiven 💗${dodges}`
    : no
    ? `${question ? `“${question}” — ` : ""}${who} opened your ${opts.dayName} page, saw everything you made, and chose “no” this time. It takes courage to ask, and your page was still a gift. 🪔`
    : `${question ? `“${question}” — ` : ""}${who} answered yes on your ${opts.dayName} page.${dodges}`;
  const band = anniversary ? "linear-gradient(115deg,#ae3558,#d9577a,#f3d9a4)" : missPrem ? "linear-gradient(115deg,#7fa8f5,#ec5f9c,#ffd9ea)" : birthday ? "linear-gradient(115deg,#c93a63,#ee5583,#ffc94d)" : garden ? "linear-gradient(115deg,#a63d58,#d45e78,#ffd3a6)" : mine ? "linear-gradient(115deg,#9a3150,#e0637f,#e2a98f)" : missYou ? "linear-gradient(115deg,#1a1f4b,#5b3fb0,#ff7eae)" : sorryPremium ? "linear-gradient(115deg,#b5365a,#f4a7bb,#9ccbf2)" : sorry ? "linear-gradient(115deg,#d9466e,#ff8fab,#ffd3e2)" : halloween ? "linear-gradient(115deg,#3a2257,#b84e14,#ff8a3d)" : "linear-gradient(115deg,#7a1035,#d7263d,#e6c27a)";
  const pageBg = halloween ? "#17122b" : "#1e0f24";
  const cardBg = halloween ? "#251842" : "#2a1240";
  const button = halloween ? "#ff8a3d" : "#f6e3b4";

  if (!resend) {
    console.log(`\n[VALENTINE ANSWER — no RESEND_API_KEY] To: ${opts.to} | ${subject} | ${body}\n`);
    return;
  }
  try {
    await resend.emails.send({
      from: "SubhSandesh <love@subhsandesh.in>",
      to: [opts.to],
      replyTo: "support@subhsandesh.in",
      subject,
      text: `${head}\n\n${body}\n\nOpen your page: ${opts.link}\n\n— SubhSandesh`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:${pageBg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${pageBg};padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:${cardBg};border-radius:24px;border:1px solid rgba(255,255,255,.14);overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:${band};padding:28px 30px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:11px;letter-spacing:.22em;font-weight:700;text-transform:uppercase;">SubhSandesh · ${escapeHtml(opts.dayName)}</p>
          <p style="margin:8px 0 0;color:#fff;font-size:26px;font-weight:800;">${escapeHtml(head)}</p>
        </td></tr>
        <tr><td style="padding:28px 30px;text-align:center;">
          <p style="margin:0 0 22px;color:#fff6ec;font-size:15px;line-height:1.7;">${escapeHtml(body)}</p>
          <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:${button};color:#1e0f24;font-weight:800;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;">Open your page</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim(),
    });
  } catch (err) {
    console.error("[VALENTINE ANSWER] Failed to send email:", err);
  }
}

/**
 * The recipient of a premium page wrote back (the one reply it allows).
 * Modelled on sendValentineAnswerEmail. Everything the recipient or the owner
 * typed is HTML-escaped; the names that reach the subject lose CR/LF and every
 * other control character; the reply keeps its line breaks (as <br>).
 * Fire-and-forget from the controller — never blocks the recipient.
 */
export async function sendValentineReplyEmail(opts: {
  to: string;
  senderName: string;
  recipientName: string;
  /** "Rose Day" / "Halloween" — the base day's plain name. */
  dayName: string;
  slug?: string;
  /** Already cleaned by cleanReplyText (≤ 280, newlines kept). */
  reply: string;
  link: string;
}): Promise<void> {
  const oneLine = (s: string) =>
    (s || "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const esc = (s: string) => escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const who = oneLine(opts.recipientName) || "They";
  const dayName = oneLine(opts.dayName);
  const halloween = baseDaySlug(opts.slug ?? "") === "happy-halloween";
  const reply = (opts.reply || "").replace(/\r\n?/g, "\n");
  const subject = halloween ? `🦇 ${who} left you a note on your ${dayName} page` : `💌 ${who} wrote back`;
  const head = halloween ? `${who} wrote back 🎃` : `${who} wrote back 💌`;
  const intro = `${who} replied on your ${dayName} page:`;
  const replyHtml = esc(reply).replace(/\n/g, "<br />");
  const band = halloween ? "linear-gradient(115deg,#3a2257,#b84e14,#ff8a3d)" : "linear-gradient(115deg,#7a1035,#d7263d,#e6c27a)";
  const pageBg = halloween ? "#17122b" : "#1e0f24";
  const cardBg = halloween ? "#251842" : "#2a1240";
  const button = halloween ? "#ff8a3d" : "#f6e3b4";

  if (!resend) {
    console.log(`\n[VALENTINE REPLY — no RESEND_API_KEY] To: ${opts.to} | ${subject} | ${intro} ${JSON.stringify(reply)}\n`);
    return;
  }
  try {
    await resend.emails.send({
      from: "SubhSandesh <love@subhsandesh.in>",
      to: [opts.to],
      replyTo: "support@subhsandesh.in",
      subject,
      text: `${head}\n\n${intro}\n\n${reply}\n\nOpen your page: ${opts.link}\n\n— SubhSandesh`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:${pageBg};font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${pageBg};padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:${cardBg};border-radius:24px;border:1px solid rgba(255,255,255,.14);overflow:hidden;max-width:480px;width:100%;">
        <tr><td style="background:${band};padding:28px 30px;text-align:center;">
          <p style="margin:0;color:#fff;font-size:11px;letter-spacing:.22em;font-weight:700;text-transform:uppercase;">SubhSandesh · ${esc(dayName)}</p>
          <p style="margin:8px 0 0;color:#fff;font-size:26px;font-weight:800;">${esc(head)}</p>
        </td></tr>
        <tr><td style="padding:28px 30px;text-align:center;">
          <p style="margin:0 0 14px;color:#fff6ec;font-size:15px;line-height:1.7;">${esc(intro)}</p>
          <p style="margin:0 0 22px;padding:16px 18px;border-radius:16px;background:rgba(255,255,255,.08);color:#fff6ec;font-size:16px;line-height:1.7;text-align:left;white-space:normal;word-break:break-word;">${replyHtml}</p>
          <a href="${esc(opts.link)}" style="display:inline-block;background:${button};color:#1e0f24;font-weight:800;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:999px;">Open your page</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`.trim(),
    });
  } catch (err) {
    console.error("[VALENTINE REPLY] Failed to send email:", err);
  }
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Replying to a piece of post-publish feedback ─────────────────────────────
//
// Sent from /admin/feedback when a super admin approves a reply. The body is
// whatever they had in the textarea when they pressed Send — typed by them, or
// generated by `services/feedbackReply.service` and then read and edited by
// them. Nothing reaches this function unread by a human.
//
// ── WHY THIS IS NOT sendContactReplyEmail ───────────────────────────────────
//
// It is nearly the same email, and reusing that one was the first plan. Two
// things stopped it. The subject there is hardcoded to "Re: Your message to
// SubhSandesh", which is a lie about a message the creator never sent — they
// rated a page, they did not write in. And the footer line explains that the
// recipient contacted support, which would be the second lie in the same email.
// A reply to unsolicited feedback has to say why it arrived, or it reads as
// spam from a brand the recipient does not remember writing to.
//
// The layout is shared with that email on purpose: same shell, same signature
// block, same cream-and-gold. Only the subject, the context strip and the
// footer differ.
/**
 * What actually happened to a feedback reply.
 *
 * `rfcMessageId` is the point of this whole shape. See the note on provider
 * order inside the function.
 */
export interface FeedbackReplyOutcome {
  /** The address it went out as, so the conversation record need not guess. */
  fromAddress: string;
  /** Which provider sent it, or "" if nothing was configured. */
  via: "ses" | "resend" | "";
  /**
   * The RFC Message-ID of what we sent, in `<…>` form — or "" when unknowable.
   *
   * Only SES yields one: it returns an id from which the real header value can
   * be reconstructed exactly. Resend reports no Message-ID and documents no
   * pattern, so a Resend send honestly carries "" rather than a guess.
   */
  rfcMessageId: string;
}

export async function sendFeedbackReplyEmail(opts: {
  to: string;
  toName: string;
  subject: string;
  body: string;
  /** Shown back to them so the email explains itself. */
  rating: number;
  templateLabel: string;
  /**
   * `In-Reply-To` and `References`, when the conversation already has a
   * message to anchor to.
   *
   * Absent on the first reply to a piece of in-app feedback: the creator's
   * comment arrived through a form, not as mail, so there is no id to point at.
   */
  headers?: { inReplyTo?: string; references?: string };
}): Promise<FeedbackReplyOutcome> {
  const { to, subject, body, rating, templateLabel } = opts;

  // Named once and answered to the caller, so the conversation record can say
  // which address the reply went out as without keeping a second copy of this
  // literal that drifts the first time it changes here.
  const fromAddress = "support@subhsandesh.in";

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Paragraphs, not <br> soup: the drafts come back with blank-line separated
  // paragraphs and collapsing them into one block ruins the one thing that
  // makes a support email readable on a phone.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.85;color:#2e1a10;">${esc(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n            ");

  const stars = "★".repeat(Math.max(1, Math.min(5, Math.round(rating))));
  const context = templateLabel
    ? `${stars} on your ${esc(templateLabel)} page`
    : `${stars} rating`;

  const text = `${body}\n\n—\nYou left us ${stars} feedback${templateLabel ? ` after making your ${templateLabel} page` : ""}. Reply to this email to continue the conversation.\nsupport@subhsandesh.in | subhsandesh.in`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SubhSandesh Support</title>
</head>
<body style="margin:0;padding:0;background-color:#f5ede6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5ede6;">
    <tr><td align="center" style="padding:40px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background-color:#fffdf9;border:1px solid #e4d8cc;border-radius:10px;">

        <!-- Why this email exists, in one quiet line -->
        <tr>
          <td style="padding:26px 52px 0;">
            <p style="margin:0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#b09a88;">
              About your feedback &nbsp;&bull;&nbsp; <span style="color:#c9a84c;">${context}</span>
            </p>
          </td>
        </tr>

        <!-- The reply itself: exactly what a human approved -->
        <tr>
          <td style="padding:22px 52px 30px;">
            ${paragraphs}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 52px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="height:1px;background-color:#e4d8cc;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- Signature -->
        <tr>
          <td style="padding:22px 52px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:16px;vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background-color:#f5ede6;border-radius:14px;border:1px solid #e4d8cc;padding:12px;text-align:center;vertical-align:middle;">
                        <img src="https://subhsandesh.in/logo.png" alt="SubhSandesh" width="64" style="display:block;border:0;height:auto;" />
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#1c1008;letter-spacing:-0.01em;">SubhSandesh</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#7a6050;">Support Team &nbsp;&bull;&nbsp; <a href="mailto:support@subhsandesh.in" style="color:#7a6050;text-decoration:none;">support@subhsandesh.in</a></p>
                  <a href="https://subhsandesh.in" style="font-size:12px;color:#c9a84c;text-decoration:none;font-weight:600;letter-spacing:0.03em;">subhsandesh.in</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer note: says truthfully why they got this -->
        <tr>
          <td style="padding:0 52px 22px;border-top:1px solid #f0e6da;">
            <p style="margin:14px 0 0;font-size:11px;color:#b09a88;line-height:1.6;">
              You received this because you left feedback on SubhSandesh after publishing a page. Reply directly to continue the conversation.
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>

</body>
</html>`;

  // ── Why SES goes FIRST here, and Resend second ─────────────────────────────
  //
  // The opposite order from `sendOtpEmail`, deliberately.
  //
  // A feedback reply is one half of a conversation, and the other half arrives
  // as email. Matching an inbound reply to the right conversation works best
  // off the `In-Reply-To` header, which means we have to KNOW the Message-ID of
  // what we sent. SES returns an id from which the real header value
  // reconstructs exactly; Resend reports no Message-ID at all and documents no
  // pattern to build one from.
  //
  // Sending through Resend therefore cost us the top rung of the inbound
  // matching ladder for every feedback reply. What was left all required the
  // creator to reply FROM the address on their account — so anyone replying
  // from a different address landed in Unmatched, looking like a stranger
  // writing in. Conversation replies never had this problem, because they
  // already went via SES.
  //
  // Resend stays as the fallback rather than being removed: it is a working
  // customer-facing path, and a support reply that fails to send is worse than
  // one whose id we cannot record. A Resend send honestly reports `""`.
  const replyTo = threadReplyToAddress();
  const headers = opts.headers?.inReplyTo || opts.headers?.references
    ? {
        ...(opts.headers.inReplyTo ? { "In-Reply-To": opts.headers.inReplyTo } : {}),
        ...(opts.headers.references ? { References: opts.headers.references } : {}),
      }
    : undefined;

  // ── 1. SES ────────────────────────────────────────────────────────────────
  try {
    const result = await sendSesEmail({
      to,
      subject,
      text,
      html,
      from: fromAddress,
      fromName: "SubhSandesh Support",
      // NOT support@ and NOT feedback@. Apex mail is GoDaddy's, so a reply to
      // either arrives in a mailbox nothing watches and the conversation view
      // shows only our side — reading as if they never replied. This is the
      // address SES itself receives on for this deployment.
      replyTo,
      headers,
    });
    if (result.outcome === "sent") {
      return {
        fromAddress,
        via: "ses",
        rfcMessageId: rfcMessageIdFor(result.messageId || "", env.SES_REGION),
      };
    }
    // "skipped" — SES is not configured here. Fall through to Resend.
  } catch (error) {
    console.warn(
      `Feedback reply to ${to} did not go via SES, trying Resend: ${(error as Error)?.message || "threw"}`
    );
  }

  // ── 2. Resend ─────────────────────────────────────────────────────────────
  if (!resend) {
    console.log(`\n[FEEDBACK REPLY — no provider configured] To: ${to} | Subject: ${subject}\n${body}\n`);
    return { fromAddress, via: "", rfcMessageId: "" };
  }

  await resend.emails.send({
    from: `SubhSandesh Support <${fromAddress}>`,
    to,
    replyTo,
    subject,
    text,
    html,
    ...(headers ? { headers } : {}),
  });

  // No id: see the note above. The conversation still holds together on the
  // subject line, and becomes exact the moment the creator replies and gives
  // us a real id to anchor to.
  return { fromAddress, via: "resend", rfcMessageId: "" };
}
