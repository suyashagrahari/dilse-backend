import mongoose, { Schema, Document } from "mongoose";

export interface ITemplate extends Document {
  slug: string;
  type: string;
  category: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  previewText: string;
  bodyText: string;
  bgGradient: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    emoji: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    previewText: {
      type: String,
      required: true,
    },
    bodyText: {
      type: String,
      required: true,
    },
    bgGradient: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ITemplate>("Template", templateSchema);
