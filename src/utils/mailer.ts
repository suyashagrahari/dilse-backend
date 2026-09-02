import { Resend } from "resend";
import { sendSesEmail } from "../services/ses.service";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendContactReplyEmail(
  to: string,
  toName: string,
  replyBody: string,
  originalMessage: string
): Promise<void> {
  if (!resend) {
    console.log(`\n[CONTACT REPLY — no RESEND_API_KEY] To: ${to} | Body: ${replyBody}\n`);
    return;
  }

  const escapedReply = replyBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

  await resend.emails.send({
    from: "SubhSandesh Support <support@subhsandesh.in>",
    to,
    replyTo: "support@subhsandesh.in",
    subject: `Re: Your message to SubhSandesh`,
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
export async function sendFeedbackReplyEmail(opts: {
  to: string;
  toName: string;
  subject: string;
  body: string;
  /** Shown back to them so the email explains itself. */
  rating: number;
  templateLabel: string;
}): Promise<void> {
  const { to, subject, body, rating, templateLabel } = opts;

  if (!resend) {
    console.log(`\n[FEEDBACK REPLY — no RESEND_API_KEY] To: ${to} | Subject: ${subject}\n${body}\n`);
    return;
  }

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

  await resend.emails.send({
    from: "SubhSandesh Support <support@subhsandesh.in>",
    to,
    replyTo: "support@subhsandesh.in",
    subject,
    text: `${body}\n\n—\nYou left us ${stars} feedback${templateLabel ? ` after making your ${templateLabel} page` : ""}. Reply to this email to continue the conversation.\nsupport@subhsandesh.in | subhsandesh.in`,
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
</html>`,
  });
}
