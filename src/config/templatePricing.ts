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

export type { PricingRow, ResolvedPricing } from "./pricingMath";

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

/** The price for a template slug. Unpriced slugs are free. */
export async function getPricingBySlug(slug: string): Promise<ResolvedPricing> {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return freePricing(key);
  const map = await rows();
  const row = map.get(key);
  return row ? derivePricing(row) : freePricing(key);
}

/**
 * The price for a server-side templateType.
 *
 * Async, where the old hardcoded version was sync. Every caller already sits in
 * an async function, so this is an `await`, not a restructure.
 */
export async function getPricing(templateType: string): Promise<ResolvedPricing> {
  return getPricingBySlug(slugForTemplateType(templateType));
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
export async function getPricingFresh(templateType: string): Promise<ResolvedPricing> {
  const slug = slugForTemplateType(templateType);
  if (!slug) return freePricing(slug);

  const doc = await TemplatePricing.findOne({ slug }).select(SELECT).lean();
  return doc ? derivePricing(toRow(doc as never)) : freePricing(slug);
}

/** Every priced template, keyed by slug — for the public pricing endpoint. */
export async function allPricing(): Promise<Record<string, ResolvedPricing>> {
  const map = await rows();
  const out: Record<string, ResolvedPricing> = {};
  for (const [slug, row] of map) out[slug] = derivePricing(row);
  return out;
}
