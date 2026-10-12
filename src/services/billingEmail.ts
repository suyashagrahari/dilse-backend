// ─── The billing statement email: a pure builder ────────────────────────────
//
// Turns a list of settled orders into { subject, html, text }. No database, no
// SES — the preview endpoint and the send endpoint both call this, so what the
// super admin previews is byte-for-byte what is sent (apart from invoice
// numbers, which a preview shows as "pending" because it must not burn any).
//
// ── WHY TABLES AND INLINE STYLES ────────────────────────────────────────────
//
// Gmail strips <style> blocks in many contexts and Outlook renders with Word's
// engine, which ignores flexbox, grid and most of CSS. Nested tables with
// inline styles and explicit widths are the only layout both get right. No
// web fonts, no images (nothing to block, nothing to track).
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

  const subject = `Your ${BUSINESS.name} payment statement — ${periodText}`;

  // ── HTML ──────────────────────────────────────────────────────────────────
  const th = (label: string, align: "left" | "right" = "left") =>
    `<th align="${align}" style="padding:8px 6px;border-bottom:2px solid ${C.gold};font:600 11px ${SANS};color:${C.muted};text-transform:uppercase;letter-spacing:.04em;text-align:${align};">${label}</th>`;
  const td = (html: string, align: "left" | "right" = "left", extra = "") =>
    `<td align="${align}" valign="top" style="padding:10px 6px;border-bottom:1px solid ${C.border};font:13px ${SANS};color:${C.text};text-align:${align};${extra}">${html}</td>`;

  const rows = lines
    .map((l) => {
      const template = l.pageUrl
        ? `${esc(l.templateLabel)}<br><a href="${esc(l.pageUrl)}" style="color:${C.maroon};font-size:12px;word-break:break-all;">${esc(l.pageUrl)}</a>`
        : esc(l.templateLabel);
      const discount =
        l.discountLabel !== "—" && l.discountAmount > 0
          ? `${esc(l.discountLabel)}<br><span style="color:${C.muted};font-size:12px;">−${esc(formatMinor(l.discountAmount, l.currency))}</span>`
          : "—";
      const paid =
        l.status === "points_used"
          ? `<span style="color:${C.muted};">Unlocked with points</span>`
          : `<strong>${esc(formatMinor(l.amount, l.currency))}</strong>`;
      return (
        "<tr>" +
        td(esc(formatIstDateTime(l.paidAt)), "left", "white-space:nowrap;") +
        td(esc(invoiceText(l)), "left", "white-space:nowrap;") +
        td(template) +
        td(esc(formatMinor(l.listAmount, l.currency)), "right", "white-space:nowrap;") +
        td(discount, "right") +
        td(l.pointsUsed > 0 ? esc(l.pointsUsed.toLocaleString("en-IN")) : "—", "right") +
        td(paid, "right", "white-space:nowrap;") +
        td(l.razorpayPaymentId ? esc(l.razorpayPaymentId) : "—", "left", `font-family:Menlo,Consolas,monospace;font-size:11px;color:${C.muted};word-break:break-all;`) +
        "</tr>"
      );
    })
    .join("");

  const totalRow = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;font:${strong ? "700 15px" : "13px"} ${SANS};color:${strong ? C.maroon : C.muted};">${label}</td>` +
    `<td align="right" style="padding:4px 0;font:${strong ? "700 15px" : "13px"} ${SANS};color:${strong ? C.maroon : C.text};text-align:right;">${value}</td></tr>`;

  const totalsHtml = totals
    .map(
      (t) =>
        (mixed ? `<tr><td colspan="2" style="padding:10px 0 2px;font:600 12px ${SANS};color:${C.text};">${esc(t.currency)}</td></tr>` : "") +
        totalRow("Subtotal", esc(formatMinor(t.subtotal, t.currency))) +
        totalRow("Total discount", t.discount > 0 ? `−${esc(formatMinor(t.discount, t.currency))}` : esc(formatMinor(0, t.currency))) +
        totalRow("Total paid", esc(formatMinor(t.paid, t.currency)), true)
    )
    .join("");
  const inrEquivHtml = mixed
    ? totalRow("All currencies, in INR (at the rate on each payment date)", esc(formatMinor(totalInrPaise, "INR")), true)
    : "";
  const pointsHtml = pointsLines.length
    ? totalRow(
        `Unlocked with points (${pointsLines.length} page${pointsLines.length > 1 ? "s" : ""})`,
        `${esc(pointsSpent.toLocaleString("en-IN"))} points`
      )
    : "";

  const noteHtml = note
    ? `<tr><td style="padding:0 32px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};border-left:3px solid ${C.gold};"><tr><td style="padding:12px 16px;font:13px/1.6 ${SANS};color:${C.text};white-space:pre-wrap;">${esc(note)}</td></tr></table></td></tr>`
    : "";

  const footerAddress = BUSINESS.addressLines.map(esc).join("<br>");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="width:100%;max-width:760px;background:${C.card};border:1px solid ${C.border};border-radius:12px;">
<tr><td style="padding:28px 32px 20px;border-bottom:3px solid ${C.gold};background:${C.maroon};border-radius:12px 12px 0 0;">
  <div style="font:700 24px ${FONT};color:#fffdfb;letter-spacing:.02em;">${esc(BUSINESS.name)}</div>
  <div style="font:13px ${SANS};color:${C.gold};margin-top:4px;text-transform:uppercase;letter-spacing:.12em;">Payment statement</div>
</td></tr>
<tr><td style="padding:24px 32px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="font:13px/1.6 ${SANS};color:${C.text};">
      <div style="font:600 11px ${SANS};color:${C.muted};text-transform:uppercase;letter-spacing:.06em;">Billed to</div>
      <div style="font-weight:600;">${esc(name)}</div>
      <div>${esc(email)}</div>
    </td>
    <td valign="top" align="right" style="font:13px/1.6 ${SANS};color:${C.text};text-align:right;">
      <div style="font:600 11px ${SANS};color:${C.muted};text-transform:uppercase;letter-spacing:.06em;">Statement period</div>
      <div style="font-weight:600;">${esc(periodText)}</div>
      <div>${lines.length} order${lines.length === 1 ? "" : "s"}</div>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 32px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>${th("Date &amp; time")}${th("Invoice no.")}${th("Template")}${th("List price", "right")}${th("Discount", "right")}${th("Points", "right")}${th("Amount paid", "right")}${th("Transaction ID")}</tr>
    ${rows}
  </table>
</td></tr>
<tr><td style="padding:8px 32px 24px;">
  <table role="presentation" width="320" align="right" cellpadding="0" cellspacing="0" style="width:320px;max-width:100%;">
    ${totalsHtml}${inrEquivHtml}${pointsHtml}
  </table>
</td></tr>
${noteHtml}
<tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.border};background:${C.cream};border-radius:0 0 12px 12px;font:12px/1.6 ${SANS};color:${C.muted};">
  <p style="margin:0 0 10px;color:${C.text};">This is a payment statement for payments already received. Questions? Reply to this email or write to <a href="mailto:${esc(BUSINESS.email)}" style="color:${C.maroon};">${esc(BUSINESS.email)}</a>.</p>
  <p style="margin:0;"><strong style="color:${C.text};">${esc(BUSINESS.name)}</strong> · ${esc(BUSINESS.type)} (Proprietor: ${esc(BUSINESS.proprietor)})<br>${footerAddress}<br>${esc(BUSINESS.phoneDisplay)} · <a href="mailto:${esc(BUSINESS.email)}" style="color:${C.maroon};">${esc(BUSINESS.email)}</a> · <a href="${esc(BUSINESS.website)}" style="color:${C.maroon};">subhsandesh.in</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  // ── Plain text ────────────────────────────────────────────────────────────
  const t: string[] = [];
  t.push(`${BUSINESS.name} — Payment statement`, "");
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
  };
}
