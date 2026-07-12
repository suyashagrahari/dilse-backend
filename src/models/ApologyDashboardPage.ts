import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IBriberyItem {
  icon: string;
  label: string;
}

export interface ITimelineItem {
  icon: string;
  title: string;
  text: string;
}

export interface IApologyDashboardPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  recipientName: string;
  relationship: string;
  headline: string;
  subMessage: string;
  sorryLetter: string;
  senderPhoto: string;
  whackFaces: string[];
  voiceUrl: string;
  scratchSecret: string;
  scratchImages: string[];
  scratchVoice: string;
  briberyItems: IBriberyItem[];
  timeline: ITimelineItem[];
  deliveryEmail: string;
  sharePhoto: string;
  backgroundMusic: string;
  // Signing record
  signed: boolean;
  signedAt: Date;
  signerName: string;
  signerEmail: string;
  signatureImage: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const apologyDashboardPageSchema = new Schema<IApologyDashboardPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "" },
    recipientName: { type: String, default: "" },
    relationship: { type: String, default: "girlfriend" },
    headline: { type: String, default: "" },
    subMessage: { type: String, default: "" },
    sorryLetter: { type: String, default: "" },
    senderPhoto: { type: String, default: "" },
    whackFaces: { type: [String], default: [] },
    voiceUrl: { type: String, default: "" },
    scratchSecret: { type: String, default: "" },
    scratchImages: { type: [String], default: [] },
    scratchVoice: { type: String, default: "" },
    briberyItems: {
      type: [
        {
          icon: { type: String, default: "" },
          label: { type: String, default: "" },
        },
      ],
      default: [],
    },
    timeline: {
      type: [
        {
          icon: { type: String, default: "" },
          title: { type: String, default: "" },
          text: { type: String, default: "" },
        },
      ],
      default: [],
    },
    deliveryEmail: { type: String, default: "" },
    sharePhoto: { type: String, default: "" },
    backgroundMusic: { type: String, default: "" },
    // Signing record
    signed: { type: Boolean, default: false },
    signedAt: { type: Date },
    signerName: { type: String, default: "" },
    signerEmail: { type: String, default: "" },
    signatureImage: { type: String, default: "" },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

apologyDashboardPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

apologyDashboardPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IApologyDashboardPage>("ApologyDashboardPage", apologyDashboardPageSchema);
