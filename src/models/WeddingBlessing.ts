import mongoose, { Schema, Document } from "mongoose";
import { BLESSING_LIMITS } from "../config/weddingShared";

/**
 * A guest's one-line blessing on a wedding page's blessings wall
 * (config/weddingShared). Public once approved — approved by default; the
 * owner can hide (and re-approve) any of them.
 */
export interface IWeddingBlessing extends Document {
  pageId: mongoose.Types.ObjectId;
  slug: string;
  name: string;
  message: string;
  approved: boolean;
  ipHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const weddingBlessingSchema = new Schema<IWeddingBlessing>(
  {
    pageId: { type: Schema.Types.ObjectId, required: true, index: true },
    slug: { type: String, required: true, maxlength: 60 },
    name: { type: String, required: true, maxlength: BLESSING_LIMITS.name },
    message: { type: String, required: true, maxlength: BLESSING_LIMITS.message },
    approved: { type: Boolean, default: true },
    ipHash: { type: String, default: "", select: false },
  },
  { timestamps: true, collection: "weddingblessings" }
);

weddingBlessingSchema.index({ pageId: 1, approved: 1, createdAt: -1 });

export const WeddingBlessing = mongoose.model<IWeddingBlessing>("WeddingBlessing", weddingBlessingSchema);
export default WeddingBlessing;
