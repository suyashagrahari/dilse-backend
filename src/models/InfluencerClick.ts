import mongoose, { Schema, Document } from "mongoose";

/** Link opens per influencer per UTC day — a counter, not a row per visit. */
export interface IInfluencerClick extends Document {
  influencerId: mongoose.Types.ObjectId;
  /** YYYY-MM-DD (UTC). */
  day: string;
  count: number;
}

const influencerClickSchema = new Schema<IInfluencerClick>({
  influencerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
});

influencerClickSchema.index({ influencerId: 1, day: 1 }, { unique: true });

export default mongoose.model<IInfluencerClick>("InfluencerClick", influencerClickSchema);
