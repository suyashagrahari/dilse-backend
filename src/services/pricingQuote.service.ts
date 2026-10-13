// ─── A price quote for one buyer ─────────────────────────────────────────────
//
// The single place that turns (template, request) into (currency, amount).
// The paywall's displayed price and the Razorpay order both call `quoteFor`, so
// "what you saw" and "what you are charged" come from one function.
//
// The country is re-resolved on EVERY call — it is never read from the
// client, the profile, or a cookie. A super admin may force a country with the
// `X-Debug-Country` header to test the USD checkout from India; nobody else's
// header is read at all.

import type { Request } from "express";
import { allPricing, getPricingFreshWithOrigin, getPricingWithOrigin, type ResolvedPricing } from "../config/templatePricing";
import {
  currencyForCountry,
  localizePricing,
  normalizeCountry,
  type Currency,
  type LocalizedPricing,
} from "../config/currency";
import { getPaymentSettings } from "./paymentSettings.service";
import { resolveCountry } from "./geo.service";
import { isFreeForViewer, type GeoSource } from "../config/whoPays";
import { freeEntitlementFor, type FreeEntitlement } from "../config/freeAccess";
import { audienceForCountry, type Audience, type DiscountSource, type DropId } from "../config/seasonSale";

/** Why nothing is owed by this viewer on a priced template, or null when they pay. */
export type ViewerFreeReason = FreeEntitlement | "free_in_india";

export interface Quote {
  /** The INR pricing every gate and the public endpoint already use. */
  base: ResolvedPricing;
  pricing: LocalizedPricing;
  currency: Currency;
  country: string | null;
  geoSource: "cdn" | "ip" | "unknown" | "debug";
  /** Which side of the India/abroad season split priced this quote. */
  audience: Audience;
  inrPerUsd: number;
  intlPricingEnabled: boolean;
  /**
   * Nothing is owed by this viewer on this priced template: a super admin not
   * paying like a customer, an "All templates free" grant, or "Only visitors
   * outside India pay" with this visitor in India.
   */
  freeForViewer: boolean;
  /** Which of those, or null. Always null on a free template. */
  freeReason: ViewerFreeReason | null;
  /**
   * Where `pricing.discountPercent` came from: the super admin's own discount
   * on the pricing row, the active season's sale, or nothing. Recorded on the
   * order for the revenue ledger and billing statements; never changes the
   * amount (see `discountOriginOf` in config/seasonSale.ts).
   */
  discountSource: DiscountSource;
  /** The season whose sale applied ("dandiya"), when discountSource is "season_sale". */
  seasonMode: DropId | null;
}

function debugCountry(req: Request): string | null {
  if (req.userRole !== "superadmin" || req.impersonatorId) return null;
  return normalizeCountry(req.get("x-debug-country"));
}

/** The visitor's country: a super admin's test override, else the server's own lookup. */
export async function resolveViewerCountry(req: Request): Promise<{ country: string | null; source: GeoSource }> {
  const forced = debugCountry(req);
  if (forced) return { country: forced, source: "debug" };
  const geo = await resolveCountry(req);
  return { country: geo.country, source: geo.source };
}

/**
 * Which side of the season's India/abroad split this visitor is on — the one
 * definition, from the same country lookup the currency uses (unknown → see
 * UNKNOWN_COUNTRY_AUDIENCE). Every season-priced read for a request takes this.
 */
export async function audienceFor(req: Request): Promise<Audience> {
  return audienceForCountry((await resolveViewerCountry(req)).country);
}

/**
 * Does this visitor publish priced templates free right now? The publish gate's
 * rule, also checked by the order and points paths so a paywall left open
 * across a settings change can never take money that is no longer owed.
 */
export async function viewerPublishesFree(req: Request, { fresh = false } = {}): Promise<boolean> {
  const settings = await getPaymentSettings(fresh);
  if (!settings.chargeOnlyAbroad) return false;
  const geo = await resolveViewerCountry(req);
  return isFreeForViewer({ chargeOnlyAbroad: settings.chargeOnlyAbroad, country: geo.country, source: geo.source });
}

/**
 * Why this viewer owes nothing on any priced template right now, or null.
 *
 * The person (super admin / free access, keyed on req.userId — the impersonated
 * user under impersonation) is checked before the place (India), matching the
 * gate's rule order so `reason` reads the same everywhere.
 */
export async function viewerFreeReason(req: Request, { fresh = false } = {}): Promise<ViewerFreeReason | null> {
  const entitlement = await freeEntitlementFor(req.userId, { fresh });
  if (entitlement) return entitlement;
  return (await viewerPublishesFree(req, { fresh })) ? "free_in_india" : null;
}

/**
 * `fresh` reads the price and the settings uncached — the order path, where a
 * price we could not read must fail the checkout rather than invent an amount
 * (see getPricingFresh).
 */
export async function quoteFor(req: Request, templateType: string, { fresh = false } = {}): Promise<Quote> {
  // One country lookup decides the currency AND which side's season sale
  // applies, so the quote and the order (both through here) cannot disagree.
  const geo = await resolveViewerCountry(req);
  const audience = audienceForCountry(geo.country);
  const [priced, settings, entitlement] = await Promise.all([
    fresh ? getPricingFreshWithOrigin(templateType, audience) : getPricingWithOrigin(templateType, audience),
    getPaymentSettings(fresh),
    freeEntitlementFor(req.userId, { fresh }),
  ]);

  const base = priced.pricing;
  const currency = currencyForCountry(geo.country, settings.intlPricingEnabled);
  const inIndiaFree = isFreeForViewer({ chargeOnlyAbroad: settings.chargeOnlyAbroad, country: geo.country, source: geo.source });
  const freeReason: ViewerFreeReason | null = base.isFree ? null : entitlement ?? (inIndiaFree ? "free_in_india" : null);

  return {
    base,
    pricing: localizePricing(base, currency, settings.inrPerUsd),
    currency,
    country: geo.country,
    geoSource: geo.source,
    audience,
    inrPerUsd: settings.inrPerUsd,
    intlPricingEnabled: settings.intlPricingEnabled,
    freeForViewer: freeReason !== null,
    freeReason,
    discountSource: priced.discount.source,
    seasonMode: priced.discount.seasonMode,
  };
}

/** One template's price for display, in the currency this visitor will be charged in. */
export type DisplayPricing = ResolvedPricing & {
  currency: Currency;
  /** Major units (rupees / dollars) in `currency` — what checkout will charge. */
  displayFinal: number;
  displayMrp: number;
};

/**
 * GET /payment/pricing: every priced template for THIS visitor — their side of
 * the season split, and their currency. The INR fields stay as they were (gates
 * and admin read them); `currency` + `displayFinal` / `displayMrp` are what a
 * price badge shows, decided exactly as quoteFor decides the checkout currency,
 * so a visitor abroad sees "$1.99" on the page and is then charged $1.99.
 */
export async function pricingMapFor(req: Request): Promise<Record<string, DisplayPricing>> {
  const geo = await resolveViewerCountry(req);
  const [map, settings] = await Promise.all([
    allPricing({ audience: audienceForCountry(geo.country) }),
    getPaymentSettings(),
  ]);
  const currency = currencyForCountry(geo.country, settings.intlPricingEnabled);
  const out: Record<string, DisplayPricing> = {};
  for (const [slug, p] of Object.entries(map)) {
    const local = localizePricing(p, currency, settings.inrPerUsd);
    out[slug] = { ...p, currency, displayFinal: local.finalAmount / 100, displayMrp: local.mrpAmount / 100 };
  }
  return out;
}
