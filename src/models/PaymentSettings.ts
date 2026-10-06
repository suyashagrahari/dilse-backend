import mongoose, { Schema, Document } from "mongoose";

/**
 * The one row of admin-tunable payment settings, upserted on `{ key: "global" }`.
 *
 * `intlPricingEnabled` defaults to false: shipping this code changes nothing for
 * buyers until a super admin turns it on, and turning it off is the rollback.
 * Country detection still runs while it is off, so the share of international
 * visitors can be measured before anyone is charged in dollars.
 */
export interface IPaymentSettings extends Document {
  key: "global";
  intlPricingEnabled: boolean;
  /**
   * "Only visitors outside India pay": priced templates publish free for
   * visitors whose country is positively India (config/whoPays.ts). Off by
   * default — everyone pays, exactly as before.
   */
  chargeOnlyAbroad: boolean;
  /** Rupees per US dollar, for derived USD prices and for INR accounting of USD orders. */
  inrPerUsd: number;
  updatedByEmail?: string;
  updatedAt: Date;
}

const paymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    key: { type: String, enum: ["global"], default: "global", unique: true },
    intlPricingEnabled: { type: Boolean, default: false },
    chargeOnlyAbroad: { type: Boolean, default: false },
    inrPerUsd: { type: Number, default: 88, min: 50, max: 200 },
    updatedByEmail: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IPaymentSettings>("PaymentSettings", paymentSettingsSchema);
