/**
 * SINGLE SOURCE OF TRUTH for template pricing.
 *
 * Adding a new paid template = one new entry here.
 * All publish gates, payment validation, and analytics read from this.
 */

export interface TemplatePricingConfig {
  templateKey: string;
  name: string;
  isFree: boolean;
  originalPrice: number;       // INR — shown crossed-out on UI
  discountPercent: number;     // e.g. 80 → badge "80% OFF"
  finalPrice: number;          // INR actually charged
  finalPricePaise: number;     // paise (INR × 100) — used by Razorpay API
  pointsCost: number;          // points required as cashless alternative
  allowRePublishFree: boolean; // if true: re-publishing an already-published page is free
}

const FREE: Omit<TemplatePricingConfig, "templateKey" | "name"> = {
  isFree: true,
  originalPrice: 0,
  discountPercent: 0,
  finalPrice: 0,
  finalPricePaise: 0,
  pointsCost: 0,
  allowRePublishFree: true,
};

export const TEMPLATE_PRICING: Record<string, TemplatePricingConfig> = {
  // ── Premium ───────────────────────────────────────────────────────────────
  holi: {
    templateKey: "holi",
    name: "Holi Special",
    isFree: false,
    originalPrice: 499,
    discountPercent: 80,
    finalPrice: 99,
    finalPricePaise: 9900,
    pointsCost: 50,
    allowRePublishFree: true,
  },

  // ── Free / Freemium ───────────────────────────────────────────────────────
  eid:       { templateKey: "eid",       name: "Eid Mubarak",   ...FREE },
  wedding:   { templateKey: "wedding",   name: "Wedding Shaadi", ...FREE },
  reception: { templateKey: "reception", name: "Reception",      ...FREE },
  birthday:  { templateKey: "birthday",  name: "Birthday",       ...FREE },
  valentine: { templateKey: "valentine", name: "Valentine",      ...FREE },
};

/**
 * Returns pricing for the given templateType.
 * Falls back to FREE if templateType is unknown (safe default).
 */
export function getPricing(templateType: string): TemplatePricingConfig {
  return (
    TEMPLATE_PRICING[templateType] ?? {
      templateKey: templateType,
      name: templateType,
      ...FREE,
    }
  );
}
