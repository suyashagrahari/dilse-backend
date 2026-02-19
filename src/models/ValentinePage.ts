import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface IValentinePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  recipientName: string;
  senderName: string;
  personalMessage: string;
  promises: string[];
  photos: string[];
  theme: "romantic" | "elegant" | "playful";
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const valentinePageSchema = new Schema<IValentinePage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    recipientName: { type: String, required: true, trim: true },
    senderName: { type: String, default: "Your Love ❤️", trim: true },
    personalMessage: { type: String, default: "" },
    promises: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    theme: {
      type: String,
      enum: ["romantic", "elegant", "playful"],
      default: "romantic",
    },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

valentinePageSchema.pre("save", function (next) {
  if (!this.shareId) {
    this.shareId = crypto.randomBytes(5).toString("base64url").slice(0, 8);
  }
  next();
});

export default mongoose.model<IValentinePage>("ValentinePage", valentinePageSchema);
