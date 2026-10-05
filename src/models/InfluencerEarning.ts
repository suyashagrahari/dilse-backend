import mongoose, { Schema, Document } from "mongoose";

/**
 * One commission, written the moment a referred user's payment is verified.
 *
 * A ledger rather than a figure computed on read: the percentage in force at
 * that moment is copied onto the row, so an admin changing the rate later
 * never rewrites what an influencer has already been shown, and every rupee on
 * a dashboard traces back to exactly one PaymentOrder. The unique index on
 * `paymentOrderId` is what makes a retried verify unable to pay twice.
 */
export interface IInfluencerEarning extends Document {
  influencerId: mongoose.Types.ObjectId;
  referredUserId: mongoose.Types.ObjectId;
  paymentOrderId: mongoose.Types.ObjectId;
  templateType: string;
  pageId: mongoose.Types.ObjectId;
  /** What the referred user paid, in paise. */
  amountPaise: number;
  commissionPercent: number;
  /** Floor of amountPaise × percent / 100 — never rounds in the influencer's favour by a paisa. */
  commissionPaise: number;
  createdAt: Date;
}

const influencerEarningSchema = new Schema<IInfluencerEarning>(
  {
    influencerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referredUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    paymentOrderId: { type: Schema.Types.ObjectId, ref: "PaymentOrder", required: true, unique: true },
    templateType: { type: String, required: true },
    pageId: { type: Schema.Types.ObjectId, required: true },
    amountPaise: { type: Number, required: true, min: 0 },
    commissionPercent: { type: Number, required: true, min: 0, max: 100 },
    commissionPaise: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IInfluencerEarning>("InfluencerEarning", influencerEarningSchema);
