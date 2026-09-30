// ─── The HTML and text of an /admin/outreach broadcast ───────────────────────
//
// The same cream-and-gold shell as the draft follow-ups and feedback replies,
// so the mail is recognisably from us, with the SubhSandesh signature ALWAYS
// appended — the model is told not to sign, the super admin cannot remove it,
// and the plain-text part carries it too.
//
// The panel's preview calls the same function (via /outreach/preview), so what
// a super admin looks at before pressing Send is this exact markup, not a
// look-alike drawn in React.

import { firstName } from "../services/feedbackReply.service";

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fill the one merge field. Anything that is not a clean first name becomes "there". */
export function mergeFirstName(text: string, fullName: string): string {
  return text.replace(/\{\{\s*firstName\s*\}\}/g, firstName(fullName) || "there");
}

/** Only absolute http(s) links reach a button. */
export function safeCtaUrl(url: string): string {
  const u = String(url || "").trim();
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.toString() : "";
  } catch {
    return "";
  }
}

export interface BroadcastContent {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

const SIGN_OFF = "With love,\nTeam SubhSandesh";
const FOOTER =
  "You are receiving this because you have an account on SubhSandesh. Reply with \"unsubscribe\" and we will not send you announcements like this again.";

export function renderBroadcast(
  content: BroadcastContent,
  recipient: { name: string },
  fromEmail: string
): { subject: string; html: string; text: string } {
  const body = mergeFirstName(content.body, recipient.name);
  const subject = mergeFirstName(content.subject, recipient.name).replace(/[\r\n]+/g, " ").trim();
  const ctaUrl = safeCtaUrl(content.ctaUrl || "");
  const ctaLabel = (content.ctaLabel || "").trim();
  const hasCta = Boolean(ctaUrl && ctaLabel);

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#2e1a10;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n            ");

  const cta = hasCta
    ? `
        <tr>
          <td style="padding:0 48px 28px;">
            <a href="${esc(ctaUrl)}" style="display:inline-block;background-color:#3d0c11;color:#fffdf9;text-decoration:none;font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;">${esc(ctaLabel)}</a>
          </td>
        </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5ede6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5ede6;">
    <tr><td align="center" style="padding:36px 14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background-color:#fffdf9;border:1px solid #e4d8cc;border-radius:12px;">
        <tr>
          <td style="height:5px;background:linear-gradient(90deg,#3d0c11,#c9a84c);background-color:#3d0c11;border-radius:12px 12px 0 0;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:24px 48px 0;">
            <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#b09a88;">A note from <span style="color:#c9a84c;font-weight:700;">SubhSandesh</span></p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 48px 8px;">
            ${paragraphs}
            <p style="margin:6px 0 22px;font-size:15px;line-height:1.7;color:#2e1a10;">With love,<br><strong>Team SubhSandesh</strong></p>
          </td>
        </tr>
${cta}
        <tr>
          <td style="padding:0 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="height:1px;background-color:#e4d8cc;font-size:0;line-height:0;">&nbsp;</td></tr></table>
          </td>
        </tr>
        <!-- Signature: always present, whatever the body says. -->
        <tr>
          <td style="padding:20px 48px 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:16px;vertical-align:middle;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                    <td style="background-color:#f5ede6;border-radius:14px;border:1px solid #e4d8cc;padding:11px;text-align:center;vertical-align:middle;">
                      <img src="https://subhsandesh.in/logo.png" alt="SubhSandesh" width="58" style="display:block;border:0;height:auto;" />
                    </td>
                  </tr></table>
                </td>
                <td style="vertical-align:middle;">
                  <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1c1008;">SubhSandesh</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#8a6a55;font-style:italic;">Every wish becomes a beautiful memory</p>
                  <p style="margin:0;font-size:12px;">
                    <a href="https://subhsandesh.in" style="color:#c9a84c;text-decoration:none;font-weight:700;">subhsandesh.in</a>
                    <span style="color:#d7c7b8;">&nbsp;&bull;&nbsp;</span>
                    <a href="mailto:${esc(fromEmail)}" style="color:#7a6050;text-decoration:none;">${esc(fromEmail)}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 48px 22px;border-top:1px solid #f0e6da;">
            <p style="margin:14px 0 0;font-size:11px;color:#b09a88;line-height:1.6;">${esc(FOOTER)}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    body,
    hasCta ? `${ctaLabel}: ${ctaUrl}` : "",
    SIGN_OFF,
    `—\nSubhSandesh · Every wish becomes a beautiful memory\nhttps://subhsandesh.in · ${fromEmail}`,
    FOOTER,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, html, text };
}
