import mongoose, { Schema, Document } from "mongoose";
import { HALLOWEEN_SALE_SLUGS, SEASON_MODES, MIN_SALE_PERCENT, MAX_SALE_PERCENT, type SeasonMode } from "../config/seasonSale";

/**
 * The one row of season settings, upserted on `{ key: "global" }`: which
 * seasonal campaign the site shows (Valentine wishlist, Halloween drop, or
 * none) and whether the season's sale discounts real prices.
 *
 * No row means `defaultSeason()` in config/seasonSale.ts — Halloween with 49%
 * off — so a super admin turns the sale off by writing a row.
 */
export interface ISeasonSettings extends Document {
  key: "global";
  mode: SeasonMode;
  saleEnabled: boolean;
  salePercent: number;
  saleSlugs: string[];
  updatedBy?: string;
  updatedAt: Date;
}

const seasonSettingsSchema = new Schema<ISeasonSettings>(
  {
    key: { type: String, enum: ["global"], default: "global", unique: true },
    mode: { type: String, enum: SEASON_MODES as unknown as string[], default: "halloween" },
    saleEnabled: { type: Boolean, default: true },
    salePercent: { type: Number, default: 49, min: MIN_SALE_PERCENT, max: MAX_SALE_PERCENT },
    saleSlugs: { type: [String], default: () => [...HALLOWEEN_SALE_SLUGS] },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ISeasonSettings>("SeasonSettings", seasonSettingsSchema);
