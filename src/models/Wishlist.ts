import mongoose, { Schema, Document } from "mongoose";

// One row per (user, campaign): a signed-in user asking to be told when a
// future collection launches — the Valentine's week templates first. The offer
// they were promised is stored on the row, so changing the headline discount
// later never changes what an earlier joiner was told.
export interface IWishlist extends Document {
  userId: string;
  email?: string;
  campaign: string;
  discountPercent: number;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlist>(
  {
    userId: { type: String, required: true, index: true },
    email: { type: String },
    campaign: { type: String, required: true, index: true },
    discountPercent: { type: Number, required: true },
    source: { type: String, maxlength: 40 },
  },
  { timestamps: true }
);

wishlistSchema.index({ userId: 1, campaign: 1 }, { unique: true });
wishlistSchema.index({ campaign: 1, createdAt: 1 });

export default mongoose.model<IWishlist>("Wishlist", wishlistSchema);
