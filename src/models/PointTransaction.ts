import mongoose, { Schema, Document } from "mongoose";

export type TransactionType =
  | "referral_signup"   // new user signed up via referral link (+100 to referee)
  | "referral_reward"   // referrer's reward when friend signed up (+100 to referrer)
  | "template_spend"    // deducted when creating a template (future)
  | "purchase"          // bought points via payment (future)
  | "admin_grant";      // manual top-up

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
