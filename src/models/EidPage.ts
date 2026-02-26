import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IEidPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // Sender info
  senderName: string;
  senderFamily: string;
  senderMembers: { name: string; relation: string }[];
  senderPhoto: string;
  // Recipient
  recipientName: string;
  // Wish messages
  homeWishMessage: string;
  congratsMessage: string;
  // Display
  urduTitle: string;
  urduSubtitle: string;
  englishSubtitle: string;
  eidDate: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const eidPageSchema = new Schema<IEidPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", trim: true },
    senderFamily: { type: String, default: "Family", trim: true },
    senderMembers: {
      type: [{ name: String, relation: String }],
      default: [],
    },
    senderPhoto: { type: String, default: "" },
    recipientName: { type: String, default: "", trim: true },
    homeWishMessage: {
      type: String,
      default:
        "Every moment we share becomes a treasure I hold close to my heart. Thank you for being the reason I smile every single day. May this Eid fill your heart with pure joy and boundless happiness.",
    },
    congratsMessage: {
      type: String,
      default:
        "Wishing you and your family a very blessed Eid! May this Eid bring joy, happiness, and prosperity to your life. Eid Mubarak from our family to yours!",
    },
    urduTitle: { type: String, default: "عید مبارک" },
    urduSubtitle: {
      type: String,
      default: "آپ کو اور آپ کے خاندان کو عید الفطر مبارک ہو",
    },
    englishSubtitle: {
      type: String,
      default: "Wishing you joy, peace, and countless blessings this Eid",
    },
    eidDate: { type: String, default: "2026-03-20T00:00:00" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

eidPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = randomUUID();
  }
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

eidPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IEidPage>("EidPage", eidPageSchema);
