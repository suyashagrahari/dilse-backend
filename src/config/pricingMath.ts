// ─── Pricing arithmetic ──────────────────────────────────────────────────────
//
// Pure functions, no database and no Express, because both the publish gate and
// the admin panel's live preview must agree to the rupee and the only way to be
// sure of that is for them to run the same code.
//
// ── WHY THE PRICE IS THE INPUT AND THE MRP IS DERIVED ───────────────────────
//
// The number that has to be exact is the one being charged. Deriving the charge
// from an MRP and a percentage puts rounding in control of what the customer
// pays — which is how the config this replaces ended up advertising "80% off
// ₹499" while charging ₹99, when 499 × 0.20 is ₹99.80. Deriving the MRP instead
// puts the rounding on the strike-through, where nobody is counting.
//
// ── WHY INTEGER PAISE ───────────────────────────────────────────────────────
//
// Razorpay charges in paise, and floats do not add up. `finalPricePaise` is the
// only stored amount; rupees exist for display and are computed at the edges.

/** What a super admin decided, as stored. */
export interface PricingRow {
  slug: string;
  isFree: boolean;
  finalPricePaise: number;
  discountPercent: number;
  pointsCost: number;
  /**
   * The USD price in cents a super admin set for international buyers. Null
   * means "derive it from the INR price" — see `config/currency.ts`.
   */
  usdPriceCents?: number | null;
}

/** What every surface renders — stored values plus everything derived. */
export interface ResolvedPricing {
  slug: string;
  isFree: boolean;
  finalPricePaise: number;
  finalPrice: number;
  mrpPaise: number;
  mrp: number;
  savingsPaise: number;
  savings: number;
  discountPercent: number;
  pointsCost: number;
  /** As set by a super admin; null when it is derived. Always null when free. */
  usdPriceCents: number | null;
}

/**
 * The most a single page may cost: ₹1,00,000.
 *
 * Not a business rule — a typo guard. A super admin who means ₹99 and types the
 * paise gets 9900, and one who fat-fingers a zero onto ₹999 gets ₹9,990. Both
 * are inside this bound and are the super admin's problem. What this stops is
 * the order of magnitude where Razorpay would happily take the money and the
 * only remedy is a refund.
 */
export const MAX_PRICE_PAISE = 10_000_000;

/** Points are a parallel currency; the same reasoning gives them a ceiling. */
export const MAX_POINTS_COST = 1_000_000;

/**
 * USD bounds, in cents. The floor is $1: PayPal alone keeps ~$0.30 + 4.4% of
 * every international payment, so anything cheaper mostly pays fees. The
 * ceiling is the same typo guard as MAX_PRICE_PAISE.
 */
export const MIN_USD_CENTS = 100;
export const MAX_USD_CENTS = 100_000;

const toRupees = (paise: number): number => Math.round(paise) / 100;

/**
 * The MRP implied by a price and a discount.
 *
 * A 100% discount is unrepresentable — it divides by zero — and is rejected by
 * `validatePricingInput` long before it reaches here. The clamp is a second
 * line of defence for a row written before that validation existed, or by hand
 * in the database.
 */
export function deriveMrpPaise(finalPricePaise: number, discountPercent: number): number {
  const price = Math.max(0, Math.round(finalPricePaise));
  const pct = Math.min(Math.max(Math.round(discountPercent) || 0, 0), 99);
  if (pct === 0) return price;

  const mrp = Math.round(price / (1 - pct / 100));

  // Rounding down can never be allowed to put the strike-through below the
  // price being charged — "₹99 ₹100" reads as a price rise. It cannot happen
  // for pct >= 1 and price >= 1, but the floor costs nothing and means the
  // invariant holds for any row, including a hand-edited one.
  return Math.max(mrp, price);
}

export function derivePricing(row: PricingRow): ResolvedPricing {
  // A free template has no price, no MRP and no discount, whatever the row says.
  // Rows can carry stale numbers from before they were switched to free, and a
  // paywall that reads "80% off ₹0" is worse than no paywall.
  if (row.isFree) {
    return {
      slug: row.slug,
      isFree: true,
      finalPricePaise: 0, finalPrice: 0,
      mrpPaise: 0, mrp: 0,
      savingsPaise: 0, savings: 0,
      discountPercent: 0,
      pointsCost: 0,
      usdPriceCents: null,
    };
  }

  const finalPricePaise = Math.max(0, Math.round(row.finalPricePaise) || 0);
  const discountPercent = Math.min(Math.max(Math.round(row.discountPercent) || 0, 0), 99);
  const mrpPaise = deriveMrpPaise(finalPricePaise, discountPercent);
  const savingsPaise = mrpPaise - finalPricePaise;

  return {
    slug: row.slug,
    isFree: false,
    finalPricePaise, finalPrice: toRupees(finalPricePaise),
    mrpPaise, mrp: toRupees(mrpPaise),
    savingsPaise, savings: toRupees(savingsPaise),
    discountPercent,
    pointsCost: Math.max(0, Math.round(row.pointsCost) || 0),
    usdPriceCents:
      typeof row.usdPriceCents === "number" && row.usdPriceCents > 0 ? Math.round(row.usdPriceCents) : null,
  };
}

/** The default for every template nobody has priced. */
export function freePricing(slug: string): ResolvedPricing {
  return derivePricing({ slug, isFree: true, finalPricePaise: 0, discountPercent: 0, pointsCost: 0 });
}

/**
 * A whole, finite number.
 *
 * `Number.isInteger` is the whole check on purpose: it is false for NaN, for
 * both Infinities, and for every string — including `"1000"`, which is what an
 * untyped JSON body is most likely to send. Coercing that string would mean a
 * price arriving as text silently becomes a charge.
 */
const isInt = (v: unknown): v is number => Number.isInteger(v as number);

/**
 * Validate an admin's pricing input. Total, and server-side: the panel's own
 * checks are a convenience for the person typing, not a boundary.
 *
 * Returns a `PricingRow` with an empty `slug` — the caller owns the slug, which
 * comes from the URL and is validated separately.
 */
export function validatePricingInput(
  input: unknown
): { ok: true; value: PricingRow } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Body must be an object" };
  }
  const o = input as Record<string, unknown>;

  if (typeof o.isFree !== "boolean") {
    return { ok: false, error: "isFree must be true or false" };
  }

  if (o.isFree) {
    // Nothing else matters, and requiring a price to declare something free
    // would mean the panel had to invent one.
    return {
      ok: true,
      value: { slug: "", isFree: true, finalPricePaise: 0, discountPercent: 0, pointsCost: 0, usdPriceCents: null },
    };
  }

  if (!isInt(o.finalPricePaise) || o.finalPricePaise < 100) {
    return { ok: false, error: "A paid template needs a whole price of at least ₹1 (100 paise)" };
  }
  if (o.finalPricePaise > MAX_PRICE_PAISE) {
    return {
      ok: false,
      error: `That price is ₹${(o.finalPricePaise / 100).toLocaleString("en-IN")}. The most a page may cost is ₹${(MAX_PRICE_PAISE / 100).toLocaleString("en-IN")} — did you type paise instead of rupees?`,
    };
  }
  if (!isInt(o.discountPercent) || o.discountPercent < 0 || o.discountPercent > 99) {
    return { ok: false, error: "discountPercent must be a whole number from 0 to 99" };
  }

  const pointsCost = o.pointsCost === undefined ? 0 : o.pointsCost;
  if (!isInt(pointsCost) || pointsCost < 0) {
    return { ok: false, error: "pointsCost must be a whole number of 0 or more" };
  }
  if (pointsCost > MAX_POINTS_COST) {
    return { ok: false, error: `pointsCost must be ${MAX_POINTS_COST.toLocaleString("en-IN")} or less` };
  }

  // Optional. Absent or null means "derive from INR"; a number must be whole cents.
  let usdPriceCents: number | null = null;
  if (o.usdPriceCents !== undefined && o.usdPriceCents !== null) {
    if (!isInt(o.usdPriceCents) || o.usdPriceCents < MIN_USD_CENTS || o.usdPriceCents > MAX_USD_CENTS) {
      return {
        ok: false,
        error: `usdPriceCents must be whole cents from ${MIN_USD_CENTS} ($${MIN_USD_CENTS / 100}) to ${MAX_USD_CENTS} ($${MAX_USD_CENTS / 100}), or null to derive it`,
      };
    }
    usdPriceCents = o.usdPriceCents;
  }

  return {
    ok: true,
    value: {
      slug: "",
      isFree: false,
      finalPricePaise: o.finalPricePaise,
      discountPercent: o.discountPercent,
      pointsCost,
      usdPriceCents,
    },
  };
}
