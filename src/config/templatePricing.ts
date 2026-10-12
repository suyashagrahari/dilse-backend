// ─── Template pricing: what a super admin decided, cached ────────────────────
//
// The rule, in one line:
//
//     price(slug) = row in TemplatePricing ? that row : FREE
//
// So a template is free until somebody prices it, and the only way to price it
// is the super-admin panel. There is no code-level default price and no list of
// paid templates in this file — that is the whole point of the change. This file
// used to BE that list, mirrored by hand in `client/config/templatePricing.ts`,
// and the two had already drifted.
//
// ── THE CACHE ───────────────────────────────────────────────────────────────
//
// Every publish and every gallery load asks this question; the answer changes a
// handful of times in the life of the deployment. Same 30s TTL and same
// invalidate-on-write as `config/templateVisibility.ts`: the mutation paths call
// `invalidatePricingCache()` so a super admin's edit is live immediately on the
// host that served it, and the TTL only exists to catch a second instance behind
// a load balancer that did not handle the write.
//
// ── WHY MONEY PATHS DO NOT USE THE CACHE ────────────────────────────────────
//
// `getPricingFresh` exists for the two callers that charge: creating an order
// and spending points. A cached price is fine for deciding WHETHER to show a
// paywall — the gate — and wrong for deciding WHAT to charge. Up to 30 seconds
// after a super admin cuts a price, a cached read would take the old amount off
// a card. Reading uncached costs one query per checkout, which is nothing, and
// removes a whole class of "charged the wrong amount" bug.
//
// ── FAILING OPEN ────────────────────────────────────────────────────────────
//
// A read failure returns FREE, not an error. If Mongo is unreachable the choice
// is between publishing something we might have charged for and a Publish button
// that does not work for anybody. The first is recoverable.
//
// The one exception is `getPricingFresh`: a money path must not fail open, it
// must fail. See its own note.

import TemplatePricing from "../models/TemplatePricing";
import { slugForTemplateType } from "./templateSlugs";
import {
  derivePricing,
  freePricing,
  type PricingRow,
  type ResolvedPricing,
} from "./pricingMath";

import {
  applySeasonSale,
  discountOriginOf,
  seasonForAudience,
  type Audience,
  type DiscountOrigin,
  type SeasonView,
} from "./seasonSale";
import { getSeasonSettings } from "../services/seasonSettings.service";

export type { PricingRow, ResolvedPricing } from "./pricingMath";

// ── THE SEASON SALE ─────────────────────────────────────────────────────────
//
// Every read below passes its result through `applySeasonSale` (see
// config/seasonSale.ts) — the cached reads with the cached season, the fresh
// read with a fresh one. The cache holds the stored rows only, never a
// discounted price, so switching the sale off cannot leave a stale discount
// behind. `allPricing({ raw: true })` is the one exception: the admin pricing
// panel shows what was stored, not what a visitor is charged today.
//
// The season can differ for visitors in India and abroad, so every read that
// applies it takes the visitor's `audience` (pricingQuote.service.ts
// `audienceFor(req)`) — required, so a new caller cannot silently price one
// side's visitor at the other side's sale. The quote, the order, the points
// spend, the publish gate and GET /payment/pricing all resolve it the same way
// from the same request, so what a visitor is shown is what they are charged.

const TTL_MS = 30_000;

let cache: { rows: Map<string, PricingRow>; at: number } | null = null;

/**
 * The read in flight, if there is one.
 *
 * Without this, a cold cache under load — every gallery visitor at once after a
 * deploy — sends one query per request instead of one query. TemplateVisibility
 * has the same shape and the same stampede; this is the better version of the
 * pattern and the reason it is written out rather than copied.
 */
let inflight: Promise<Map<string, PricingRow>> | null = null;

export function invalidatePricingCache(): void {
  cache = null;
  // Deliberately NOT clearing `inflight`. A read already on the wire was issued
  // before the write landed and may return pre-write data; letting it settle and
  // then be discarded (its `at` is stale the moment we null the cache above) is
  // correct. Nulling it here would let a second read start and race the first.
}

function toRow(d: {
  slug: unknown;
  isFree: unknown;
  finalPricePaise: unknown;
  discountPercent: unknown;
  pointsCost: unknown;
  usdPriceCents?: unknown;
}): PricingRow {
  return {
    slug: String(d.slug),
    isFree: Boolean(d.isFree),
    finalPricePaise: Number(d.finalPricePaise) || 0,
    discountPercent: Number(d.discountPercent) || 0,
    pointsCost: Number(d.pointsCost) || 0,
    usdPriceCents: typeof d.usdPriceCents === "number" ? d.usdPriceCents : null,
  };
}

const SELECT = "slug isFree finalPricePaise discountPercent pointsCost usdPriceCents";

async function readAll(): Promise<Map<string, PricingRow>> {
  const docs = await TemplatePricing.find({}).select(SELECT).lean();
  const map = new Map<string, PricingRow>();
  for (const d of docs) {
    const row = toRow(d as never);
    map.set(row.slug, row);
  }
  return map;
}

async function rows(): Promise<Map<string, PricingRow>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.rows;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const map = await readAll();
      cache = { rows: map, at: Date.now() };
      return map;
    } catch (err) {
      // Fail open. Do NOT cache a failed read — an empty map cached for 30s
      // would turn a blip into half a minute of free publishes.
      console.error("[pricing] read failed, treating every template as free:", err);
      return new Map<string, PricingRow>();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * A price together with where its discount came from. The order paths record
 * the origin on the PaymentOrder (see models/PaymentOrder.ts), so the amount
 * and its explanation are read in ONE pass over the same row and season — two
 * reads could straddle a season switch and describe a discount nobody got.
 */
export interface PricingWithOrigin {
  pricing: ResolvedPricing;
  discount: DiscountOrigin;
}

const NO_DISCOUNT: DiscountOrigin = { source: "none", seasonMode: null };

function priceRow(row: PricingRow, season: SeasonView): PricingWithOrigin {
  const raw = derivePricing(row);
  return { pricing: applySeasonSale(raw, season), discount: discountOriginOf(raw, season) };
}

/** `getPricingBySlug`, plus which discount applied. */
export async function getPricingBySlugWithOrigin(slug: string, audience: Audience): Promise<PricingWithOrigin> {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return { pricing: freePricing(key), discount: NO_DISCOUNT };
  const [map, season] = await Promise.all([rows(), getSeasonSettings()]);
  const row = map.get(key);
  return row ? priceRow(row, seasonForAudience(season, audience)) : { pricing: freePricing(key), discount: NO_DISCOUNT };
}

/** The price for a template slug. Unpriced slugs are free. */
export async function getPricingBySlug(slug: string, audience: Audience): Promise<ResolvedPricing> {
  return (await getPricingBySlugWithOrigin(slug, audience)).pricing;
}

/**
 * The price for a server-side templateType.
 *
 * Async, where the old hardcoded version was sync. Every caller already sits in
 * an async function, so this is an `await`, not a restructure.
 */
export async function getPricing(templateType: string, audience: Audience): Promise<ResolvedPricing> {
  return getPricingBySlug(slugForTemplateType(templateType), audience);
}

/**
 * The price, read straight from the database, for the paths that take money.
 *
 * Two differences from `getPricing`, both deliberate:
 *
 *  • It ignores the cache, so the amount charged is the amount currently set.
 *  • It THROWS on a read failure instead of returning free.
 *
 * The second is the important one. Everywhere else, failing open means a page
 * publishes that we might have charged for — a lost sale. Here, failing open
 * would mean creating a Razorpay order for a template whose price we could not
 * read, i.e. charging an amount we invented. A checkout that errors and asks the
 * user to try again is the only acceptable failure.
 */
export async function getPricingFresh(templateType: string, audience: Audience): Promise<ResolvedPricing> {
  return (await getPricingFreshWithOrigin(templateType, audience)).pricing;
}

/** `getPricingFresh`, plus which discount applied. Same throw-on-failure rule. */
export async function getPricingFreshWithOrigin(templateType: string, audience: Audience): Promise<PricingWithOrigin> {
  const slug = slugForTemplateType(templateType);
  if (!slug) return { pricing: freePricing(slug), discount: NO_DISCOUNT };

  const [doc, season] = await Promise.all([
    TemplatePricing.findOne({ slug }).select(SELECT).lean(),
    getSeasonSettings(true),
  ]);
  return doc
    ? priceRow(toRow(doc as never), seasonForAudience(season, audience))
    : { pricing: freePricing(slug), discount: NO_DISCOUNT };
}

/** `getPricing`, plus which discount applied. */
export async function getPricingWithOrigin(templateType: string, audience: Audience): Promise<PricingWithOrigin> {
  return getPricingBySlugWithOrigin(slugForTemplateType(templateType), audience);
}

/**
 * Every priced template, keyed by slug — for the public pricing endpoint, with
 * the season sale of the visitor's side applied. `raw` skips the sale (the
 * admin pricing panel) and needs no audience.
 */
export async function allPricing(
  opts: { raw: true } | { raw?: false; audience: Audience }
): Promise<Record<string, ResolvedPricing>> {
  const raw = opts.raw === true;
  const [map, settings] = await Promise.all([rows(), raw ? null : getSeasonSettings()]);
  const season = settings && !opts.raw ? seasonForAudience(settings, opts.audience) : null;
  const out: Record<string, ResolvedPricing> = {};
  for (const [slug, row] of map) out[slug] = raw ? derivePricing(row) : applySeasonSale(derivePricing(row), season);
  return out;
}
