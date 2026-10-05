// ─── Currency: which one a buyer pays in, and how much ───────────────────────
//
// Pure functions, no database and no Express. The quote shown in the paywall
// and the amount on the Razorpay order are computed by the SAME function from
// the same inputs, so they cannot disagree by a cent.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
//   India, or country unknown  → INR (UPI, Indian cards, netbanking)
//   anywhere else              → USD (Razorpay shows PayPal for non-INR orders)
//
// …and only while a super admin has switched international pricing on. Off,
// everybody pays INR exactly as before — the switch is the rollback.
//
// "Unknown" means INR on purpose: most buyers are Indian, and an INR checkout a
// foreigner cannot complete is a lost sale, whereas a USD checkout an Indian
// cannot complete (no PayPal) is a lost sale AND a confused customer.
//
// ── WHY VPNs NEED NO SPECIAL HANDLING ───────────────────────────────────────
//
// The payment instrument enforces the rule. An Indian on a US VPN is quoted USD
// and pays MORE (through PayPal) — their loss, not ours. A foreigner on an
// Indian VPN is quoted INR, but an INR checkout only accepts UPI and Indian
// cards (international cards are not enabled on the account), so the cheaper
// price is not reachable with a foreign instrument.
//
// ── UNITS ───────────────────────────────────────────────────────────────────
//
// Every amount is an integer in the currency's minor unit: paise for INR,
// cents for USD. That is what Razorpay takes, and floats do not add up.

import { deriveMrpPaise, type ResolvedPricing } from "./pricingMath";

export type Currency = "INR" | "USD";
export const CURRENCIES: readonly Currency[] = ["INR", "USD"] as const;

export function isCurrency(v: unknown): v is Currency {
  return v === "INR" || v === "USD";
}

/** ISO-3166 alpha-2, upper-case, or null when it is not one. */
export function normalizeCountry(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  // "XX"/"T1" are what CDNs send for unknown/Tor; "EU"/"AP" are continent
  // placeholders some databases return. None of them is a country.
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1" || c === "EU" || c === "AP" || c === "ZZ") return null;
  return c;
}

export function currencyForCountry(country: string | null, intlPricingEnabled: boolean): Currency {
  if (!intlPricingEnabled) return "INR";
  if (!country || country === "IN") return "INR";
  return "USD";
}

/** Bounds for the INR-per-USD conversion rate a super admin may set. */
export const MIN_INR_PER_USD = 50;
export const MAX_INR_PER_USD = 200;
export const DEFAULT_INR_PER_USD = 88;
export const MIN_DERIVED_USD_CENTS = 199;

/**
 * The USD price for a template that has no USD price of its own.
 *
 * Converted at the admin's rate and rounded UP to the next ".99" — ₹149 at 88
 * is $1.69, which reads as an accident; $1.99 reads as a price. Never below
 * $1.99: Razorpay's floor is $1.00, and PayPal keeps ~$0.30 + 4.4% of every
 * international sale, so a cheaper derived price would mostly pay fees. Rounding up rather than to nearest keeps the international price at or
 * above the Indian one after PayPal's fees, which is the direction that does
 * not lose money.
 */
export function deriveUsdCents(inrPaise: number, inrPerUsd: number): number {
  const rate = Number.isFinite(inrPerUsd) && inrPerUsd > 0 ? inrPerUsd : DEFAULT_INR_PER_USD;
  const cents = Math.ceil(Math.max(0, inrPaise) / rate - 1e-9);
  // The smallest X.99 that is >= the converted amount: 169¢ → 199¢, 199¢ → 199¢, 200¢ → 299¢.
  return Math.max(MIN_DERIVED_USD_CENTS, Math.ceil((cents + 1) / 100) * 100 - 1);
}

/** What the paywall shows and what the order charges, in one currency. */
export interface LocalizedPricing {
  slug: string;
  isFree: boolean;
  currency: Currency;
  /** Minor units (paise / cents). */
  finalAmount: number;
  mrpAmount: number;
  savingsAmount: number;
  discountPercent: number;
  pointsCost: number;
  /** For USD: whether the price was set by an admin or derived from INR. */
  source: "inr" | "usd_set" | "usd_derived";
}

export function localizePricing(pricing: ResolvedPricing, currency: Currency, inrPerUsd: number): LocalizedPricing {
  const base = {
    slug: pricing.slug,
    isFree: pricing.isFree,
    discountPercent: pricing.discountPercent,
    pointsCost: pricing.pointsCost,
  };
  if (pricing.isFree) {
    return { ...base, currency, finalAmount: 0, mrpAmount: 0, savingsAmount: 0, source: currency === "INR" ? "inr" : "usd_derived" };
  }
  if (currency === "INR") {
    return {
      ...base,
      currency,
      finalAmount: pricing.finalPricePaise,
      mrpAmount: pricing.mrpPaise,
      savingsAmount: pricing.savingsPaise,
      source: "inr",
    };
  }
  const set = typeof pricing.usdPriceCents === "number" && pricing.usdPriceCents > 0;
  const finalAmount = set ? Math.round(pricing.usdPriceCents as number) : deriveUsdCents(pricing.finalPricePaise, inrPerUsd);
  // Same discount presentation as INR: the strike-through is derived from the
  // charged amount, never the other way round (see pricingMath.ts).
  const mrpAmount = deriveMrpPaise(finalAmount, pricing.discountPercent);
  return {
    ...base,
    currency,
    finalAmount,
    mrpAmount,
    savingsAmount: mrpAmount - finalAmount,
    source: set ? "usd_set" : "usd_derived",
  };
}

/**
 * An amount's value in INR paise, for accounting (revenue totals, influencer
 * commission). Uses the rate recorded on the order, never today's rate, so a
 * report from March says the same thing in October.
 */
export function toInrPaise(amount: number, currency: Currency, inrPerUsd: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === "INR") return Math.round(amount);
  // cents × (₹ per $) = paise: $1.99 = 199¢ → 199 × 88 = 17,512 paise = ₹175.12
  return Math.round(amount * inrPerUsd);
}

/** "₹149" / "$1.99" — for server-side messages only; clients format for themselves. */
export function formatMoney(amount: number, currency: Currency): string {
  const major = amount / 100;
  return currency === "INR"
    ? "₹" + major.toLocaleString("en-IN", { maximumFractionDigits: 2 })
    : "$" + major.toFixed(2);
}

/**
 * An order's value in INR paise. Prefers the amount frozen on the order at
 * creation; an order from before multi-currency has none, and was always INR.
 */
export function orderInrPaise(order: { amount?: number; currency?: string; amountInrPaise?: number | null }): number {
  if (typeof order.amountInrPaise === "number") return order.amountInrPaise;
  return (order.currency || "INR") === "INR" ? Math.max(0, order.amount || 0) : 0;
}
