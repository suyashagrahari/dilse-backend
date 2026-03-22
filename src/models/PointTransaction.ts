import mongoose, { Schema, Document } from "mongoose";

export type TransactionType =
  | "referral_signup"    // new user signed up via referral link (+100 to referee)
  | "referral_reward"    // referrer's reward when friend signed up (+100 to referrer)
  | "template_spend"     // generic deduction placeholder (legacy)
  | "template_publish"   // deducted when user spends points to publish a premium template
  | "purchase"           // bought points via payment
  | "admin_grant";       // manual top-up by admin

export interface IPointTransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: TransactionType;
  delta: number;
  balance: number;
  meta: Record<string, unknown>;
  createdAt: Date;
}

const pointTransactionSchema = new Schema<IPointTransaction>(
  {
    user:    { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type:    { type: String, required: true },
    delta:   { type: Number, required: true },
    balance: { type: Number, required: true },
    meta:    { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model<IPointTransaction>("PointTransaction", pointTransactionSchema);
