// ─── Template pricing ────────────────────────────────────────────────────────
//
// One row per template a super admin has priced. Nothing else.
//
// This is deliberately the same shape as `models/TemplateVisibility.ts`, for the
// same reason: the collection is a list of DECISIONS, not a mirror of the app. A
// template with no row is free, so a fresh database means everything is free —
// which is the safe direction. The alternative, a row per template, means the
// newest template is the one most likely to have no row, and "no row" would then
// have to mean something.
//
// ── WHY `finalPricePaise` AND NOT A PRICE AND AN MRP ────────────────────────
//
// One authoritative amount. The MRP is derived in `config/pricingMath.ts`, so
// there is no second number that can disagree with the first. Storing the MRP
// too is the defect this collection exists to end: the file it replaces held
// originalPrice, discountPercent AND finalPrice, and 499 at 80% off is not 99.
//
// ── WHY NO `environment` FIELD ──────────────────────────────────────────────
//
// Same as TemplateVisibility: staging and production run the same image against
// DIFFERENT databases, so each already has its own copy of this collection. A
// template priced in production is untouched in staging.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplatePricing extends Document {
  slug: string;
  isFree: boolean;
  finalPricePaise: number;
  discountPercent: number;
  pointsCost: number;
  updatedByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const templatePricingSchema = new Schema<ITemplatePricing>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    isFree: { type: Boolean, required: true },
    // Paise, integer. Zero whenever isFree. The schema bounds are a last line of
    // defence behind `validatePricingInput`, which is where a bad price is
    // supposed to be refused with a message a person can act on.
    finalPricePaise: { type: Number, required: true, default: 0, min: 0 },
    discountPercent: { type: Number, required: true, default: 0, min: 0, max: 99 },
    pointsCost:      { type: Number, required: true, default: 0, min: 0 },
    updatedByEmail:  { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplatePricing>("TemplatePricing", templatePricingSchema);
