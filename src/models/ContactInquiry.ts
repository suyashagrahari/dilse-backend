import mongoose, { Schema, Document } from "mongoose";

export interface IContactInquiry extends Document {
  name: string;
  email: string;
  phone?: string;
  message: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactInquirySchema = new Schema<IContactInquiry>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model<IContactInquiry>("ContactInquiry", contactInquirySchema);
