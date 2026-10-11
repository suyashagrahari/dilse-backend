// Season by visitor country: a super admin shows visitors in India one season
// and visitors abroad another. The visitor's side, its sale on every money
// path, reachability (the union of both sides), migration and validation.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import TemplatePricing from "../models/TemplatePricing";
import SeasonSettings from "../models/SeasonSettings";
import PaymentSettings from "../models/PaymentSettings";
import PaymentOrder from "../models/PaymentOrder";
import { allPricing, getPricing, getPricingFresh, invalidatePricingCache } from "../config/templatePricing";
import { invalidateSeasonCache } from "./seasonSettings.service";
import { audienceFor, quoteFor } from "./pricingQuote.service";
import { resolveSeason } from "./seasonViewer.service";
import { checkPublishAccess } from "./publishGate.service";
import { adminPreviewSeason, adminUpdateSeason, getPublicSeason } from "../controllers/season.controller";
import {
  adminSeason,
  applySeasonPatch,
  audienceForCountry,
  defaultSeason,
  dropSlugs,
  publicSeason,
  salePercentFor,
  seasonForAudience,
  seasonFromRow,
  UNKNOWN_COUNTRY_AUDIENCE,
  validateSeasonPatch,
} from "../config/seasonSale";
import { reachableFrom } from "../config/templateVisibility";

process.env.GEO_TRUSTED_HEADER = "x-test-country";
process.env.GEO_TRUSTED_SECRET_HEADER = "x-test-secret";
process.env.GEO_TRUSTED_SECRET = "s";

const ROWS = [
  { slug: "happy-halloween", isFree: false, finalPricePaise: 19900, discountPercent: 0, pointsCost: 0, usdPriceCents: null },
  { slug: "happy-diwali", isFree: false, finalPricePaise: 19900, discountPercent: 0, pointsCost: 0, usdPriceCents: null },
  { slug: "dandiya-partner", isFree: false, finalPricePaise: 19900, discountPercent: 0, pointsCost: 0, usdPriceCents: null },
];

/** The owner's example: Diwali in India, Halloween abroad. */
const SPLIT_ROW = {
  key: "global",
  mode: "halloween",
  split: true,
  modeIndia: "diwali",
  modeAbroad: "halloween",
  drops: {
    halloween: { saleEnabled: true, salePercent: 49, saleSlugs: ["happy-halloween"] },
    dandiya: { saleEnabled: true, salePercent: 30, saleSlugs: ["dandiya-partner"] },
    diwali: { saleEnabled: true, salePercent: 30, saleSlugs: ["happy-diwali"] },
  },
};

let seasonRow: Record<string, unknown> | null = null;
const q = <T>(v: () => T) => ({ select: () => ({ lean: async () => v() }), lean: async () => v() });
/* eslint-disable @typescript-eslint/no-explicit-any */
(TemplatePricing as any).find = () => q(() => ROWS);
(TemplatePricing as any).findOne = (f: { slug: string }) => q(() => ROWS.find((r) => r.slug === f.slug) ?? null);
(SeasonSettings as any).findOne = () => q(() => seasonRow);
(PaymentSettings as any).findOne = () => q(() => ({ intlPricingEnabled: true, chargeOnlyAbroad: false, inrPerUsd: 88 }));
(PaymentOrder as any).findOne = () => ({ select: async () => null });

/** A request from `country` (the trusted test header), or from nowhere the lookup knows. */
const req = (country: string | null) =>
  ({
    get: (h: string) =>
      (country ? ({ "x-test-country": country, "x-test-secret": "s" } as Record<string, string>) : ({} as Record<string, string>))[
        h.toLowerCase()
      ],
    ip: "127.0.0.1",
    query: {},
  }) as unknown as Request;

function fakeRes() {
  const r = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    status(c: number) { r.statusCode = c; return res; },
    json(b: unknown) { r.body = b; return res; },
    set(k: string, v: string) { r.headers[k] = v; return res; },
  };
  return { r, res: res as unknown as Response };
}

beforeEach(() => {
  seasonRow = null;
  invalidateSeasonCache();
  invalidatePricingCache();
});

// ── the side ────────────────────────────────────────────────────────────────

test("IN → india, any other country → abroad, unknown → the India side (one named constant)", () => {
  assert.equal(audienceForCountry("IN"), "india");
  assert.equal(audienceForCountry("US"), "abroad");
  assert.equal(audienceForCountry("GB"), "abroad");
  assert.equal(audienceForCountry(null), "india");
  assert.equal(UNKNOWN_COUNTRY_AUDIENCE, "india");
});

test("resolveSeason: split on → India sees Diwali, the US sees Halloween, unknown sees Diwali", async () => {
  seasonRow = SPLIT_ROW;
  const india = await resolveSeason(req("IN"));
  const us = await resolveSeason(req("US"));
  const unknown = await resolveSeason(req(null));
  assert.deepEqual([india.audience, india.season.mode], ["india", "diwali"]);
  assert.deepEqual([us.audience, us.season.mode], ["abroad", "halloween"]);
  assert.deepEqual([unknown.audience, unknown.season.mode], ["india", "diwali"]);
  assert.equal(await audienceFor(req("DE")), "abroad");
});

test("split off: everyone sees the single mode, whatever the per-side modes say", async () => {
  seasonRow = { ...SPLIT_ROW, split: false, mode: "dandiya" };
  for (const c of ["IN", "US", null]) assert.equal((await resolveSeason(req(c))).season.mode, "dandiya", String(c));
});

// ── GET /season ─────────────────────────────────────────────────────────────

test("GET /season answers for THIS visitor, privately cached", async () => {
  seasonRow = SPLIT_ROW;
  const ask = async (c: string | null) => {
    const { r, res } = fakeRes();
    await getPublicSeason(req(c), res);
    assert.equal(r.headers["Cache-Control"], "private, max-age=15");
    return (r.body as { data: Record<string, any> }).data;
  };
  const india = await ask("IN");
  assert.equal(india.mode, "diwali");
  assert.deepEqual(india.sale, { enabled: true, percent: 30, slugs: ["happy-diwali"] });
  assert.equal(india.audience, "india");
  assert.equal(india.split, true);
  assert.deepEqual(india.audiences, { india: "diwali", abroad: "halloween" });
  const us = await ask("US");
  assert.equal(us.mode, "halloween");
  assert.deepEqual(us.sale, { enabled: true, percent: 49, slugs: ["happy-halloween"] });
  assert.equal(us.audience, "abroad");
  assert.equal((await ask(null)).mode, "diwali");
});

test("split on but both sides the same mode: `split` reads false (nothing depends on the country)", () => {
  const v = seasonFromRow({ ...SPLIT_ROW, modeIndia: "halloween", modeAbroad: "halloween" });
  assert.equal(publicSeason(v, "india").split, false);
  assert.equal(publicSeason(v, "abroad").mode, "halloween");
});

test("the super-admin preview answers for the side asked, and rejects anything else", async () => {
  seasonRow = SPLIT_ROW;
  for (const [audience, mode] of [["india", "diwali"], ["abroad", "halloween"]]) {
    const { r, res } = fakeRes();
    await adminPreviewSeason({ query: { audience } } as unknown as Request, res);
    assert.equal(r.headers["Cache-Control"], "private, no-store");
    assert.equal((r.body as { data: { mode: string } }).data.mode, mode);
  }
  const { r, res } = fakeRes();
  await adminPreviewSeason({ query: { audience: "mars" } } as unknown as Request, res);
  assert.equal(r.statusCode, 400);
});

// ── money ───────────────────────────────────────────────────────────────────

test("sale per side: India pays the Diwali sale, abroad the Halloween sale, never the other's", async () => {
  seasonRow = SPLIT_ROW;
  const india = await allPricing({ audience: "india" });
  const abroad = await allPricing({ audience: "abroad" });
  assert.equal(india["happy-diwali"].finalPricePaise, 13900);
  assert.equal(india["happy-halloween"].finalPricePaise, 19900);
  assert.equal(abroad["happy-halloween"].finalPricePaise, 10100);
  assert.equal(abroad["happy-diwali"].finalPricePaise, 19900);
  assert.equal(india["dandiya-partner"].finalPricePaise, 19900);
  assert.equal((await getPricingFresh("happy-diwali", "abroad")).discountPercent, 0);
  assert.equal((await getPricing("happy-halloween", "india")).discountPercent, 0);
});

for (const country of ["IN", "US", null]) {
  test(`quote === order === gate === public map for the same visitor (${country ?? "unknown"})`, async () => {
    seasonRow = SPLIT_ROW;
    const r = req(country);
    const audience = await audienceFor(r);
    for (const slug of ["happy-halloween", "happy-diwali", "dandiya-partner"]) {
      const shown = await quoteFor(r, slug);
      const charged = await quoteFor(r, slug, { fresh: true });
      const map = (await allPricing({ audience }))[slug];
      const gate = await checkPublishAccess({ req: r, userId: "u1", templateType: slug, pageId: "p1", isAlreadyPublished: false });
      assert.equal(charged.pricing.finalAmount, shown.pricing.finalAmount, slug);
      assert.equal(charged.audience, audience, slug);
      assert.equal(charged.base.finalPricePaise, map.finalPricePaise, slug);
      assert.equal(gate.pricing.finalPricePaise, charged.base.finalPricePaise, slug);
    }
    const diwali = await quoteFor(r, "happy-diwali", { fresh: true });
    const halloween = await quoteFor(r, "happy-halloween", { fresh: true });
    const abroad = country === "US";
    assert.equal(diwali.base.discountPercent, abroad ? 0 : 30);
    assert.equal(halloween.base.discountPercent, abroad ? 49 : 0);
  });
}

test("split off: both sides price exactly as the single mode did", async () => {
  seasonRow = { ...SPLIT_ROW, split: false, mode: "halloween" };
  for (const audience of ["india", "abroad"] as const) {
    const m = await allPricing({ audience });
    assert.equal(m["happy-halloween"].finalPricePaise, 10100, audience);
    assert.equal(m["happy-diwali"].finalPricePaise, 19900, audience);
  }
});

// ── reachability ────────────────────────────────────────────────────────────

test("reachability is the union of both sides' drops; the discount is not", () => {
  const v = seasonFromRow(SPLIT_ROW);
  assert.deepEqual(dropSlugs(v).sort(), ["happy-diwali", "happy-halloween"]);
  assert.equal(reachableFrom("happy-diwali", false, v), true);
  assert.equal(reachableFrom("happy-halloween", false, v), true);
  assert.equal(reachableFrom("dandiya-partner", false, v), false);
  // …while the sale follows the side.
  assert.equal(salePercentFor("happy-halloween", seasonForAudience(v, "india")), 0);
  assert.equal(salePercentFor("happy-halloween", seasonForAudience(v, "abroad")), 49);
});

test("a side in valentine/off contributes no drop to the union", () => {
  const v = seasonFromRow({ ...SPLIT_ROW, modeAbroad: "off" });
  assert.deepEqual(dropSlugs(v), ["happy-diwali"]);
  assert.equal(salePercentFor("happy-diwali", seasonForAudience(v, "abroad")), 0);
});

test("split off: only the single mode's drop is reachable (today's rule)", () => {
  const v = seasonFromRow({ ...SPLIT_ROW, split: false, mode: "dandiya" });
  assert.deepEqual(dropSlugs(v), ["dandiya-partner"]);
});

// ── migration ───────────────────────────────────────────────────────────────

test("a row from before the split reads as split off, both sides at its mode", () => {
  const v = seasonFromRow({ key: "global", mode: "diwali", drops: {} });
  assert.equal(v.split, false);
  assert.equal(v.modeIndia, "diwali");
  assert.equal(v.modeAbroad, "diwali");
  assert.equal(seasonForAudience(v, "abroad").mode, "diwali");
  // No row at all: the documented defaults.
  assert.deepEqual(
    [defaultSeason().split, defaultSeason().modeIndia, defaultSeason().modeAbroad],
    [false, "halloween", "halloween"]
  );
  // A legacy alias on a side migrates like the single mode does; junk falls back to the single mode.
  const w = seasonFromRow({ mode: "valentine", split: true, modeIndia: "festive", modeAbroad: "xmas" });
  assert.deepEqual([w.modeIndia, w.modeAbroad], ["diwali", "valentine"]);
});

// ── validation and the patch ────────────────────────────────────────────────

test("PUT validation: split must be boolean, each side one of the five modes", () => {
  assert.deepEqual(validateSeasonPatch({ split: true, modeIndia: "diwali", modeAbroad: "halloween" }), {
    ok: true,
    value: { split: true, modeIndia: "diwali", modeAbroad: "halloween" },
  });
  assert.equal(validateSeasonPatch({ modeAbroad: "off" }).ok, true);
  for (const body of [{ split: "yes" }, { split: 1 }, { modeIndia: "xmas" }, { modeAbroad: "festive" }, { modeIndia: null }]) {
    assert.equal(validateSeasonPatch(body).ok, false, JSON.stringify(body));
  }
});

test("PUT rejects a bad split body with 400 INVALID_SEASON", async () => {
  for (const body of [{ split: "on" }, { modeIndia: "xmas" }]) {
    const { r, res } = fakeRes();
    await adminUpdateSeason({ body } as Request, res);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
  }
});

test("the patch: split fields are independent of the single mode, and the old `mode` still edits the single mode", () => {
  const before = seasonFromRow(SPLIT_ROW);
  const a = applySeasonPatch(before, { mode: "off" });
  assert.deepEqual([a.mode, a.split, a.modeIndia, a.modeAbroad], ["off", true, "diwali", "halloween"]);
  const b = applySeasonPatch(before, { split: false });
  assert.deepEqual([b.mode, b.split], ["halloween", false]);
  assert.equal(seasonForAudience(b, "india").mode, "halloween");
  const c = applySeasonPatch(seasonFromRow({ mode: "dandiya" }), { split: true, modeAbroad: "halloween" });
  assert.deepEqual([c.modeIndia, c.modeAbroad], ["dandiya", "halloween"]);
});

test("admin shape carries split, modeIndia and modeAbroad", () => {
  const a = adminSeason(seasonFromRow(SPLIT_ROW));
  assert.deepEqual([a.mode, a.split, a.modeIndia, a.modeAbroad], ["halloween", true, "diwali", "halloween"]);
});
