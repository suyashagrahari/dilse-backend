// The season sale end to end, with the three models stubbed (no database):
// the public pricing map, the publish gate's read, the paywall quote and the
// amount createOrder charges must all be the same number.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import TemplatePricing from "../models/TemplatePricing";
import SeasonSettings from "../models/SeasonSettings";
import PaymentSettings from "../models/PaymentSettings";
import { allPricing, getPricing, getPricingFresh, invalidatePricingCache } from "../config/templatePricing";
import { invalidateSeasonCache } from "./seasonSettings.service";
import { quoteFor } from "./pricingQuote.service";
import { localizePricing } from "../config/currency";
import { getPublicSeason, adminUpdateSeason } from "../controllers/season.controller";

process.env.GEO_TRUSTED_HEADER = "x-test-country";
process.env.GEO_TRUSTED_SECRET_HEADER = "x-test-secret";
process.env.GEO_TRUSTED_SECRET = "s";

const ROWS = [
  { slug: "happy-halloween", isFree: false, finalPricePaise: 19900, discountPercent: 0, pointsCost: 0, usdPriceCents: null },
  { slug: "happy-halloween-premium", isFree: false, finalPricePaise: 49900, discountPercent: 0, pointsCost: 0, usdPriceCents: 599 },
  { slug: "holi", isFree: false, finalPricePaise: 9900, discountPercent: 50, pointsCost: 0, usdPriceCents: null },
];

let seasonRow: Record<string, unknown> | null = null;
let seasonThrows = false;

const q = <T>(v: () => T) => ({ select: () => ({ lean: async () => v() }), lean: async () => v() });
/* eslint-disable @typescript-eslint/no-explicit-any */
(TemplatePricing as any).find = () => q(() => ROWS);
(TemplatePricing as any).findOne = (f: { slug: string }) => q(() => ROWS.find((r) => r.slug === f.slug) ?? null);
(SeasonSettings as any).findOne = () =>
  q(() => {
    if (seasonThrows) throw new Error("db down");
    return seasonRow;
  });
(PaymentSettings as any).findOne = () => q(() => ({ intlPricingEnabled: true, chargeOnlyAbroad: false, inrPerUsd: 88 }));

const req = (country: string) =>
  ({
    get: (h: string) => ({ "x-test-country": country, "x-test-secret": "s" } as Record<string, string>)[h.toLowerCase()],
    ip: "127.0.0.1",
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
  seasonThrows = false;
  invalidateSeasonCache();
  invalidatePricingCache();
});

test("no season row: the default 49% applies to the Halloween slugs only", async () => {
  const map = await allPricing();
  assert.equal(map["happy-halloween"].finalPricePaise, 10100);
  assert.equal(map["happy-halloween"].discountPercent, 49);
  assert.equal(map["happy-halloween"].mrpPaise, 19900);
  assert.equal(map["happy-halloween-premium"].finalPricePaise, 25400);
  assert.equal(map["happy-halloween-premium"].usdPriceCents, 305);
  assert.equal(map.holi.finalPricePaise, 9900);
  assert.equal(map.holi.discountPercent, 50);
});

test("the raw map (admin panel) shows the stored price", async () => {
  const map = await allPricing({ raw: true });
  assert.equal(map["happy-halloween"].finalPricePaise, 19900);
});

for (const country of ["IN", "US"]) {
  test(`order amount === quote amount === gate price (${country})`, async () => {
    for (const slug of ["happy-halloween", "happy-halloween-premium", "holi"]) {
      const shown = await quoteFor(req(country), slug); // GET /payment/quote
      const charged = await quoteFor(req(country), slug, { fresh: true }); // createOrder
      const gate = await getPricing(slug); // publish gate
      const publicMap = (await allPricing())[slug]; // GET /payment/pricing
      assert.equal(charged.pricing.finalAmount, shown.pricing.finalAmount, slug);
      assert.equal(charged.pricing.currency, shown.pricing.currency, slug);
      assert.equal(gate.finalPricePaise, charged.base.finalPricePaise, slug);
      assert.equal(publicMap.finalPricePaise, charged.base.finalPricePaise, slug);
      // createOrder's legacy (INR-only client) charge path
      assert.equal(localizePricing(charged.base, "INR", 88).finalAmount, publicMap.finalPricePaise, slug);
    }
    const hq = await quoteFor(req(country), "happy-halloween", { fresh: true });
    assert.equal(hq.pricing.discountPercent, 49);
    assert.equal(hq.pricing.finalAmount, country === "IN" ? 10100 : 199);
  });
}

test("sale off or mode off: every read returns the stored price", async () => {
  for (const row of [
    { mode: "halloween", saleEnabled: false, salePercent: 49, saleSlugs: ["happy-halloween", "happy-halloween-premium"] },
    { mode: "valentine", saleEnabled: true, salePercent: 49, saleSlugs: ["happy-halloween", "happy-halloween-premium"] },
  ]) {
    seasonRow = row;
    invalidateSeasonCache();
    assert.equal((await allPricing())["happy-halloween"].finalPricePaise, 19900);
    assert.equal((await getPricingFresh("happy-halloween")).finalPricePaise, 19900);
    assert.equal((await getPricing("happy-halloween-premium")).discountPercent, 0);
    assert.equal((await quoteFor(req("IN"), "happy-halloween", { fresh: true })).pricing.finalAmount, 19900);
  }
});

test("GET /season returns the public shape with a 15 s cache header", async () => {
  seasonRow = { mode: "halloween", saleEnabled: true, salePercent: 30, saleSlugs: ["happy-halloween"] };
  const { r, res } = fakeRes();
  await getPublicSeason({} as Request, res);
  assert.equal(r.headers["Cache-Control"], "public, max-age=15");
  assert.deepEqual(r.body, {
    success: true,
    data: { mode: "halloween", sale: { enabled: true, percent: 30, slugs: ["happy-halloween"] } },
  });
});

test("GET /season never errors: a failed read answers with the defaults", async () => {
  seasonThrows = true;
  const { r, res } = fakeRes();
  await getPublicSeason({} as Request, res);
  assert.equal(r.statusCode, 200);
  assert.deepEqual((r.body as { data: unknown }).data, {
    mode: "halloween",
    sale: { enabled: true, percent: 49, slugs: ["happy-halloween", "happy-halloween-premium"] },
  });
});

test("PUT /admin/super/season rejects invalid bodies with 400 INVALID_SEASON", async () => {
  for (const body of [{}, { mode: "xmas" }, { saleEnabled: "no" }, { salePercent: 0 }, { salePercent: 91 }, { saleSlugs: [] }]) {
    const { r, res } = fakeRes();
    await adminUpdateSeason({ body } as Request, res);
    assert.equal(r.statusCode, 400, JSON.stringify(body));
    assert.equal((r.body as { code: string }).code, "INVALID_SEASON");
  }
});
