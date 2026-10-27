import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatementEmail, currencyTotalsOf, formatIstDateTime, type StatementLine } from "./billingEmail";

const line = (over: Partial<StatementLine> = {}): StatementLine => ({
  orderId: "o1",
  paidAt: new Date("2026-10-12T10:15:00Z"),
  invoiceNumber: "SS-202610-000001",
  templateLabel: "Dandiya Night",
  pageUrl: "https://subhsandesh.in/abc123",
  status: "paid",
  currency: "INR",
  listAmount: 14100,
  discountAmount: 4200,
  discountLabel: "Season sale — Dandiya 30%",
  pointsUsed: 0,
  amount: 9900,
  amountInrPaise: 9900,
  razorpayPaymentId: "pay_ABC123",
  ...over,
});

const base = {
  billedTo: { name: "Asha", email: "asha@example.com" },
  period: { from: "2026-10-12", to: "2026-10-12" },
};

test("every user-controlled string is HTML-escaped", () => {
  const evil = `<script>alert("x")</script>`;
  const out = buildStatementEmail({
    ...base,
    billedTo: { name: evil, email: "a@b.co" },
    lines: [line({ templateLabel: evil, razorpayPaymentId: `"><img src=x onerror=1>` })],
    note: `${evil}\nsecond line`,
  });
  assert.ok(!out.html.includes("<script>"), "no live script tag");
  assert.ok(!out.html.includes("<img src=x"), "no injected element");
  assert.ok(out.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  // Plain text carries the words but cannot gain lines from a name.
  assert.ok(out.text.includes(`Billed to: ${evil} <a@b.co>`));
});

test("mixed currencies: totals per currency plus an INR equivalent; points are not money", () => {
  const lines = [
    line(),
    line({ orderId: "o2", currency: "USD", listAmount: 299, discountAmount: 0, discountLabel: "—", amount: 299, amountInrPaise: 26312, invoiceNumber: "SS-202610-000002" }),
    line({ orderId: "o3", status: "points_used", amount: 0, amountInrPaise: 0, pointsUsed: 500, invoiceNumber: null, razorpayPaymentId: null }),
  ];
  const out = buildStatementEmail({ ...base, lines });
  assert.equal(out.orderCount, 3);
  assert.equal(out.totalInrPaise, 9900 + 26312);
  assert.equal(out.pointsUnlocks, 1);
  assert.equal(out.pointsSpent, 500);
  assert.deepEqual(
    out.currencyTotals.map((t) => [t.currency, t.subtotal, t.discount, t.paid, t.orders]),
    [
      ["INR", 14100, 4200, 9900, 1],
      ["USD", 299, 0, 299, 1],
    ]
  );
  assert.ok(out.html.includes("All currencies, in INR"));
  assert.ok(out.text.includes("All currencies, in INR (at the rate on each payment date): ₹362.12"));
  assert.ok(out.text.includes("USD Total paid: $2.99"));
  assert.ok(out.text.includes("Unlocked with points: 1 page(s), 500 points"));
});

test("a single currency shows no INR-equivalent line", () => {
  const out = buildStatementEmail({ ...base, lines: [line()] });
  assert.ok(!out.html.includes("All currencies"));
  assert.ok(out.text.includes("Total paid: ₹99"));
  assert.ok(out.text.includes("Discount: Season sale — Dandiya 30% (−₹42)"));
});

test("a preview shows missing invoice numbers as pending; the footer names the business", () => {
  const out = buildStatementEmail({ ...base, lines: [line({ invoiceNumber: null })], preview: true });
  assert.ok(out.text.includes("Invoice no.: pending"));
  assert.ok(out.text.includes("Ward No. 06, Indira Nagar, Dumariyaganj"));
  assert.ok(out.text.includes("support@subhsandesh.in"));
  assert.ok(out.text.includes("This is a payment statement for payments already received."));
  assert.equal(out.subject, "Your SubhSandesh payment statement — 12 Oct 2026");
});

test("IST date-times and per-currency grouping", () => {
  assert.equal(formatIstDateTime(new Date("2026-10-12T10:15:00Z")), "12 Oct 2026, 3:45 PM IST");
  assert.equal(formatIstDateTime(new Date("2026-10-11T18:30:00Z")), "12 Oct 2026, 12:00 AM IST");
  assert.deepEqual(currencyTotalsOf([line({ status: "points_used" })]), []);
});

test("the email opens with the thank-you message and both animated cards, and names the PDF", () => {
  const out = buildStatementEmail({ ...base, lines: [line({})], message: "Dear Asha,\n\nThank you <3 for choosing us." });
  assert.ok(out.html.indexOf("cid:ss-thanks") < out.html.indexOf("Thank you &lt;3 for choosing us."), "thank-you card first");
  assert.ok(out.html.includes("cid:ss-seeyou"));
  assert.ok(out.html.includes("attached as a PDF"));
  assert.ok(out.text.startsWith("Dear Asha,\n\nThank you <3 for choosing us."));
  assert.equal(out.message, "Dear Asha,\n\nThank you <3 for choosing us.");
});

test("no message: the default thank-you greets them by first name; a custom subject wins", () => {
  const out = buildStatementEmail({ ...base, billedTo: { name: "Asha Rao", email: "a@b.co" }, lines: [line({})], subject: "Thank you, Asha 💛" });
  assert.ok(out.message.startsWith("Dear Asha,"));
  assert.equal(out.subject, "Thank you, Asha 💛");
});
