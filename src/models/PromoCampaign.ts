import mongoose, { Schema, Document } from "mongoose";
import type { PromoStyle } from "../config/promoMath";

// The countdown sale on a wishlist campaign: one row per wishlist campaign key
// ("valentine-2027"), written only by a super admin. The discount itself is NOT
// stored here — it is the wishlist campaign's, and is stamped on every join row
// (models/Wishlist.ts), so the banner can never advertise a number the join
// does not honour.
//
// Like TemplatePricing, there is no `environment` field: staging and production
// have separate databases, so a sale started on staging never shows on prod.

export interface IPromoCampaign extends Document {
  campaign: string;
  enabled: boolean;
  startedAt?: Date | null;
  endsAt?: Date | null;
  durationHours: number;
  style: PromoStyle;
  /** 1 for the first countdown, 2 for the first restart, and so on. */
  runNumber: number;
  updatedByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const promoCampaignSchema = new Schema<IPromoCampaign>(
  {
    campaign: { type: String, required: true, unique: true },
    enabled: { type: Boolean, required: true, default: false },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    durationHours: { type: Number, default: 240, min: 1 },
    style: { type: String, enum: ["sale", "last-chance", "extended"], default: "sale" },
    runNumber: { type: Number, default: 0, min: 0 },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IPromoCampaign>("PromoCampaign", promoCampaignSchema);
