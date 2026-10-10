// ─── Seasonal sale: the one place a season discount touches a price ─────────
//
// Pure functions, no database and no Express — the same reason as
// pricingMath.ts. `applySeasonSale` is called by every pricing read in
// config/templatePricing.ts (getPricing, getPricingFresh, allPricing), so the
// publish gate, `/payment/quote`, `/payment/pricing` and `createOrder` all see
// the same discounted number. Nothing else may discount a price.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
//   mode === "halloween" && saleEnabled && slug ∈ saleSlugs && template is paid
//     → finalPricePaise = max(100, round(base × (100 − percent) / 100))
//       usdPriceCents   = scaled the same way, never below MIN_USD_CENTS
//                         (null stays null: the derived USD price follows the
//                         discounted INR price on its own)
//       discountPercent = percent, mrp = the regular price, so the paywall
//                         strikes the regular price through
//
// A free template stays free. Points are untouched — the sale is a money sale.

import { MIN_USD_CENTS, type ResolvedPricing } from "./pricingMath";

export type SeasonMode = "valentine" | "halloween" | "off";
export const SEASON_MODES: readonly SeasonMode[] = ["valentine", "halloween", "off"] as const;

export const HALLOWEEN_SALE_SLUGS: readonly string[] = ["happy-halloween", "happy-halloween-premium"] as const;
export const MIN_SALE_PERCENT = 1;
export const MAX_SALE_PERCENT = 90;
/** Razorpay's INR floor: ₹1. */
export const MIN_SALE_PAISE = 100;

export interface SeasonView {
  mode: SeasonMode;
  saleEnabled: boolean;
  salePercent: number;
  saleSlugs: string[];
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

/** What applies when no document exists — or when the read fails. */
export function defaultSeason(): SeasonView {
  return { mode: "halloween", saleEnabled: true, salePercent: 49, saleSlugs: [...HALLOWEEN_SALE_SLUGS] };
}

/** The percent off for this slug right now, or 0 when the sale does not cover it. */
export function salePercentFor(slug: string, season: SeasonView | null | undefined): number {
  if (!season || season.mode !== "halloween" || !season.saleEnabled) return 0;
  const pct = Math.round(Number(season.salePercent));
  if (!Number.isFinite(pct) || pct < MIN_SALE_PERCENT || pct > MAX_SALE_PERCENT) return 0;
  const key = String(slug || "").trim().toLowerCase();
  return season.saleSlugs.includes(key) ? pct : 0;
}

/** `amount` minus `percent`, rounded to the nearest minor unit, never below `floor`. */
export function discounted(amount: number, percent: number, floor: number): number {
  return Math.max(floor, Math.round((amount * (100 - percent)) / 100));
}

/** The pricing with the season sale applied, or the same object when it does not apply. */
export function applySeasonSale(pricing: ResolvedPricing, season: SeasonView | null | undefined): ResolvedPricing {
  if (pricing.isFree) return pricing;
  const pct = salePercentFor(pricing.slug, season);
  if (pct === 0) return pricing;

  const regular = pricing.finalPricePaise;
  const finalPricePaise = Math.min(regular, discounted(regular, pct, MIN_SALE_PAISE));
  const mrpPaise = Math.max(regular, finalPricePaise);
  const savingsPaise = mrpPaise - finalPricePaise;
  const usd = pricing.usdPriceCents;

  return {
    ...pricing,
    finalPricePaise,
    finalPrice: finalPricePaise / 100,
    mrpPaise,
    mrp: mrpPaise / 100,
    savingsPaise,
    savings: savingsPaise / 100,
    discountPercent: pct,
    usdPriceCents:
      typeof usd === "number" && usd > 0 ? Math.min(usd, discounted(usd, pct, MIN_USD_CENTS)) : usd,
  };
}

/**
 * Validate a super admin's PUT body. Every field optional; unknown fields are
 * ignored. `saleSlugs`, when given, must be a non-empty list of slugs.
 */
export function validateSeasonPatch(
  input: unknown
):
  | { ok: true; value: Partial<Pick<SeasonView, "mode" | "saleEnabled" | "salePercent" | "saleSlugs">> }
  | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Body must be an object" };
  }
  const o = input as Record<string, unknown>;
  const value: Partial<Pick<SeasonView, "mode" | "saleEnabled" | "salePercent" | "saleSlugs">> = {};

  if (o.mode !== undefined) {
    if (!SEASON_MODES.includes(o.mode as SeasonMode)) {
      return { ok: false, error: `mode must be one of ${SEASON_MODES.join(", ")}` };
    }
    value.mode = o.mode as SeasonMode;
  }
  if (o.saleEnabled !== undefined) {
    if (typeof o.saleEnabled !== "boolean") return { ok: false, error: "saleEnabled must be true or false" };
    value.saleEnabled = o.saleEnabled;
  }
  if (o.salePercent !== undefined) {
    const p = o.salePercent;
    if (!Number.isInteger(p) || (p as number) < MIN_SALE_PERCENT || (p as number) > MAX_SALE_PERCENT) {
      return { ok: false, error: `salePercent must be a whole number from ${MIN_SALE_PERCENT} to ${MAX_SALE_PERCENT}` };
    }
    value.salePercent = p as number;
  }
  if (o.saleSlugs !== undefined) {
    const s = o.saleSlugs;
    if (
      !Array.isArray(s) ||
      s.length === 0 ||
      s.length > 50 ||
      !s.every((x) => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(x))
    ) {
      return { ok: false, error: "saleSlugs must be a non-empty list of lower-case template slugs" };
    }
    value.saleSlugs = Array.from(new Set(s as string[]));
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Nothing to update: send mode, saleEnabled, salePercent or saleSlugs" };
  }
  return { ok: true, value };
}

/** The public shape of `GET /api/season`. */
export function publicSeason(s: SeasonView) {
  return { mode: s.mode, sale: { enabled: s.saleEnabled, percent: s.salePercent, slugs: [...s.saleSlugs] } };
}
