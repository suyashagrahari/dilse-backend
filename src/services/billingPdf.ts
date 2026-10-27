// ─── The billing statement PDF: a pure builder ──────────────────────────────
//
// The same lines the statement email is built from, laid out as an A4 PDF that
// is attached to the email (and shown to the super admin in the preview). No
// database, no network: lines in, bytes out.
//
// ── THE LOOK ────────────────────────────────────────────────────────────────
//
// Cream paper with a thin double gold frame, the SubhSandesh gift box very
// faintly in the middle of every page as a watermark, a maroon header band with
// the logo, "Thank you for celebrating with us" in script, then the billed-to
// and from blocks, the line table, the totals card and the business footer.
// Fonts are embedded (assets/billing/*.ttf): the PDF standard fonts have no ₹.
//
// ── ASSETS ──────────────────────────────────────────────────────────────────
//
// assets/billing/ sits next to src/ and dist/, so `../../assets` resolves from
// both (tsx in development, node dist/ in production). The Dockerfile copies it
// into the runner image.

import path from "node:path";
import PDFDocument from "pdfkit";
import { BUSINESS } from "../config/business";
import { formatMinor, formatPeriod, istDate } from "./revenueMath";
import { currencyTotalsOf, formatIstDateTime, type StatementInput, type StatementLine } from "./billingEmail";

export const BILLING_ASSETS = path.join(__dirname, "..", "..", "assets", "billing");
const asset = (f: string) => path.join(BILLING_ASSETS, f);

const C = {
  paper: "#fffaf5",
  cream: "#faf1e8",
  zebra: "#fbf4ec",
  ink: "#2a0a0e",
  muted: "#7f5f5f",
  maroon: "#3d0c11",
  wine: "#7a1f2b",
  gold: "#c9a84c",
  goldSoft: "#e6d3a3",
  line: "#ecdcd0",
};

const W = 595.28;
const H = 841.89;
const M = 42;
const INNER = W - M * 2;
/** Where the line table must stop and continue on the next page. */
const BOTTOM = H - 118;

/** The file name the PDF is attached as. */
export function statementFileName(period: { from: string; to: string }): string {
  return period.from === period.to ? `SubhSandesh-statement-${period.from}.pdf` : `SubhSandesh-statement-${period.from}-to-${period.to}.pdf`;
}

/** One line of text: no newlines smuggled in from a user string. */
const flat = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").trim();

type Glyphs = { hasGlyphForCodePoint(cp: number): boolean };

export function buildStatementPdf(input: StatementInput & { issuedAt?: Date }): Promise<Buffer> {
  const lines = [...input.lines].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const totals = currencyTotalsOf(lines);
  const mixed = totals.length > 1;
  const totalInrPaise = lines.filter((l) => l.status === "paid").reduce((s, l) => s + l.amountInrPaise, 0);
  const pointsLines = lines.filter((l) => l.status === "points_used");
  const pointsSpent = pointsLines.reduce((s, l) => s + l.pointsUsed, 0);
  const periodText = formatPeriod(input.period.from, input.period.to);
  const issued = input.issuedAt ?? new Date();
  const invoiceText = (l: StatementLine) => l.invoiceNumber ?? (l.status === "points_used" ? "—" : input.preview ? "pending" : "—");

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    bufferPages: true,
    info: { Title: `${BUSINESS.name} payment statement — ${periodText}`, Author: BUSINESS.name, Subject: "Payment statement", Creator: BUSINESS.name },
  });
  doc.registerFont("serif", asset("PlayfairDisplay-SemiBold.ttf"));
  doc.registerFont("serif-i", asset("PlayfairDisplay-Italic.ttf"));
  doc.registerFont("sans", asset("Inter-Regular.ttf"));
  doc.registerFont("sans-b", asset("Inter-SemiBold.ttf"));
  doc.registerFont("script", asset("GreatVibes-Regular.ttf"));
  const logo = asset("logo.png");
  // Template labels carry symbols ("✦") the embedded fonts do not have; those
  // would print as empty boxes, so they become a middle dot.
  const inter = (doc.font("sans") as unknown as { _font: { font: Glyphs } })._font.font;
  const safe = (v: unknown) =>
    Array.from(flat(v))
      .map((ch) => (inter.hasGlyphForCodePoint(ch.codePointAt(0) as number) ? ch : "·"))
      .join("")
      .replace(/\s*·\s*·\s*/g, " · ");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ── Every page: paper, frame, watermark ─────────────────────────────────
  const paper = () => {
    doc.save().rect(0, 0, W, H).fill(C.paper).restore();
    doc.save().lineWidth(1.2).strokeColor(C.gold).rect(16, 16, W - 32, H - 32).stroke();
    doc.lineWidth(0.5).strokeColor(C.goldSoft).rect(21, 21, W - 42, H - 42).stroke().restore();
    // The gift box, very lightly, tilted a little in the middle of the page.
    doc.save().opacity(0.045).rotate(-12, { origin: [W / 2, H / 2 + 30] }).image(logo, W / 2 - 170, H / 2 + 30 - 136, { width: 340 }).restore();
  };

  // ── Page one header ─────────────────────────────────────────────────────
  paper();
  doc.save().rect(21, 21, W - 42, 112).fill(C.maroon).restore();
  doc.save().rect(21, 133, W - 42, 2.5).fill(C.gold).restore();
  doc.save().circle(M + 38, 77, 36).fill(C.paper).restore();
  doc.image(logo, M + 12, 56, { width: 52 });
  doc.font("serif").fontSize(26).fillColor("#fffdfb").text(BUSINESS.name, M + 90, 52, { lineBreak: false });
  doc.font("sans-b").fontSize(8.5).fillColor(C.gold).text("PAYMENT STATEMENT", M + 92, 88, { characterSpacing: 2.4, lineBreak: false });
  const metaX = W - M - 170;
  const meta = (label: string, value: string, y: number) => {
    doc.font("sans").fontSize(7.5).fillColor(C.goldSoft).text(label.toUpperCase(), metaX, y, { width: 170, align: "right", characterSpacing: 1.2 });
    doc.font("sans-b").fontSize(10).fillColor("#fffdfb").text(value, metaX, y + 11, { width: 170, align: "right" });
  };
  meta("Statement period", periodText, 46);
  meta("Issued on", formatPeriod(istDate(issued), istDate(issued)), 82);

  doc.font("script").fontSize(30).fillColor(C.wine).text("Thank you for celebrating with us", M, 150, { width: INNER, align: "center" });
  doc.font("sans").fontSize(9).fillColor(C.muted).text("A record of the payments we have received from you, with love from the SubhSandesh team.", M, 190, { width: INNER, align: "center" });

  // ── Billed to / From ────────────────────────────────────────────────────
  let y = 222;
  const half = (INNER - 16) / 2;
  const block = (x: number, label: string, rows: string[]) => {
    doc.save().roundedRect(x, y, half, 94, 8).fill(C.cream).restore();
    doc.save().rect(x, y + 10, 2.5, 74).fill(C.gold).restore();
    doc.font("sans-b").fontSize(7.5).fillColor(C.muted).text(label.toUpperCase(), x + 16, y + 12, { characterSpacing: 1.4 });
    doc.font("sans-b").fontSize(10.5).fillColor(C.ink).text(safe(rows[0]), x + 16, y + 26, { width: half - 28, height: 13, ellipsis: true });
    doc.font("sans").fontSize(8.5).fillColor(C.ink);
    rows.slice(1).forEach((r, i) => doc.text(safe(r), x + 16, y + 42 + i * 11.5, { width: half - 28, height: 11, ellipsis: true }));
  };
  block(M, "Billed to", [flat(input.billedTo.name) || "Customer", flat(input.billedTo.email), `${lines.length} order${lines.length === 1 ? "" : "s"} on this statement`]);
  block(M + half + 16, "From", [`${BUSINESS.name} · ${BUSINESS.type}`, `Proprietor: ${BUSINESS.proprietor}`, BUSINESS.addressLines[0], BUSINESS.addressLines.slice(1).join(", "), `${BUSINESS.email} · ${BUSINESS.phoneDisplay}`]);
  y += 114;

  // ── The line table ──────────────────────────────────────────────────────
  // # · date & time · template (+ invoice no. and transaction id) · list · discount · paid
  const cols = [
    { k: "no", w: 22, label: "#", align: "left" as const },
    { k: "date", w: 92, label: "Date & time", align: "left" as const },
    { k: "item", w: 197, label: "Template", align: "left" as const },
    { k: "list", w: 62, label: "List price", align: "right" as const },
    { k: "disc", w: 72, label: "Discount", align: "right" as const },
    { k: "paid", w: INNER - 22 - 92 - 197 - 62 - 72, label: "Paid", align: "right" as const },
  ];
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), M);
  const PAD = 7;

  const head = () => {
    doc.save().roundedRect(M, y, INNER, 24, 6).fill(C.maroon).restore();
    doc.font("sans-b").fontSize(7.5).fillColor(C.goldSoft);
    cols.forEach((c, i) => doc.text(c.label.toUpperCase(), xs[i] + PAD, y + 8.5, { width: c.w - PAD * 2, align: c.align, characterSpacing: 0.8, lineBreak: false }));
    y += 24;
  };
  head();

  lines.forEach((l, n) => {
    const sub = [`Invoice ${invoiceText(l)}`, l.razorpayPaymentId ? `Txn ${flat(l.razorpayPaymentId)}` : "", l.pageUrl ? flat(l.pageUrl) : ""].filter(Boolean);
    doc.font("sans-b").fontSize(9);
    const titleH = doc.heightOfString(safe(l.templateLabel), { width: cols[2].w - PAD * 2 });
    doc.font("sans").fontSize(7.2);
    const subH = sub.reduce((s, t) => s + doc.heightOfString(t, { width: cols[2].w - PAD * 2 }) + 1, 0);
    const rowH = Math.max(36, titleH + subH + 16);
    if (y + rowH > BOTTOM) {
      doc.addPage();
      paper();
      y = 48;
      head();
    }
    if (n % 2 === 0) doc.save().rect(M, y, INNER, rowH).fill(C.zebra).restore();
    doc.save().moveTo(M, y + rowH).lineTo(M + INNER, y + rowH).lineWidth(0.5).strokeColor(C.line).stroke().restore();
    const ty = y + 9;
    doc.font("sans").fontSize(8.5).fillColor(C.muted).text(String(n + 1).padStart(2, "0"), xs[0] + PAD, ty, { width: cols[0].w - PAD, lineBreak: false });
    const when = formatIstDateTime(l.paidAt).replace(/, (\d)/, "\n$1");
    doc.fillColor(C.ink).text(when, xs[1] + PAD, ty, { width: cols[1].w - PAD * 2, lineGap: 1 });
    doc.font("sans-b").fontSize(9).fillColor(C.ink).text(safe(l.templateLabel), xs[2] + PAD, ty, { width: cols[2].w - PAD * 2 });
    doc.font("sans").fontSize(7.2).fillColor(C.muted);
    sub.forEach((t) => {
      const isUrl = t === flat(l.pageUrl);
      doc.fillColor(isUrl ? C.wine : C.muted).text(t, { width: cols[2].w - PAD * 2, link: isUrl ? (l.pageUrl as string) : undefined, underline: false });
    });
    doc.font("sans").fontSize(8.5).fillColor(C.ink).text(formatMinor(l.listAmount, l.currency), xs[3] + PAD, ty, { width: cols[3].w - PAD * 2, align: "right" });
    if (l.discountLabel !== "—" && l.discountAmount > 0) {
      doc.fillColor(C.wine).text(`−${formatMinor(l.discountAmount, l.currency)}`, xs[4] + PAD, ty, { width: cols[4].w - PAD * 2, align: "right" });
      doc.font("sans").fontSize(7).fillColor(C.muted).text(safe(l.discountLabel), xs[4] + PAD, ty + 12, { width: cols[4].w - PAD * 2, align: "right" });
    } else {
      doc.fillColor(C.muted).text("—", xs[4] + PAD, ty, { width: cols[4].w - PAD * 2, align: "right" });
    }
    if (l.status === "points_used") {
      doc.font("sans").fontSize(7.5).fillColor(C.muted).text(`${l.pointsUsed.toLocaleString("en-IN")} points`, xs[5] + PAD, ty, { width: cols[5].w - PAD * 2, align: "right" });
    } else {
      doc.font("sans-b").fontSize(9.5).fillColor(C.maroon).text(formatMinor(l.amount, l.currency), xs[5] + PAD, ty, { width: cols[5].w - PAD * 2, align: "right" });
    }
    y += rowH;
  });

  // ── Totals card ─────────────────────────────────────────────────────────
  const rowsT: { label: string; value: string; strong?: boolean }[] = [];
  for (const t of totals) {
    const pre = mixed ? `${t.currency} ` : "";
    rowsT.push({ label: `${pre}Subtotal`, value: formatMinor(t.subtotal, t.currency) });
    rowsT.push({ label: `${pre}Total discount`, value: t.discount > 0 ? `−${formatMinor(t.discount, t.currency)}` : formatMinor(0, t.currency) });
  }
  if (pointsLines.length) rowsT.push({ label: `Unlocked with points (${pointsLines.length})`, value: `${pointsSpent.toLocaleString("en-IN")} pts` });
  const paidRows = mixed
    ? [...totals.map((t) => ({ label: `${t.currency} total paid`, value: formatMinor(t.paid, t.currency) })), { label: "All, in INR", value: formatMinor(totalInrPaise, "INR") }]
    : [{ label: "Total paid", value: formatMinor(totals[0]?.paid ?? 0, totals[0]?.currency ?? "INR") }];
  const cardW = 232;
  const cardH = 20 + rowsT.length * 17 + paidRows.length * 26 + 8;
  const note = String(input.note ?? "").trim();
  doc.font("sans").fontSize(8.5);
  const noteH = note ? doc.heightOfString(note.split("\n").map(safe).join("\n"), { width: INNER - cardW - 52 }) + 34 : 0;
  if (y + 18 + Math.max(cardH, noteH) > BOTTOM) {
    doc.addPage();
    paper();
    y = 48;
  }
  y += 18;
  const cx = M + INNER - cardW;
  doc.save().roundedRect(cx, y, cardW, cardH, 10).fill(C.cream).restore();
  let ry = y + 14;
  for (const r of rowsT) {
    doc.font("sans").fontSize(8.5).fillColor(C.muted).text(r.label, cx + 16, ry, { width: 120, lineBreak: false });
    doc.fillColor(C.ink).text(r.value, cx + 120, ry, { width: cardW - 136, align: "right", lineBreak: false });
    ry += 17;
  }
  ry += 2;
  for (const r of paidRows) {
    doc.save().roundedRect(cx + 8, ry, cardW - 16, 22, 6).fill(C.maroon).restore();
    doc.font("sans-b").fontSize(8).fillColor(C.goldSoft).text(r.label.toUpperCase(), cx + 18, ry + 7.5, { width: 120, characterSpacing: 1, lineBreak: false });
    doc.font("serif").fontSize(12).fillColor("#fffdfb").text(r.value, cx + 110, ry + 4.5, { width: cardW - 128, align: "right", lineBreak: false });
    ry += 26;
  }
  if (note) {
    const nw = INNER - cardW - 20;
    doc.save().roundedRect(M, y, nw, noteH, 10).fill(C.cream).restore();
    doc.save().rect(M, y + 10, 2.5, noteH - 20).fill(C.gold).restore();
    doc.font("sans-b").fontSize(7.5).fillColor(C.muted).text("A NOTE FOR YOU", M + 16, y + 12, { characterSpacing: 1.4 });
    doc.font("sans").fontSize(8.5).fillColor(C.ink).text(note.split("\n").map(safe).join("\n"), M + 16, y + 26, { width: nw - 32 });
  }

  // ── Footer on every page, with page numbers ─────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = H - 96;
    doc.save().moveTo(M, fy).lineTo(W - M, fy).lineWidth(0.6).strokeColor(C.goldSoft).stroke().restore();
    doc.font("serif-i").fontSize(9).fillColor(C.wine).text("Made with love for every celebration.", M, fy + 10, { width: INNER, align: "center", lineBreak: false });
    doc.font("sans").fontSize(7).fillColor(C.muted);
    doc.text("This is a statement of payments already received. Questions? Reply to the email it came with, or write to " + BUSINESS.email + ".", M, fy + 26, { width: INNER, align: "center", lineBreak: false });
    doc.text(`${BUSINESS.name} · ${BUSINESS.type} (Proprietor: ${BUSINESS.proprietor}) · ${BUSINESS.addressLines.join(", ")}`, M, fy + 37, { width: INNER, align: "center", lineBreak: false });
    doc.text(`${BUSINESS.phoneDisplay} · ${BUSINESS.email} · subhsandesh.in`, M, fy + 48, { width: INNER, align: "center", lineBreak: false, link: BUSINESS.website });
    doc.font("sans-b").fontSize(7).fillColor(C.gold).text(`PAGE ${i - range.start + 1} OF ${range.count}`, M, fy + 62, { width: INNER, align: "center", characterSpacing: 1.2, lineBreak: false });
  }

  doc.end();
  return done;
}
