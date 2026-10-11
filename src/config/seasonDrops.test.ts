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

const DANDIYA_DEFAULT = { saleEnabled: true, salePercent: 30, saleSlugs: ["dandiya-partner"] };
const DIWALI_DEFAULT = { saleEnabled: true, salePercent: 30, saleSlugs: ["happy-diwali"] };

test("a pre-drops row (the prod document) reads as the Halloween drop, dandiya + diwali at their defaults", () => {
  const v = seasonFromRow({ key: "global", mode: "halloween", saleEnabled: false, salePercent: 40, saleSlugs: ["happy-halloween"] });
  assert.equal(v.mode, "halloween");
  assert.deepEqual(v.drops.halloween, { saleEnabled: false, salePercent: 40, saleSlugs: ["happy-halloween"] });
  assert.deepEqual(v.drops.dandiya, DANDIYA_DEFAULT);
  assert.deepEqual(v.drops.diwali, DIWALI_DEFAULT);
  assert.equal("festive" in v.drops, false);
});

test("a row with drops ignores the flat mirror and keeps each drop", () => {
  const v = seasonFromRow({
    mode: "dandiya",
    saleEnabled: true,
    salePercent: 49,
    saleSlugs: ["happy-halloween"],
    drops: {
      halloween: { saleEnabled: false, salePercent: 20, saleSlugs: ["happy-halloween-premium"] },
      dandiya: { saleEnabled: false, salePercent: 15, saleSlugs: ["Dandiya-Partner"] },
      diwali: { saleEnabled: true, salePercent: 25, saleSlugs: ["Happy-Diwali"] },
    },
  });
  assert.equal(v.mode, "dandiya");
  assert.deepEqual(v.drops.halloween, { saleEnabled: false, salePercent: 20, saleSlugs: ["happy-halloween-premium"] });
  assert.deepEqual(v.drops.dandiya, { saleEnabled: false, salePercent: 15, saleSlugs: ["dandiya-partner"] });
  assert.deepEqual(v.drops.diwali, { saleEnabled: true, salePercent: 25, saleSlugs: ["happy-diwali"] });
});

test("round 1's merged `festive` mode and drop migrate to diwali on read", () => {
  const v = seasonFromRow({
    mode: "festive",
    drops: { festive: { saleEnabled: false, salePercent: 22, saleSlugs: ["dandiya-partner", "happy-diwali", "diwali-extra"] } },
  });
  assert.equal(v.mode, "diwali");
  // Same switch and percent; the Dandiya template now belongs to its own season.
  assert.deepEqual(v.drops.diwali, { saleEnabled: false, salePercent: 22, saleSlugs: ["happy-diwali", "diwali-extra"] });
  assert.deepEqual(v.drops.dandiya, DANDIYA_DEFAULT);
  assert.equal("festive" in v.drops, false);
  // A festive drop holding only the Dandiya slug falls back to the Diwali default slugs.
  assert.deepEqual(seasonFromRow({ drops: { festive: { saleSlugs: ["dandiya-partner"] } } }).drops.diwali.saleSlugs, ["happy-diwali"]);
  // An explicit drops.diwali wins over a stale drops.festive.
  const both = seasonFromRow({ drops: { festive: { salePercent: 11 }, diwali: { salePercent: 33 } } });
  assert.equal(both.drops.diwali.salePercent, 33);
});

test("a migrated row exposes only the new modes in both API shapes", () => {
  const v = seasonFromRow({ mode: "festive", drops: { festive: { salePercent: 22 } } });
  const pub = publicSeason(v);
  assert.equal(pub.mode, "diwali");
  assert.deepEqual(Object.keys(pub.drops).sort(), ["dandiya", "diwali", "halloween"]);
  assert.deepEqual(pub.sale, { enabled: true, percent: 22, slugs: ["happy-diwali"] });
  assert.equal(adminSeason(v).mode, "diwali");
});

test("missing or malformed fields fall back to that drop's defaults; an unknown mode to the default mode", () => {
  const v = seasonFromRow({ mode: "xmas", drops: { diwali: { salePercent: 300, saleSlugs: [], saleEnabled: "yes" } } });
  assert.equal(v.mode, "halloween");
  assert.deepEqual(v.drops.diwali, defaultSeason().drops.diwali);
  assert.deepEqual(seasonFromRow(null), defaultSeason());
});

// ── patch ────────────────────────────────────────────────────────────────────

test("PUT accepts the two new modes and drops, and rejects the retired `festive`", () => {
  assert.deepEqual(validateSeasonPatch({ mode: "dandiya" }), { ok: true, value: { mode: "dandiya" } });
  assert.deepEqual(validateSeasonPatch({ mode: "diwali" }), { ok: true, value: { mode: "diwali" } });
  assert.equal(validateSeasonPatch({ mode: "festive" }).ok, false);
  assert.equal(validateSeasonPatch({ drops: { festive: { salePercent: 10 } } }).ok, false);
  assert.deepEqual(validateSeasonPatch({ drops: { dandiya: { salePercent: 35 }, diwali: { saleEnabled: false } } }), {
    ok: true,
    value: { drops: { dandiya: { salePercent: 35 }, diwali: { saleEnabled: false } } },
  });
});

test("a drops patch edits only the named drop and keeps the mode", () => {
  const p = validateSeasonPatch({ drops: { diwali: { salePercent: 25 } } });
  assert.ok(p.ok);
  const v = applySeasonPatch(defaultSeason(), p.value);
  assert.equal(v.mode, "halloween");
  assert.equal(v.drops.diwali.salePercent, 25);
  assert.deepEqual(v.drops.dandiya, defaultSeason().drops.dandiya);
  assert.deepEqual(v.drops.halloween, defaultSeason().drops.halloween);
});

test("legacy flat fields edit the body's drop mode, else the stored drop mode, else Halloween", () => {
  const flat = (body: unknown, before: SeasonView) => {
    const p = validateSeasonPatch(body);
    assert.ok(p.ok);
    return applySeasonPatch(before, p.value);
  };
  assert.equal(flat({ mode: "dandiya", salePercent: 15 }, defaultSeason()).drops.dandiya.salePercent, 15);
  assert.equal(flat({ salePercent: 15 }, at("diwali")).drops.diwali.salePercent, 15);
  assert.equal(flat({ salePercent: 15 }, at("diwali")).drops.dandiya.salePercent, 30);
  assert.equal(flat({ salePercent: 15 }, at("diwali")).drops.halloween.salePercent, 49);
  assert.equal(flat({ salePercent: 15 }, at("valentine")).drops.halloween.salePercent, 15);
  assert.equal(flat({ mode: "off", saleEnabled: false }, at("dandiya")).drops.dandiya.saleEnabled, false);
});

test("applySeasonPatch never mutates the settings it was given", () => {
  const before = defaultSeason();
  const snapshot = JSON.parse(JSON.stringify(before));
  applySeasonPatch(before, { mode: "diwali", drops: { diwali: { saleSlugs: ["x"] } }, flat: { salePercent: 5 } });
  assert.deepEqual(before, snapshot);
});

// ── sale per mode ────────────────────────────────────────────────────────────

test("dandiya mode: 30% off the Dandiya slug only — Diwali and Halloween at full price", () => {
  const s = at("dandiya");
  const p = applySeasonSale(priced("dandiya-partner", 19900), s);
  assert.equal(p.finalPricePaise, 13900);
  assert.equal(p.mrpPaise, 19900);
  assert.equal(p.discountPercent, 30);
  assert.equal(salePercentFor("happy-diwali", s), 0);
  assert.equal(salePercentFor("happy-halloween", s), 0);
});

test("diwali mode: 30% off the Diwali slug only — Dandiya and Halloween at full price", () => {
  const s = at("diwali");
  assert.equal(applySeasonSale(priced("happy-diwali", 19900), s).finalPricePaise, 13900);
  assert.equal(salePercentFor("happy-diwali", s), 30);
  assert.equal(salePercentFor("dandiya-partner", s), 0);
  assert.equal(salePercentFor("happy-halloween", s), 0);
});

test("halloween mode: the festival slugs are full price", () => {
  assert.equal(salePercentFor("happy-diwali", at("halloween")), 0);
  assert.equal(salePercentFor("dandiya-partner", at("halloween")), 0);
  assert.equal(salePercentFor("happy-halloween", at("halloween")), 49);
});

test("valentine / off: no drop, no sale", () => {
  for (const m of ["valentine", "off"] as const) {
    assert.equal(activeDrop(at(m)), null);
    assert.equal(salePercentFor("happy-diwali", at(m)), 0);
    assert.equal(salePercentFor("dandiya-partner", at(m)), 0);
    assert.equal(salePercentFor("happy-halloween", at(m)), 0);
  }
});

test("a drop's sale disabled: full price, drop still stands", () => {
  const s = applySeasonPatch(at("dandiya"), { drops: { dandiya: { saleEnabled: false } } });
  assert.equal(salePercentFor("dandiya-partner", s), 0);
  assert.equal(isInDrop("dandiya-partner", s), true);
});

test("a row with its own admin discount is left as set", () => {
  const row = priced("happy-diwali", 4900, 50);
  assert.equal(applySeasonSale(row, at("diwali")), row);
});

// ── reachability per mode ────────────────────────────────────────────────────

test("only the active mode's drop makes a hidden template reachable", () => {
  assert.deepEqual(dropSlugs(at("dandiya")), ["dandiya-partner"]);
  assert.deepEqual(dropSlugs(at("diwali")), ["happy-diwali"]);
  assert.equal(reachableFrom("dandiya-partner", false, at("dandiya")), true);
  assert.equal(reachableFrom("happy-diwali", false, at("dandiya")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("diwali")), true);
  assert.equal(reachableFrom("dandiya-partner", false, at("diwali")), false);
  assert.equal(reachableFrom("happy-halloween", false, at("diwali")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("halloween")), false);
  assert.equal(reachableFrom("happy-diwali", false, at("valentine")), false);
  assert.equal(reachableFrom("dandiya-partner", false, at("off")), false);
  assert.equal(reachableFrom("happy-diwali", true, at("off")), true);
});

// ── API shapes ───────────────────────────────────────────────────────────────

test("public shape: `sale` is the active mode's drop; valentine/off keep showing Halloween's as before", () => {
  const d = publicSeason(at("dandiya"));
  assert.equal(d.mode, "dandiya");
  assert.deepEqual(d.sale, { enabled: true, percent: 30, slugs: ["dandiya-partner"] });
  assert.deepEqual(publicSeason(at("diwali")).sale, { enabled: true, percent: 30, slugs: ["happy-diwali"] });
  assert.deepEqual(d.drops.halloween, { enabled: true, percent: 49, slugs: ["happy-halloween", "happy-halloween-premium"] });
  assert.deepEqual(Object.keys(d.drops).sort(), ["dandiya", "diwali", "halloween"]);
  assert.equal(publicSeason(at("off")).sale.percent, 49);
});

test("admin shape: flat fields for the active drop, plus every drop", () => {
  const a = adminSeason(at("diwali"));
  assert.equal(a.mode, "diwali");
  assert.equal(a.salePercent, 30);
  assert.deepEqual(a.saleSlugs, ["happy-diwali"]);
  assert.deepEqual(a.drops.dandiya.saleSlugs, ["dandiya-partner"]);
  assert.deepEqual(a.drops.halloween.saleSlugs, ["happy-halloween", "happy-halloween-premium"]);
  assert.equal(a.updatedAt, null);
});
