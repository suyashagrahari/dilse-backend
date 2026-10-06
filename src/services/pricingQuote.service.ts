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
import { getPricing, getPricingFresh, type ResolvedPricing } from "../config/templatePricing";
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

export interface Quote {
  /** The INR pricing every gate and the public endpoint already use. */
  base: ResolvedPricing;
  pricing: LocalizedPricing;
  currency: Currency;
  country: string | null;
  geoSource: "cdn" | "ip" | "unknown" | "debug";
  inrPerUsd: number;
  intlPricingEnabled: boolean;
  /** "Only visitors outside India pay" is on and this visitor is in India: nothing is owed. */
  freeForViewer: boolean;
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
 * `fresh` reads the price and the settings uncached — the order path, where a
 * price we could not read must fail the checkout rather than invent an amount
 * (see getPricingFresh).
 */
export async function quoteFor(req: Request, templateType: string, { fresh = false } = {}): Promise<Quote> {
  const [base, settings] = await Promise.all([
    fresh ? getPricingFresh(templateType) : getPricing(templateType),
    getPaymentSettings(fresh),
  ]);

  const geo = await resolveViewerCountry(req);
  const currency = currencyForCountry(geo.country, settings.intlPricingEnabled);

  return {
    base,
    pricing: localizePricing(base, currency, settings.inrPerUsd),
    currency,
    country: geo.country,
    geoSource: geo.source,
    inrPerUsd: settings.inrPerUsd,
    intlPricingEnabled: settings.intlPricingEnabled,
    freeForViewer: !base.isFree && isFreeForViewer({ chargeOnlyAbroad: settings.chargeOnlyAbroad, country: geo.country, source: geo.source }),
  };
}
