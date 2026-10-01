import mongoose, { Schema, Document } from "mongoose";

// One row per (user, campaign): a signed-in user asking to be told when a
// future collection launches — the Valentine's week templates first. The offer
// they were promised is stored on the row, so changing the headline discount
// later never changes what an earlier joiner was told.
// Campaigns a user can join. Unknown keys are refused so the collection can't
// fill up with arbitrary strings from the client.
export const WISHLIST_CAMPAIGNS: Record<string, { label: string; discountPercent: number }> = {
  "valentine-2027": { label: "Valentine's week 2027", discountPercent: 30 },
};

export interface IWishlist extends Document {
  userId: string;
  email?: string;
  campaign: string;
  discountPercent: number;
  source?: string;
  /** E.164, e.g. "+919876543210". Asked for in the join modal. */
  phone?: string;
  /** ISO country the number was entered for, e.g. "IN". */
  phoneCountry?: string;
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
    phone: { type: String, maxlength: 20 },
    phoneCountry: { type: String, maxlength: 2 },
  },
  { timestamps: true }
);

wishlistSchema.index({ userId: 1, campaign: 1 }, { unique: true });
wishlistSchema.index({ campaign: 1, createdAt: 1 });

export default mongoose.model<IWishlist>("Wishlist", wishlistSchema);
