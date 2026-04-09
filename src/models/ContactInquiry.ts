import mongoose, { Schema, Document } from "mongoose";

export interface IContactInquiry extends Document {
  name: string;
  email: string;
  phone?: string;
  message: string;
  ipAddress?: string;
  userAgent?: string;
  isRead: boolean;
  adminNotes?: string;
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
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IContactInquiry>("ContactInquiry", contactInquirySchema);
