import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  discountLabel,
  effectivePaidAt,
  enumerateDays,
  escapeRegex,
  formatInvoiceNumber,
  formatMinor,
  INVOICE_NUMBER_RE,
  isYmd,
  istDate,
  orderDiscountInrPaise,
  orderSetKey,
  RangeInputError,
  resolveRange,
  totalsFor,
  type LedgerOrder,
} from "./revenueMath";

const at = (iso: string) => new Date(iso);

test("IST day boundaries sit at 18:30 UTC", () => {
  assert.equal(istDate(at("2026-10-11T18:29:59.999Z")), "2026-10-11");
  assert.equal(istDate(at("2026-10-11T18:30:00.000Z")), "2026-10-12");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.deepEqual(enumerateDays("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("7d is the last seven IST calendar days INCLUDING today, previous is the seven before", () => {
  const r = resolveRange({ range: "7d" }, at("2026-10-12T05:00:00Z"));
  assert.equal(r.from, "2026-10-06");
  assert.equal(r.to, "2026-10-12");
  assert.equal(r.days, 7);
  assert.equal(r.start.toISOString(), "2026-10-05T18:30:00.000Z");
  assert.equal(r.end.toISOString(), "2026-10-12T18:30:00.000Z");
  assert.equal(r.previous.from, "2026-09-29");
  assert.equal(r.previous.to, "2026-10-05");
  assert.equal(r.previous.days, 7);
  assert.equal(r.previous.end.getTime(), r.start.getTime(), "periods are contiguous");
  assert.equal(r.label, "Last 7 days");
});

test("today follows the IST date, not the UTC one", () => {
  // 00:30 IST on 12 Oct is still 11 Oct in UTC.
  const r = resolveRange({ range: "today" }, at("2026-10-11T19:00:00Z"));
  assert.equal(r.from, "2026-10-12");
  assert.equal(r.to, "2026-10-12");
  assert.equal(r.previous.from, "2026-10-11");
  assert.equal(resolveRange({}, at("2026-10-12T05:00:00Z")).key, "7d", "missing range defaults to 7d");
  assert.equal(resolveRange({ range: "90d" }, at("2026-10-12T05:00:00Z")).days, 90);
});

test("custom ranges are validated and capped at 366 days", () => {
  const ok = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-12" });
  assert.equal(ok.days, 12);
  assert.equal(ok.previous.from, "2026-09-19");
  assert.equal(ok.previous.to, "2026-09-30");
  assert.equal(ok.label, "1 Oct 2026 – 12 Oct 2026");
  assert.equal(resolveRange({ range: "custom", from: "2025-10-12", to: "2026-10-12" }).days, 366);
  assert.throws(() => resolveRange({ range: "custom", from: "2025-10-11", to: "2026-10-12" }), RangeInputError);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-10-12", to: "2026-10-01" }), RangeInputError);
  assert.throws(() => resolveRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }), RangeInputError);
  assert.throws(() => resolveRange({ range: "custom" }), RangeInputError);
  assert.throws(() => resolveRange({ range: "1y" }), RangeInputError);
  assert.equal(isYmd("2028-02-29"), true);
  assert.equal(isYmd("2026-02-29"), false);
});

test("totals: paid is money, points are unlocks, old rows fall back to updatedAt, end is exclusive", () => {
  const start = at("2026-10-05T18:30:00Z");
  const end = at("2026-10-12T18:30:00Z");
  const orders: LedgerOrder[] = [
    { userId: "a", status: "paid", amount: 9900, currency: "INR", amountInrPaise: 9900, discountAmount: 4200, paidAt: at("2026-10-06T10:00:00Z") },
    // Old row: no paidAt, no amountInrPaise — dated by updatedAt, INR by amount.
    { userId: "a", status: "paid", amount: 4900, currency: "INR", updatedAt: at("2026-10-07T10:00:00Z") },
    // USD at its frozen rate.
    { userId: "b", status: "paid", amount: 299, currency: "USD", fxRateToINR: 88, amountInrPaise: 26312, discountAmount: 100, paidAt: at("2026-10-08T10:00:00Z") },
    { userId: "c", status: "points_used", amount: 0, pointsUsed: 500, paidAt: at("2026-10-08T11:00:00Z") },
    { userId: "d", status: "failed", amount: 9900, createdAt: at("2026-10-08T11:00:00Z") },
    { userId: "e", status: "paid", amount: 9900, amountInrPaise: 9900, paidAt: end },
    { userId: "f", status: "paid", amount: 9900, amountInrPaise: 9900, paidAt: at("2026-10-05T18:29:59Z") },
  ];
  const t = totalsFor(orders, start, end);
  assert.equal(t.revenueInrPaise, 9900 + 4900 + 26312);
  assert.equal(t.orders, 3);
  assert.equal(t.payingUsers, 2);
  assert.equal(t.pointsUnlocks, 1);
  assert.equal(t.pointsSpent, 500);
  assert.equal(t.discountGivenInrPaise, 4200 + 8800);
  assert.equal(effectivePaidAt(orders[4]), null, "a failed order never settled");
});

test("discount labels and INR value of a discount", () => {
  assert.equal(discountLabel({ discountSource: "season_sale", seasonMode: "dandiya", discountPercent: 30, discountAmount: 3000 }), "Season sale — Dandiya 30%");
  assert.equal(discountLabel({ discountSource: "admin", discountPercent: 20, discountAmount: 2000 }), "Discount 20%");
  assert.equal(discountLabel({ discountSource: "none", discountPercent: 0 }), "—");
  assert.equal(discountLabel({}), "—", "rows from before the snapshot");
  assert.equal(orderDiscountInrPaise({ currency: "USD", discountAmount: 100, fxRateToINR: 88 }), 8800);
  assert.equal(orderDiscountInrPaise({ currency: "USD", discountAmount: 100 }), 0, "no rate, no guess");
  assert.equal(formatMinor(9900, "INR"), "₹99");
  assert.equal(formatMinor(123450, "INR"), "₹1,234.50");
  assert.equal(formatMinor(1999, "USD"), "$19.99");
});

test("invoice numbers: SS-YYYYMM-000123, IST month of issue, zero-padded", () => {
  assert.equal(formatInvoiceNumber(at("2026-10-12T05:00:00Z"), 123), "SS-202610-000123");
  // 00:30 IST on 1 Nov is still October in UTC.
  assert.equal(formatInvoiceNumber(at("2026-10-31T19:00:00Z"), 1), "SS-202611-000001");
  assert.equal(formatInvoiceNumber(at("2026-10-12T05:00:00Z"), 1234567), "SS-202610-1234567");
  assert.match(formatInvoiceNumber(new Date(), 42), INVOICE_NUMBER_RE);
  assert.throws(() => formatInvoiceNumber(new Date(), 0));
  assert.throws(() => formatInvoiceNumber(new Date(), 1.5));
});

test("order set keys ignore order and duplicates; regex input is escaped", () => {
  assert.equal(orderSetKey(["b", "a", "b"]), "a,b");
  assert.equal(orderSetKey(["a", "b"]), orderSetKey(["b", "a"]));
  const re = new RegExp(escapeRegex("a.b+(c)"), "i");
  assert.ok(re.test("A.B+(C)"));
  assert.ok(!re.test("axb+(c)"));
});
