import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePricing, freePricing, MIN_USD_CENTS } from "./pricingMath";
import { applySeasonSale, defaultSeason, salePercentFor, validateSeasonPatch, type SeasonView } from "./seasonSale";

const priced = (slug: string, finalPricePaise: number, usdPriceCents: number | null = null, discountPercent = 0) =>
  derivePricing({ slug, isFree: false, finalPricePaise, discountPercent, pointsCost: 40, usdPriceCents });
const season = (over: Partial<SeasonView> = {}): SeasonView => ({ ...defaultSeason(), ...over });

test("the default season is Halloween at 49% off the two Halloween slugs", () => {
  const d = defaultSeason();
  assert.equal(d.mode, "halloween");
  assert.equal(d.saleEnabled, true);
  assert.equal(d.salePercent, 49);
  assert.deepEqual(d.saleSlugs, ["happy-halloween", "happy-halloween-premium"]);
});

test("₹199 at 49% off charges ₹101 (whole rupees) and strikes ₹199 through", () => {
  const p = applySeasonSale(priced("happy-halloween", 19900), season());
  assert.equal(p.finalPricePaise, 10100); // round(19900 × 51 / 100) = 10149 → whole rupees
  assert.equal(p.finalPrice, 101);
  assert.equal(p.mrpPaise, 19900);
  assert.equal(p.savingsPaise, 9800);
  assert.equal(p.discountPercent, 49);
  assert.equal(p.pointsCost, 40, "points are not part of the sale");
});

test("rounding is to whole rupees and stays an integer", () => {
  const p = applySeasonSale(priced("happy-halloween-premium", 333), season({ salePercent: 33 }));
  assert.equal(p.finalPricePaise, 200); // 333 × 0.67 = 223.11 → whole rupees
  assert.ok(Number.isInteger(p.finalPricePaise));
  assert.equal(p.savingsPaise, p.mrpPaise - p.finalPricePaise);
});

test("the INR price never drops below ₹1", () => {
  const p = applySeasonSale(priced("happy-halloween", 100), season({ salePercent: 90 }));
  assert.equal(p.finalPricePaise, 100);
  assert.equal(p.mrpPaise, 100);
});

test("a set USD price is scaled the same way and floored at MIN_USD_CENTS", () => {
  assert.equal(applySeasonSale(priced("happy-halloween", 19900, 499), season()).usdPriceCents, 254); // 499 × 0.51 = 254.49
  assert.equal(applySeasonSale(priced("happy-halloween", 19900, 150), season({ salePercent: 90 })).usdPriceCents, MIN_USD_CENTS);
});

test("a derived USD price stays derived (null), so it follows the discounted INR price", () => {
  assert.equal(applySeasonSale(priced("happy-halloween", 19900, null), season()).usdPriceCents, null);
});

test("mode off or valentine: no discount", () => {
  const base = priced("happy-halloween", 19900);
  assert.deepEqual(applySeasonSale(base, season({ mode: "off" })), base);
  assert.deepEqual(applySeasonSale(base, season({ mode: "valentine" })), base);
});

test("sale disabled: no discount, and the stored strike-through is kept", () => {
  const base = priced("happy-halloween", 19900, null, 50);
  const p = applySeasonSale(base, season({ saleEnabled: false }));
  assert.deepEqual(p, base);
  assert.equal(p.discountPercent, 50);
});

test("other slugs are untouched", () => {
  const base = priced("holi", 9900);
  assert.deepEqual(applySeasonSale(base, season()), base);
  assert.equal(salePercentFor("holi", season()), 0);
});

test("a free Halloween template stays free", () => {
  const p = applySeasonSale(freePricing("happy-halloween"), season());
  assert.equal(p.isFree, true);
  assert.equal(p.finalPricePaise, 0);
  assert.equal(p.discountPercent, 0);
});

test("an out-of-range percent in a hand-edited row discounts nothing", () => {
  assert.equal(salePercentFor("happy-halloween", season({ salePercent: 0 })), 0);
  assert.equal(salePercentFor("happy-halloween", season({ salePercent: 95 })), 0);
  assert.equal(salePercentFor("happy-halloween", null), 0);
});

test("validateSeasonPatch accepts each field alone", () => {
  assert.deepEqual(validateSeasonPatch({ mode: "valentine" }), { ok: true, value: { mode: "valentine" } });
  assert.deepEqual(validateSeasonPatch({ saleEnabled: false }), { ok: true, value: { saleEnabled: false } });
  assert.deepEqual(validateSeasonPatch({ salePercent: 90 }), { ok: true, value: { salePercent: 90 } });
  assert.deepEqual(validateSeasonPatch({ saleSlugs: ["happy-halloween", "happy-halloween"] }), {
    ok: true,
    value: { saleSlugs: ["happy-halloween"] },
  });
});

test("validateSeasonPatch rejects bad input", () => {
  const bad: unknown[] = [
    null,
    [],
    "x",
    {},
    { unknown: 1 },
    { mode: "christmas" },
    { saleEnabled: "true" },
    { saleEnabled: 1 },
    { salePercent: 0 },
    { salePercent: 91 },
    { salePercent: 49.5 },
    { salePercent: "49" },
    { saleSlugs: [] },
    { saleSlugs: "happy-halloween" },
    { saleSlugs: ["Happy-Halloween"] },
    { saleSlugs: [1] },
  ];
  for (const b of bad) assert.equal(validateSeasonPatch(b).ok, false, `accepted ${JSON.stringify(b)}`);
});

test("a row the admin already discounted is charged exactly as set — no second sale on top", () => {
  // /admin/pricing: price charged ₹49, discount 49% → paywall ₹49, strikes ₹96.
  const row = priced("happy-halloween", 4900, 199, 49);
  const p = applySeasonSale(row, season());
  assert.equal(p, row);
  assert.equal(p.finalPricePaise, 4900);
  assert.equal(p.discountPercent, 49);
  assert.equal(p.usdPriceCents, 199);
});
