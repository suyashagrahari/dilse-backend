import mongoose, { Schema, Document } from "mongoose";

export interface IGeneratedContent extends Document {
  templateSlug: string;
  prompt: string;
  heading: string;
  body: string;
  senderName: string;
  templateType: string;
  createdAt: Date;
}

const generatedContentSchema = new Schema<IGeneratedContent>(
  {
    templateSlug: {
      type: String,
      required: true,
      index: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    heading: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    senderName: {
      type: String,
      default: "With Love ❤️",
    },
    templateType: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IGeneratedContent>(
  "GeneratedContent",
  generatedContentSchema
);
