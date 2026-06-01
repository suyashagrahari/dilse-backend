import { Resend } from "resend";
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

export async function sendOtpEmail(
  to: string,
  name: string,
  otp: string
): Promise<void> {
  if (!resend) {
    console.log(`\n[OTP EMAIL — no RESEND_API_KEY] To: ${to} | Name: ${name} | Code: ${otp}\n`);
    return;
  }

  await resend.emails.send({
    from: "SubhSandesh <verify@subhsandesh.in>",
    to,
    replyTo: "team@subhsandesh.in",
    subject: `${otp} — your SubhSandesh sign-up code`,
    text: `Hi ${name},\n\nYour SubhSandesh verification code is:\n\n${otp}\n\nThis code expires in 15 minutes. If you didn't sign up, you can ignore this email.\n\n— SubhSandesh Team\nteam@subhsandesh.in`,
    html: `
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
</html>`.trim(),
  });
}
