import mongoose, { Schema, Document } from "mongoose";

/**
 * The one row of admin-tunable influencer programme settings. Keyed by a fixed
 * `key` so "the settings" is an upsert on `{ key: "global" }`, never a guess at
 * which of several rows is current.
 */
export interface IInfluencerSettings extends Document {
  key: "global";
  /** Commission on what a referred user actually paid, 0–100. */
  defaultCommissionPercent: number;
  /** How long a click is remembered before the visitor signs up. */
  attributionDays: number;
  updatedByEmail?: string;
  updatedAt: Date;
}

const influencerSettingsSchema = new Schema<IInfluencerSettings>(
  {
    key: { type: String, enum: ["global"], default: "global", unique: true },
    defaultCommissionPercent: { type: Number, min: 0, max: 100, default: 30 },
    attributionDays: { type: Number, min: 1, max: 365, default: 60 },
    updatedByEmail: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IInfluencerSettings>("InfluencerSettings", influencerSettingsSchema);
