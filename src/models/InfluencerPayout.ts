import mongoose, { Schema, Document } from "mongoose";

/**
 * Money a super admin sent an influencer outside the app (UPI / bank) and
 * recorded here. Pending = earned − sum of payouts.
 */
export interface IInfluencerPayout extends Document {
  influencerId: mongoose.Types.ObjectId;
  amountPaise: number;
  note?: string;
  paidAt: Date;
  recordedByEmail?: string;
  createdAt: Date;
}

const influencerPayoutSchema = new Schema<IInfluencerPayout>(
  {
    influencerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, maxlength: 200 },
    paidAt: { type: Date, default: Date.now },
    recordedByEmail: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IInfluencerPayout>("InfluencerPayout", influencerPayoutSchema);
