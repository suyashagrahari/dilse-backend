// ─── The billing statement email: a pure builder ────────────────────────────
//
// Turns a list of settled orders into { subject, html, text }. No database, no
// SES — the preview endpoint and the send endpoint both call this, so what the
// super admin previews is byte-for-byte what is sent (apart from invoice
// numbers, which a preview shows as "pending" because it must not burn any).
//
// ── WHAT THE EMAIL SAYS ─────────────────────────────────────────────────────
//
// Thank you first: an animated "Thank you!" card, then the thank-you message
// (written by AI or by the super admin, see billingThanksAi.service.ts), then a
// short summary of the statement, a line saying the full statement is attached
// as a PDF (billingPdf.ts builds it from the same lines), any note, and an
// animated "See you next time" card before the business footer.
//
// ── WHY TABLES AND INLINE STYLES ────────────────────────────────────────────
//
// Gmail strips <style> blocks in many contexts and Outlook renders with Word's
// engine, which ignores flexbox, grid and most of CSS. Nested tables with
// inline styles and explicit widths are the only layout both get right. No web
// fonts. The two GIFs travel INSIDE the email as inline parts (cid:), so no
// image is fetched from a server: nothing to block, nothing to track. The
// preview swaps cid: for data: URLs so the browser can show them.
//
// ── ESCAPING ────────────────────────────────────────────────────────────────
//
// Every string that came from a user or the database — name, email, template
// label, note, payment id, URL — goes through `esc`. A page title or a user
// name with "<script>" in it must arrive as text. The plain-text part needs no
// escaping but has newlines in user strings collapsed so it cannot fake lines.

import { BUSINESS } from "../config/business";
import { formatMinor, formatPeriod, istDate } from "./revenueMath";

export interface StatementLine {
  orderId: string;
  paidAt: Date;
  /** Null in a preview, or for a points unlock (no money, no invoice). */
  invoiceNumber: string | null;
  templateLabel: string;
  /** The live share link, when the page is published. */
  pageUrl: string | null;
  status: "paid" | "points_used";
  currency: string;
  listAmount: number;
  discountAmount: number;
  discountLabel: string;
  pointsUsed: number;
  /** What was charged, minor units of `currency` (0 for points). */
  amount: number;
  amountInrPaise: number;
  razorpayPaymentId: string | null;
}

export interface StatementInput {
  billedTo: { name: string; email: string };
  period: { from: string; to: string };
  lines: StatementLine[];
  note?: string | null;
  /** The thank-you message (plain text, blank lines between paragraphs). Empty: the default one. */
  message?: string | null;
  /** A subject the super admin wrote. Empty: the default one. */
  subject?: string | null;
  /** True for the preview: missing invoice numbers read "pending", not "—". */
  preview?: boolean;
}

export interface CurrencyTotal {
  currency: string;
  subtotal: number;
  discount: number;
  paid: number;
  orders: number;
}

export interface BuiltStatement {
  subject: string;
  html: string;
  text: string;
  orderCount: number;
  /** Money received, INR paise at each order's frozen rate. Points are not money. */
  totalInrPaise: number;
  currencyTotals: CurrencyTotal[];
  pointsUnlocks: number;
  pointsSpent: number;
  /** The thank-you message used. */
  message: string;
}

const C = {
  page: "#f5ede6",
  card: "#fffdfb",
  cream: "#faf3ee",
  text: "#2a0a0e",
  muted: "#7f5f5f",
  maroon: "#3d0c11",
  gold: "#c9a84c",
  border: "#ecdcd0",
};

/** The animated cards, sent as inline parts of the email (files in assets/billing/). */
export const EMAIL_GIFS = [
  { cid: "ss-thanks", filename: "thanks.gif", alt: "Thank you for choosing SubhSandesh" },
  { cid: "ss-seeyou", filename: "seeyou.gif", alt: "See you next time" },
] as const;

export const MESSAGE_MAX = 1500;
export const SUBJECT_MAX = 120;

/** The thank-you message when nobody wrote one. */
export function defaultThankYou(name: string): string {
  const first = flat(name).split(/\s+/)[0] || "";
  return [
    `Dear ${first || "friend"},`,
    `Thank you so much for choosing ${BUSINESS.name} to be a part of your celebration. It means the world to our small team that you trusted us with a moment that matters to you.`,
    "We hope your page brought big smiles to everyone who opened it. Whenever the next occasion comes around, we will be right here, ready to help you make it special.",
  ].join("\n\n");
}

const FONT = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line of plain text: no newlines smuggled in from a user string. */
const flat = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

/** "12 Oct 2026, 3:45 PM IST". */
export function formatIstDateTime(d: Date): string {
  const shifted = new Date(d.getTime() + 330 * 60 * 1000);
  const h24 = shifted.getUTCHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${formatPeriod(istDate(d), istDate(d))}, ${h}:${mm} ${h24 < 12 ? "AM" : "PM"} IST`;
}

/** Per-currency subtotal / discount / paid, over money orders only. */
export function currencyTotalsOf(lines: StatementLine[]): CurrencyTotal[] {
  const by = new Map<string, CurrencyTotal>();
  for (const l of lines) {
    if (l.status !== "paid") continue;
    const t = by.get(l.currency) ?? { currency: l.currency, subtotal: 0, discount: 0, paid: 0, orders: 0 };
    t.subtotal += l.listAmount;
    t.discount += l.discountAmount;
    t.paid += l.amount;
    t.orders += 1;
    by.set(l.currency, t);
  }
  // INR first, then the rest alphabetically — a stable order for the email.
  return [...by.values()].sort((a, b) =>
    a.currency === b.currency ? 0 : a.currency === "INR" ? -1 : b.currency === "INR" ? 1 : a.currency.localeCompare(b.currency)
  );
}

export function buildStatementEmail(input: StatementInput): BuiltStatement {
  const lines = [...input.lines].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const totals = currencyTotalsOf(lines);
  const totalInrPaise = lines.filter((l) => l.status === "paid").reduce((s, l) => s + l.amountInrPaise, 0);
  const pointsLines = lines.filter((l) => l.status === "points_used");
  const pointsSpent = pointsLines.reduce((s, l) => s + l.pointsUsed, 0);
  const mixed = totals.length > 1;
  const periodText = formatPeriod(input.period.from, input.period.to);
  const name = flat(input.billedTo.name) || "Customer";
  const email = flat(input.billedTo.email);
  const note = String(input.note ?? "").trim();
  const invoiceText = (l: StatementLine) =>
    l.invoiceNumber ?? (l.status === "points_used" ? "—" : input.preview ? "pending" : "—");

  const subject = flat(input.subject).slice(0, SUBJECT_MAX) || `Your ${BUSINESS.name} payment statement — ${periodText}`;
  const message = String(input.message ?? "").replace(/\r\n/g, "\n").trim().slice(0, MESSAGE_MAX) || defaultThankYou(name);

  // ── HTML ──────────────────────────────────────────────────────────────────
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;font:${strong ? "700 15px" : "13px"} ${SANS};color:${strong ? C.maroon : C.muted};">${label}</td>` +
    `<td align="right" style="padding:5px 0;font:${strong ? "700 15px" : "13px"} ${SANS};color:${strong ? C.maroon : C.text};text-align:right;">${value}</td></tr>`;

  const items = lines
    .map((l) => {
      const paid = l.status === "points_used" ? `${esc(l.pointsUsed.toLocaleString("en-IN"))} points` : esc(formatMinor(l.amount, l.currency));
      const link = l.pageUrl ? ` · <a href="${esc(l.pageUrl)}" style="color:${C.maroon};">open page</a>` : "";
      return (
        `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.border};font:13px/1.45 ${SANS};color:${C.text};"><strong>${esc(l.templateLabel)}</strong>` +
        `<br><span style="font-size:12px;color:${C.muted};">${esc(formatIstDateTime(l.paidAt))}${link}</span></td>` +
        `<td align="right" valign="top" style="padding:9px 0;border-bottom:1px solid ${C.border};font:600 13px ${SANS};color:${C.text};text-align:right;white-space:nowrap;">${paid}</td></tr>`
      );
    })
    .join("");

  const totalsHtml =
    totals.map((t) => row(mixed ? `${esc(t.currency)} total paid` : "Total paid", esc(formatMinor(t.paid, t.currency)), true)).join("") +
    (mixed ? row("All currencies, in INR (at the rate on each payment date)", esc(formatMinor(totalInrPaise, "INR")), true) : "") +
    (pointsLines.length ? row(`Unlocked with points (${pointsLines.length} page${pointsLines.length > 1 ? "s" : ""})`, `${esc(pointsSpent.toLocaleString("en-IN"))} points`) : "") +
    (totals.some((t) => t.discount > 0) ? row("You saved", totals.filter((t) => t.discount > 0).map((t) => esc(formatMinor(t.discount, t.currency))).join(" + ")) : "");

  const messageHtml = message
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font:15px/1.7 ${SANS};color:${C.text};">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const noteHtml = note
    ? `<tr><td style="padding:0 32px 22px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};border-left:3px solid ${C.gold};"><tr><td style="padding:12px 16px;font:13px/1.6 ${SANS};color:${C.text};white-space:pre-wrap;">${esc(note)}</td></tr></table></td></tr>`
    : "";

  const gif = (g: (typeof EMAIL_GIFS)[number]) =>
    `<img src="cid:${g.cid}" width="560" alt="${esc(g.alt)}" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 auto;">`;

  const footerAddress = BUSINESS.addressLines.map(esc).join("<br>");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:16px;">
<tr><td style="padding:22px 32px 16px;border-bottom:3px solid ${C.gold};background:${C.maroon};border-radius:16px 16px 0 0;" align="center">
  <div style="font:700 24px ${FONT};color:#fffdfb;letter-spacing:.02em;">${esc(BUSINESS.name)}</div>
  <div style="font:12px ${SANS};color:${C.gold};margin-top:4px;text-transform:uppercase;letter-spacing:.16em;">With gratitude</div>
</td></tr>
<tr><td align="center" style="padding:8px 20px 0;background:#fdf6ef;">${gif(EMAIL_GIFS[0])}</td></tr>
<tr><td style="padding:26px 32px 8px;">${messageHtml}</td></tr>
<tr><td style="padding:0 32px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};border:1px solid ${C.border};border-radius:12px;">
    <tr><td style="padding:16px 20px 6px;">
      <div style="font:600 11px ${SANS};color:${C.muted};text-transform:uppercase;letter-spacing:.1em;">Your statement · ${esc(periodText)}</div>
      <div style="font:13px ${SANS};color:${C.text};margin-top:3px;">Billed to ${esc(name)} · ${esc(email)}</div>
    </td></tr>
    <tr><td style="padding:4px 20px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${items}</table></td></tr>
    <tr><td style="padding:6px 20px 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totalsHtml}</table></td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 32px 22px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed ${C.gold};border-radius:12px;"><tr>
    <td width="44" valign="middle" style="padding:14px 0 14px 16px;font:26px ${SANS};">📎</td>
    <td valign="middle" style="padding:14px 16px 14px 8px;font:13px/1.6 ${SANS};color:${C.text};"><strong>Your full statement is attached as a PDF</strong><br><span style="color:${C.muted};">Every order with its date and time, invoice number, list price, discount, amount paid and transaction id, ready to download or print.</span></td>
  </tr></table>
</td></tr>
${noteHtml}
<tr><td align="center" style="padding:0 20px 8px;background:#fdf6ef;">${gif(EMAIL_GIFS[1])}</td></tr>
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.border};background:${C.cream};border-radius:0 0 16px 16px;font:12px/1.6 ${SANS};color:${C.muted};">
  <p style="margin:0 0 10px;color:${C.text};">This is a statement of payments already received. Questions? Reply to this email or write to <a href="mailto:${esc(BUSINESS.email)}" style="color:${C.maroon};">${esc(BUSINESS.email)}</a>.</p>
  <p style="margin:0;"><strong style="color:${C.text};">${esc(BUSINESS.name)}</strong> · ${esc(BUSINESS.type)} (Proprietor: ${esc(BUSINESS.proprietor)})<br>${footerAddress}<br>${esc(BUSINESS.phoneDisplay)} · <a href="mailto:${esc(BUSINESS.email)}" style="color:${C.maroon};">${esc(BUSINESS.email)}</a> · <a href="${esc(BUSINESS.website)}" style="color:${C.maroon};">subhsandesh.in</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  // ── Plain text ────────────────────────────────────────────────────────────
  const t: string[] = [];
  t.push(message, "", `${BUSINESS.name} — Payment statement (the full statement is attached as a PDF)`, "");
  t.push(`Billed to: ${name} <${email}>`);
  t.push(`Statement period: ${periodText}`, "");
  lines.forEach((l, i) => {
    t.push(`${i + 1}. ${flat(l.templateLabel)} — ${formatIstDateTime(l.paidAt)}`);
    t.push(`   Invoice no.: ${invoiceText(l)}`);
    if (l.pageUrl) t.push(`   Page: ${flat(l.pageUrl)}`);
    t.push(`   List price: ${formatMinor(l.listAmount, l.currency)}`);
    if (l.discountLabel !== "—" && l.discountAmount > 0) {
      t.push(`   Discount: ${flat(l.discountLabel)} (−${formatMinor(l.discountAmount, l.currency)})`);
    }
    if (l.pointsUsed > 0) t.push(`   Points used: ${l.pointsUsed.toLocaleString("en-IN")}`);
    t.push(
      l.status === "points_used"
        ? "   Amount paid: none — unlocked with points"
        : `   Amount paid: ${formatMinor(l.amount, l.currency)}`
    );
    if (l.razorpayPaymentId) t.push(`   Transaction ID: ${flat(l.razorpayPaymentId)}`);
    t.push("");
  });
  for (const ct of totals) {
    const pre = mixed ? `${ct.currency} ` : "";
    t.push(`${pre}Subtotal: ${formatMinor(ct.subtotal, ct.currency)}`);
    t.push(`${pre}Total discount: ${ct.discount > 0 ? "−" : ""}${formatMinor(ct.discount, ct.currency)}`);
    t.push(`${pre}Total paid: ${formatMinor(ct.paid, ct.currency)}`);
  }
  if (mixed) t.push(`All currencies, in INR (at the rate on each payment date): ${formatMinor(totalInrPaise, "INR")}`);
  if (pointsLines.length) t.push(`Unlocked with points: ${pointsLines.length} page(s), ${pointsSpent.toLocaleString("en-IN")} points`);
  if (note) t.push("", "Note:", note);
  t.push(
    "",
    "See you next time!",
    "",
    `This is a payment statement for payments already received. Questions? Reply to this email or write to ${BUSINESS.email}.`,
    "",
    `${BUSINESS.name} · ${BUSINESS.type} (Proprietor: ${BUSINESS.proprietor})`,
    ...BUSINESS.addressLines,
    `${BUSINESS.phoneDisplay} · ${BUSINESS.email} · ${BUSINESS.website}`
  );

  return {
    subject,
    html,
    text: t.join("\n"),
    orderCount: lines.length,
    totalInrPaise,
    currencyTotals: totals,
    pointsUnlocks: pointsLines.length,
    pointsSpent,
    message,
  };
}
