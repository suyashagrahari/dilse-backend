import mongoose, { Schema, Document } from "mongoose";

export interface IPageView extends Document {
  shareId: string;
  templateType: string;
  pageOwnerId?: mongoose.Types.ObjectId;
  visitorIp?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  device?: "mobile" | "desktop" | "tablet";
  createdAt: Date;
}

const pageViewSchema = new Schema<IPageView>(
  {
    shareId: { type: String, required: true, index: true },
    templateType: { type: String, required: true, index: true },
    pageOwnerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    visitorIp: { type: String },
    userAgent: { type: String },
    referer: { type: String },
    country: { type: String },
    device: { type: String, enum: ["mobile", "desktop", "tablet"] },
  },
  { timestamps: true }
);

// Compound indexes for efficient analytics queries
pageViewSchema.index({ createdAt: -1 });
pageViewSchema.index({ templateType: 1, createdAt: -1 });
pageViewSchema.index({ pageOwnerId: 1, createdAt: -1 });

export default mongoose.model<IPageView>("PageView", pageViewSchema);
