import mongoose, { Schema, Document } from "mongoose";

export interface IReply {
  body: string;
  sentAt: Date;
  /** Subject it was sent with (absent on replies sent before subjects existed). */
  subject?: string;
  /** Whether the body started as an AI draft. Edited or not, a human sent it. */
  aiAssisted?: boolean;
  sentByEmail?: string;
}

export interface IContactInquiry extends Document {
  name: string;
  email: string;
  phone?: string;
  message: string;
  ipAddress?: string;
  userAgent?: string;
  isRead: boolean;
  adminNotes?: string;
  replies: IReply[];
  createdAt: Date;
  updatedAt: Date;
}

const replySchema = new Schema<IReply>(
  {
    body: { type: String, required: true, maxlength: 4000 },
    sentAt: { type: Date, default: Date.now },
    subject: { type: String, maxlength: 160 },
    aiAssisted: { type: Boolean },
    sentByEmail: { type: String },
  },
  { _id: false }
);

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
    replies: {
      type: [replySchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<IContactInquiry>("ContactInquiry", contactInquirySchema);
