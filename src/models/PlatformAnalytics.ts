import mongoose, { Document, Schema } from "mongoose";

export interface IPlatformAnalytics extends Document {
  key: "global";
  baseSharedLinks: number;
  baseVisitors: number;
  baseInstalls: number;
  createdAt: Date;
  updatedAt: Date;
}

const platformAnalyticsSchema = new Schema<IPlatformAnalytics>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
      enum: ["global"],
    },
    // Seed values requested by product for initial display.
    baseSharedLinks: { type: Number, default: 10000, min: 0 },
    baseVisitors: { type: Number, default: 15000, min: 0 },
    baseInstalls: { type: Number, default: 3000, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IPlatformAnalytics>("PlatformAnalytics", platformAnalyticsSchema);
