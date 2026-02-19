import mongoose, { Schema, Document } from "mongoose";

export interface IUserContent extends Document {
  templateSlug: string;
  userId: string;
  heading: string;
  body: string;
  senderName: string;
  createdAt: Date;
  updatedAt: Date;
}

const userContentSchema = new Schema<IUserContent>(
  {
    templateSlug: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      default: "anonymous",
    },
    heading: {
      type: String,
      default: "",
    },
    body: {
      type: String,
      default: "",
    },
    senderName: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

userContentSchema.index({ templateSlug: 1, userId: 1 }, { unique: true });

export default mongoose.model<IUserContent>("UserContent", userContentSchema);
