import test from "node:test";
import assert from "node:assert/strict";
import { buildStatementPdf, statementFileName } from "./billingPdf";

test("the statement PDF builds with the embedded fonts and logo", async () => {
  const pdf = await buildStatementPdf({
    billedTo: { name: "Asha <b>", email: "a@b.co" },
    period: { from: "2026-10-24", to: "2026-10-24" },
    lines: [{ orderId: "o1", paidAt: new Date("2026-10-24T10:01:00Z"), invoiceNumber: null, templateLabel: "Happy Halloween ✦ Premium", pageUrl: "https://subhsandesh.in/s/x", status: "paid", currency: "INR", listAmount: 19412, discountAmount: 9512, discountLabel: "Discount 49%", pointsUsed: 0, amount: 9900, amountInrPaise: 9900, razorpayPaymentId: "pay_X" }],
    preview: true,
  });
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 10_000);
  assert.equal(statementFileName({ from: "2026-10-01", to: "2026-10-24" }), "SubhSandesh-statement-2026-10-01-to-2026-10-24.pdf");
});
