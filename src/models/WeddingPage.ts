import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface IWeddingEvent {
  name: string;
  hindi: string;
  icon: string;
  date: string;
  time: string;
  venue: string;
  accent: string;
}

export interface IWeddingBlessing {
  name: string;
  message: string;
  createdAt: Date;
}

export interface IWeddingPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // Core
  brideName: string;
  groomName: string;
  weddingDate: string;
  venue: string;
  blessing: string;
  // Bride
  bridePhoto: string;
  brideDescription: string;
  brideTags: { emoji: string; label: string }[];
  brideFamilyParents: string;
  brideFamilyGrandparents: string;
  // Groom
  groomPhoto: string;
  groomDescription: string;
  groomTags: { emoji: string; label: string }[];
  groomFamilyParents: string;
  groomFamilyGrandparents: string;
  // Events
  events: IWeddingEvent[];
  // Gallery (up to 6)
  galleryImages: { src: string; alt: string }[];
  // Blessings wall (guests can add)
  blessings: IWeddingBlessing[];
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const weddingEventSchema = new Schema<IWeddingEvent>(
  {
    name: { type: String, default: "" },
    hindi: { type: String, default: "" },
    icon: { type: String, default: "🎊" },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    venue: { type: String, default: "" },
    accent: { type: String, default: "from-amber-500/20 to-amber-600/5 border-amber-500/30" },
  },
  { _id: false }
);

const weddingBlessingSchema = new Schema<IWeddingBlessing>(
  {
    name: { type: String, default: "Guest", trim: true },
    message: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const weddingPageSchema = new Schema<IWeddingPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    // Core
    brideName: { type: String, default: "", trim: true },
    groomName: { type: String, default: "", trim: true },
    weddingDate: { type: String, default: "2026-03-15T11:00:00+05:30" },
    venue: { type: String, default: "India", trim: true },
    blessing: { type: String, default: "ॐ शुभ विवाह", trim: true },
    // Bride
    bridePhoto: { type: String, default: "" },
    brideDescription: { type: String, default: "A soul who paints the world with kindness.", trim: true },
    brideTags: {
      type: [{ emoji: String, label: String }],
      default: [{ emoji: "🎓", label: "Graduate" }, { emoji: "💼", label: "Professional" }],
    },
    brideFamilyParents: { type: String, default: "", trim: true },
    brideFamilyGrandparents: { type: String, default: "", trim: true },
    // Groom
    groomPhoto: { type: String, default: "" },
    groomDescription: { type: String, default: "A gentleman with a golden heart.", trim: true },
    groomTags: {
      type: [{ emoji: String, label: String }],
      default: [{ emoji: "🎓", label: "Graduate" }, { emoji: "💼", label: "Professional" }],
    },
    groomFamilyParents: { type: String, default: "", trim: true },
    groomFamilyGrandparents: { type: String, default: "", trim: true },
    // Events
    events: {
      type: [weddingEventSchema],
      default: [
        { name: "Haldi", hindi: "हल्दी", icon: "🌿", date: "", time: "10 AM", venue: "", accent: "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30" },
        { name: "Mehendi", hindi: "मेहंदी", icon: "🌸", date: "", time: "6 PM", venue: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30" },
        { name: "Sangeet", hindi: "संगीत", icon: "🎶", date: "", time: "7 PM", venue: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30" },
        { name: "Baraat", hindi: "बारात", icon: "🐴", date: "", time: "9 AM", venue: "", accent: "from-rose-500/20 to-rose-500/5 border-rose-500/30" },
        { name: "Wedding", hindi: "विवाह", icon: "🔥", date: "", time: "11 AM", venue: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30" },
        { name: "Reception", hindi: "स्वागत", icon: "💃", date: "", time: "7 PM", venue: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30" },
      ],
    },
    // Gallery
    galleryImages: {
      type: [{ src: String, alt: String }],
      default: [],
    },
    // Blessings
    blessings: {
      type: [weddingBlessingSchema],
      default: [],
    },
    // Security
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

weddingPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = crypto.randomBytes(5).toString("base64url").slice(0, 8);
  }
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

weddingPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IWeddingPage>("WeddingPage", weddingPageSchema);
