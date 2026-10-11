// Per-season drops: migration of single-season rows, the patch rule, and that
// only the ACTIVE mode's drop discounts or opens templates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePricing } from "./pricingMath";
import {
  activeDrop,
  adminSeason,
  applySeasonPatch,
  applySeasonSale,
  defaultSeason,
  dropSlugs,
  isInDrop,
  publicSeason,
  salePercentFor,
  seasonFromRow,
  validateSeasonPatch,
  type SeasonMode,
  type SeasonView,
} from "./seasonSale";
import { reachableFrom } from "./templateVisibility";

const priced = (slug: string, paise: number, discountPercent = 0) =>
  derivePricing({ slug, isFree: false, finalPricePaise: paise, discountPercent, pointsCost: 0, usdPriceCents: null });
const at = (mode: SeasonMode, base: SeasonView = defaultSeason()): SeasonView => ({ ...base, mode });

// ── migration ────────────────────────────────────────────────────────────────

test("a pre-drops row (the prod document) reads as the Halloween drop, festive at its defaults", () => {
  const v = seasonFromRow({ key: "global", mode: "halloween", saleEnabled: false, salePercent: 40, saleSlugs: ["happy-halloween"] });
  assert.equal(v.mode, "halloween");
  assert.deepEqual(v.drops.halloween, { saleEnabled: false, salePercent: 40, saleSlugs: ["happy-halloween"] });
  assert.deepEqual(v.drops.festive, { saleEnabled: true, salePercent: 30, saleSlugs: ["dandiya-partner", "happy-diwali"] });
});

test("a row with drops ignores the flat mirror and keeps each drop", () => {
  const v = seasonFromRow({
    mode: "festive",
    saleEnabled: true,
    salePercent: 49,
    saleSlugs: ["happy-halloween"],
    drops: {
      halloween: { saleEnabled: false, salePercent: 20, saleSlugs: ["happy-halloween-premium"] },
      festive: { saleEnabled: true, salePercent: 25, saleSlugs: ["Happy-Diwali"] },
    },
  });
  assert.equal(v.mode, "festive");
  assert.deepEqual(v.drops.halloween, { saleEnabled: false, salePercent: 20, saleSlugs: ["happy-halloween-premium"] });
  assert.deepEqual(v.drops.festive, { saleEnabled: true, salePercent: 25, saleSlugs: ["happy-diwali"] });
});

test("missing or malformed fields fall back to that drop's defaults; an unknown mode to the default mode", () => {
  const v = seasonFromRow({ mode: "xmas", drops: { festive: { salePercent: 300, saleSlugs: [], saleEnabled: "yes" } } });
  assert.equal(v.mode, "halloween");
  assert.deepEqual(v.drops.festive, defaultSeason().drops.festive);
  assert.deepEqual(seasonFromRow(null), defaultSeason());
});

// ── patch ────────────────────────────────────────────────────────────────────

test("a drops patch edits only the named drop and keeps the mode", () => {
  const p = validateSeasonPatch({ drops: { festive: { salePercent: 25 } } });
  assert.ok(p.ok);
  const v = applySeasonPatch(defaultSeason(), p.value);
  assert.equal(v.mode, "halloween");
  assert.equal(v.drops.festive.salePercent, 25);
  assert.deepEqual(v.drops.halloween, defaultSeason().drops.halloween);
});

test("legacy flat fields edit the body's drop mode, else the stored drop mode, else Halloween", () => {
  const flat = (body: unknown, before: SeasonView) => {
    const p = validateSeasonPatch(body);
    assert.ok(p.ok);
    return applySeasonPatch(before, p.value);
  };
  assert.equal(flat({ mode: "festive", salePercent: 15 }, defaultSeason()).drops.festive.salePercent, 15);
  assert.equal(flat({ salePercent: 15 }, at("festive")).drops.festive.salePercent, 15);
  assert.equal(flat({ salePercent: 15 }, at("festive")).drops.halloween.salePercent, 49);
  assert.equal(flat({ salePercent: 15 }, at("valentine")).drops.halloween.salePercent, 15);
  assert.equal(flat({ mode: "off", saleEnabled: false }, at("festive")).drops.festive.saleEnabled, false);
});

test("applySeasonPatch never mutates the settings it was given", () => {
  const before = defaultSeason();
  const snapshot = JSON.parse(JSON.stringify(before));
  applySeasonPatch(before, { mode: "festive", drops: { festive: { saleSlugs: ["x"] } }, flat: { salePercent: 5 } });
  assert.deepEqual(before, snapshot);
});

// ── sale per mode ────────────────────────────────────────────────────────────

test("festive mode: 30% off the festive slugs only, Halloween at full price", () => {
  const s = at("festive");
  const p = applySeasonSale(priced("happy-diwali", 19900), s);
  assert.equal(p.finalPricePaise, 13900);
  assert.equal(p.mrpPaise, 19900);
  assert.equal(p.discountPercent, 30);
  assert.equal(salePercentFor("dandiya-partner", s), 30);
  assert.equal(salePercentFor("happy-halloween", s), 0);
});

test("halloween mode: the festive slugs are full price", () => {
  assert.equal(salePercentFor("happy-diwali", at("halloween")), 0);
  assert.equal(salePercentFor("happy-halloween", at("halloween")), 49);
});

test("valentine / off: no drop, no sale", () => {
  for (const m of ["valentine", "off"] as const) {
    assert.equal(activeDrop(at(m)), null);
    assert.equal(salePercentFor("happy-diwali", at(m)), 0);
    assert.equal(salePercentFor("happy-halloween", at(m)), 0);
  }
});

test("festive sale disabled: full price, drop still stands", () => {
  const s = applySeasonPatch(at("festive"), { drops: { festive: { saleEnabled: false } } });
  assert.equal(salePercentFor("happy-diwali", s), 0);
  assert.equal(isInDrop("happy-diwali", s), true);
});

test("festive: a row with its own admin discount is left as set", () => {
  const row = priced("happy-diwali", 4900, 50);
  assert.equal(applySeasonSale(row, at("festive")), row);
});

// ── reachability per mode ────────────────────────────────────────────────────

test("only the active mode's drop makes a hidden template reachable", () => {
  assert.deepEqual(dropSlugs(at("festive")), ["dandiya-partner", "happy-diwali"]);
  assert.equal(reachableFrom("happy-diwali", false, at("festive")), true);
  assert.equal(reachableFrom("dandiya-partner", false, at("festive")), true);
  assert.equal(reachableFrom("happy-halloween", false, at("festive")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("halloween")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("valentine")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("off")), false);
  assert.equal(reachableFrom("happy-diwali", true, at("off")), true);
});

// ── API shapes ───────────────────────────────────────────────────────────────

test("public shape: `sale` is the active mode's drop; valentine/off keep showing Halloween's as before", () => {
  const f = publicSeason(at("festive"));
  assert.deepEqual(f.sale, { enabled: true, percent: 30, slugs: ["dandiya-partner", "happy-diwali"] });
  assert.deepEqual(f.drops.halloween, { enabled: true, percent: 49, slugs: ["happy-halloween", "happy-halloween-premium"] });
  assert.equal(publicSeason(at("off")).sale.percent, 49);
});

test("admin shape: flat fields for the active drop, plus every drop", () => {
  const a = adminSeason(at("festive"));
  assert.equal(a.mode, "festive");
  assert.equal(a.salePercent, 30);
  assert.deepEqual(a.drops.halloween.saleSlugs, ["happy-halloween", "happy-halloween-premium"]);
  assert.equal(a.updatedAt, null);
});
