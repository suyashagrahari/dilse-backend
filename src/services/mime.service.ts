// ─── Raw MIME for an email with an inline image ──────────────────────────────
//
// SES's Simple content cannot carry attachments, so an email with an inline
// screenshot is built here as a raw RFC 5322 message and sent as Content.Raw:
//
//   multipart/alternative
//   ├── text/plain                 the email as text ("(screenshot … attached)")
//   └── multipart/related
//       ├── text/html              the same paragraphs, <img src="cid:…">
//       └── image/png  (inline)    Content-ID: <…>, Content-Disposition: inline
//
// which is what Gmail itself sends when a person pastes a screenshot. With
// file `attachments` (a billing statement PDF) the whole thing is wrapped in a
// multipart/mixed next to them. Built
// with nodemailer's MailComposer (already a dependency); pure — no network.
// From / To / Subject / Reply-To and the threading headers (In-Reply-To,
// References) go into the message itself; the configuration set stays on the
// SES request. SES replaces Message-ID on send, so none is relied on here.

import MailComposer from "nodemailer/lib/mail-composer";

export interface RawMimeInput {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  headers?: { Name: string; Value: string }[];
  inlineImages: { cid: string; filename: string; contentType: string; content: Buffer }[];
  /** Ordinary attachments (Content-Disposition: attachment), e.g. a PDF. */
  attachments?: { filename: string; contentType: string; content: Buffer }[];
}

export async function buildRawMime(m: RawMimeInput): Promise<Buffer> {
  const headers: Record<string, string> = {};
  for (const h of m.headers || []) headers[h.Name] = h.Value;
  const composer = new MailComposer({
    from: m.from,
    to: m.to,
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    subject: m.subject,
    text: m.text,
    html: m.html,
    headers,
    attachments: [
      ...m.inlineImages.map((i) => ({
        filename: i.filename,
        content: i.content,
        contentType: i.contentType,
        cid: i.cid,
        contentDisposition: "inline" as const,
      })),
      ...(m.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        contentDisposition: "attachment" as const,
      })),
    ],
    // Plain 8bit/quoted-printable text; no X-Mailer advertising nodemailer.
    xMailer: false,
  });
  return composer.compile().build();
}
