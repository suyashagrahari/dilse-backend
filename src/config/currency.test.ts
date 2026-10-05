import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currencyForCountry,
  normalizeCountry,
  deriveUsdCents,
  localizePricing,
  toInrPaise,
  formatMoney,
} from "./currency";
import { derivePricing } from "./pricingMath";

const paid = (finalPricePaise: number, discountPercent = 0, usdPriceCents: number | null = null) =>
  derivePricing({ slug: "birthday-gf", isFree: false, finalPricePaise, discountPercent, pointsCost: 500, usdPriceCents });

test("India and unknown pay INR; everyone else pays USD — only when switched on", () => {
  assert.equal(currencyForCountry("IN", true), "INR");
  assert.equal(currencyForCountry(null, true), "INR");
  assert.equal(currencyForCountry("US", true), "USD");
  assert.equal(currencyForCountry("GB", true), "USD");
  assert.equal(currencyForCountry("US", false), "INR", "switch off = everyone INR, the rollback");
});

test("country codes are normalised and placeholders rejected", () => {
  assert.equal(normalizeCountry("us"), "US");
  assert.equal(normalizeCountry(" in "), "IN");
  for (const bad of ["XX", "T1", "EU", "AP", "ZZ", "USA", "", 42, null, undefined]) {
    assert.equal(normalizeCountry(bad), null, String(bad));
  }
});

test("derived USD rounds UP to the next .99 and never below $0.99", () => {
  assert.equal(deriveUsdCents(14900, 88), 199); // ₹149 → $1.69 → $1.99
  assert.equal(deriveUsdCents(9900, 88), 199); // ₹99 → $1.13 → $1.99
  assert.equal(deriveUsdCents(17512, 88), 199); // exactly $1.99 stays $1.99
  assert.equal(deriveUsdCents(17600, 88), 299); // exactly $2.00 → next .99 at or above
  assert.equal(deriveUsdCents(17700, 88), 299); // $2.01 → $2.99
  assert.equal(deriveUsdCents(100, 88), 99); // floor
  assert.equal(deriveUsdCents(14900, NaN), deriveUsdCents(14900, 88), "bad rate falls back to default");
});

test("INR quote is exactly the stored INR pricing", () => {
  const p = paid(14900, 50);
  const q = localizePricing(p, "INR", 88);
  assert.equal(q.currency, "INR");
  assert.equal(q.finalAmount, 14900);
  assert.equal(q.mrpAmount, p.mrpPaise);
  assert.equal(q.source, "inr");
});

test("USD uses the admin's price when set, else derives; discount shows on the strike-through", () => {
  const set = localizePricing(paid(14900, 50, 499), "USD", 88);
  assert.equal(set.finalAmount, 499);
  assert.equal(set.mrpAmount, 998);
  assert.equal(set.savingsAmount, 499);
  assert.equal(set.source, "usd_set");

  const derived = localizePricing(paid(14900, 0), "USD", 88);
  assert.equal(derived.finalAmount, 199);
  assert.equal(derived.source, "usd_derived");
});

test("free stays free in every currency", () => {
  const free = derivePricing({ slug: "x", isFree: true, finalPricePaise: 9999, discountPercent: 50, pointsCost: 9, usdPriceCents: 999 });
  const q = localizePricing(free, "USD", 88);
  assert.equal(q.isFree, true);
  assert.equal(q.finalAmount, 0);
});

test("USD converts to INR paise at the recorded rate", () => {
  assert.equal(toInrPaise(199, "USD", 88), 17512);
  assert.equal(toInrPaise(14900, "INR", 88), 14900);
  assert.equal(toInrPaise(-5, "USD", 88), 0);
});

test("money formatting", () => {
  assert.equal(formatMoney(14900, "INR"), "₹149");
  assert.equal(formatMoney(199, "USD"), "$1.99");
});
