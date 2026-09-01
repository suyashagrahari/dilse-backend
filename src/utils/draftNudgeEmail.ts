// ─── The HTML for a draft follow-up ──────────────────────────────────────────
//
// Kept out of `utils/mailer.ts` because that file is the Resend transport and
// this email goes through SES. Same visual shell as the contact and feedback
// replies — cream, gold, the logo block — so a recipient who has had mail from
// us before recognises it.
//
// ── WHY IT SAYS WHY IT ARRIVED, TWICE ───────────────────────────────────────
//
// This is the only unsolicited mail the platform sends. A stranger's inbox is
// the least forgiving place to be vague about who you are, so the footer states
// plainly why they got it and how to stop it — and the plain-text part carries
// the same line. An email whose recipient cannot tell why it came is a spam
// complaint, and complaints are scored against the sending domain.
//
// There is no unsubscribe LINK because there is no subscription: one follow-up
// per draft, one per person per week, sent by hand. "Reply and we will not write
// again" is a real, honest opt-out that a small team can actually honour.

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderDraftNudgeHtml(opts: {
  /** Exactly the text a super admin approved. */
  body: string;
  templateLabel: string;
  fromEmail: string;
  profileUrl: string;
}): string {
  const { body, templateLabel, fromEmail, profileUrl } = opts;

  // Blank-line separated paragraphs, not <br> soup — the drafts come back as
  // paragraphs and collapsing them ruins readability on a phone.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.85;color:#2e1a10;">${esc(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("\n            ");

  const cta = profileUrl
    ? `
        <tr>
          <td style="padding:0 52px 30px;">
            <a href="${esc(profileUrl)}" style="display:inline-block;background-color:#3d0c11;color:#fffdf9;text-decoration:none;font-size:14px;font-weight:700;padding:13px 26px;border-radius:10px;">
              Open my saved pages
            </a>
          </td>
        </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>SubhSandesh</title>
</head>
<body style="margin:0;padding:0;background-color:#f5ede6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5ede6;">
    <tr><td align="center" style="padding:40px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background-color:#fffdf9;border:1px solid #e4d8cc;border-radius:10px;">

        <tr>
          <td style="padding:26px 52px 0;">
            <p style="margin:0;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#b09a88;">
              Your unfinished page${templateLabel ? ` &nbsp;&bull;&nbsp; <span style="color:#c9a84c;">${esc(templateLabel)}</span>` : ""}
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 52px 24px;">
            ${paragraphs}
          </td>
        </tr>
${cta}
        <tr>
          <td style="padding:0 52px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="height:1px;background-color:#e4d8cc;font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

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
                  <p style="margin:0 0 4px;font-size:12px;color:#7a6050;"><a href="mailto:${esc(fromEmail)}" style="color:#7a6050;text-decoration:none;">${esc(fromEmail)}</a></p>
                  <a href="https://subhsandesh.in" style="font-size:12px;color:#c9a84c;text-decoration:none;font-weight:600;letter-spacing:0.03em;">subhsandesh.in</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Why this arrived, and how to stop it. Not boilerplate: this is the
             only mail we send that nobody asked for. -->
        <tr>
          <td style="padding:0 52px 22px;border-top:1px solid #f0e6da;">
            <p style="margin:14px 0 0;font-size:11px;color:#b09a88;line-height:1.6;">
              You are receiving this because you started a page on SubhSandesh and did not finish it.
              It is still saved and nobody else can see it. Reply to this email if you would rather we did not write again.
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>

</body>
</html>`;
}
