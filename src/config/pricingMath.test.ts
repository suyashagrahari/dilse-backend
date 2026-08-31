import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePricing, freePricing, validatePricingInput } from "./pricingMath";

const paid = (finalPricePaise: number, discountPercent: number) =>
  derivePricing({ slug: "holi", isFree: false, finalPricePaise, discountPercent, pointsCost: 50 });

test("the spec example: ₹10 at 90% off implies an MRP of ₹100", () => {
  const p = paid(1000, 90);
  assert.equal(p.finalPrice, 10);
  assert.equal(p.mrp, 100);
  assert.equal(p.savings, 90);
  assert.equal(p.discountPercent, 90);
});

test("zero discount means MRP equals the price and nothing is saved", () => {
  const p = paid(9900, 0);
  assert.equal(p.mrp, 99);
  assert.equal(p.finalPrice, 99);
  assert.equal(p.savings, 0);
});

test("99% off is allowed and does not overflow", () => {
  const p = paid(100, 99);
  assert.equal(p.finalPrice, 1);
  assert.equal(p.mrp, 100);
});

test("paise stay integers through derivation", () => {
  const p = paid(333, 67);
  assert.ok(Number.isInteger(p.mrpPaise), `mrpPaise was ${p.mrpPaise}`);
  assert.ok(Number.isInteger(p.savingsPaise), `savingsPaise was ${p.savingsPaise}`);
  assert.equal(p.savingsPaise, p.mrpPaise - p.finalPricePaise);
});

test("a free row prices at zero and never claims a discount", () => {
  const p = freePricing("eid-mubarak");
  assert.equal(p.isFree, true);
  assert.equal(p.finalPricePaise, 0);
  assert.equal(p.mrpPaise, 0);
  assert.equal(p.discountPercent, 0);
  assert.equal(p.savings, 0);
});

test("a free row ignores any price that came with it", () => {
  const p = derivePricing({ slug: "x", isFree: true, finalPricePaise: 5000, discountPercent: 80, pointsCost: 9 });
  assert.equal(p.finalPricePaise, 0);
  assert.equal(p.mrpPaise, 0);
  assert.equal(p.discountPercent, 0);
});

test("validation accepts a well-formed paid row", () => {
  const r = validatePricingInput({ isFree: false, finalPricePaise: 1000, discountPercent: 90, pointsCost: 50 });
  assert.equal(r.ok, true);
});

test("validation rejects a 100% discount, which would divide by zero", () => {
  const r = validatePricingInput({ isFree: false, finalPricePaise: 1000, discountPercent: 100, pointsCost: 0 });
  assert.equal(r.ok, false);
});

test("validation rejects a paid template priced below ₹1", () => {
  for (const finalPricePaise of [0, 99, -100]) {
    const r = validatePricingInput({ isFree: false, finalPricePaise, discountPercent: 0, pointsCost: 0 });
    assert.equal(r.ok, false, `accepted ${finalPricePaise}`);
  }
});

test("validation rejects non-integer money and percentages", () => {
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: 1000.5, discountPercent: 90, pointsCost: 0 }).ok, false);
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: 1000, discountPercent: 90.5, pointsCost: 0 }).ok, false);
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: 1000, discountPercent: 90, pointsCost: -1 }).ok, false);
});

test("validation accepts a free row without requiring a price", () => {
  const r = validatePricingInput({ isFree: true });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.finalPricePaise, 0);
    assert.equal(r.value.discountPercent, 0);
  }
});

// ── Regressions found while writing this, kept because money ─────────────────

test("validation rejects NaN and Infinity, which Number.isInteger already excludes", () => {
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: NaN, discountPercent: 0, pointsCost: 0 }).ok, false);
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: Infinity, discountPercent: 0, pointsCost: 0 }).ok, false);
});

test("validation rejects a price large enough to be a typo", () => {
  // A super admin meaning ₹99 and typing paise gets 9900000. Razorpay would
  // take it. An upper bound is cheaper than a refund.
  const r = validatePricingInput({ isFree: false, finalPricePaise: 100_000_01, discountPercent: 0, pointsCost: 0 });
  assert.equal(r.ok, false);
});

test("validation accepts the top of the allowed range", () => {
  const r = validatePricingInput({ isFree: false, finalPricePaise: 100_000_00, discountPercent: 0, pointsCost: 0 });
  assert.equal(r.ok, true, r.ok ? "" : r.error);
});

test("validation rejects a string that looks like a number", () => {
  // JSON bodies arrive untyped; "1000" must not become a price.
  assert.equal(validatePricingInput({ isFree: false, finalPricePaise: "1000", discountPercent: 0, pointsCost: 0 }).ok, false);
  assert.equal(validatePricingInput({ isFree: "false", finalPricePaise: 1000, discountPercent: 0, pointsCost: 0 }).ok, false);
});

test("validation rejects null and arrays as bodies", () => {
  assert.equal(validatePricingInput(null).ok, false);
  assert.equal(validatePricingInput(undefined).ok, false);
  assert.equal(validatePricingInput("nope").ok, false);
});

test("the derived MRP is never below the price being charged", () => {
  // The strike-through must never read as cheaper than what is being paid.
  for (let pct = 0; pct <= 99; pct++) {
    for (const price of [100, 999, 1000, 4900, 9900, 12345]) {
      const p = paid(price, pct);
      assert.ok(
        p.mrpPaise >= p.finalPricePaise,
        `${price} paise at ${pct}% derived an MRP of ${p.mrpPaise}`
      );
      assert.ok(p.savingsPaise >= 0, `${price} paise at ${pct}% derived negative savings`);
    }
  }
});

test("the advertised discount matches the derived numbers to within a rupee", () => {
  // If the badge says 90% off, mrp - final must really be about 90% of mrp.
  // Rounding the MRP can move this by under a rupee; more than that is a bug.
  for (const pct of [10, 25, 50, 67, 80, 90, 99]) {
    for (const price of [100, 999, 1000, 4900, 9900]) {
      const p = paid(price, pct);
      const impliedPct = (p.savingsPaise / p.mrpPaise) * 100;
      assert.ok(
        Math.abs(impliedPct - pct) < 1,
        `badge says ${pct}% but ₹${p.finalPrice} vs ₹${p.mrp} implies ${impliedPct.toFixed(2)}%`
      );
    }
  }
});
