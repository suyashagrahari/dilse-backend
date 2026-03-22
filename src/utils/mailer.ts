import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

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
