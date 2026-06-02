import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** Same shape as Shaadi events (hindi kept for shared frontend schema). */
export interface IChristianWeddingEvent {
  name: string;
  hindi: string;
  icon: string;
  date: string;
  time: string;
  venue: string;
  details: string;
  accent: string;
  disabled: boolean;
}

export interface IChristianWeddingBlessing {
  name: string;
  message: string;
  voiceUrl?: string;
  createdAt: Date;
}

export interface IChristianWeddingPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  brideName: string;
  groomName: string;
  weddingDate: string;
  venue: string;
  blessing: string;
  bridePhoto: string;
  brideDescription: string;
  brideTags: { emoji: string; label: string }[];
  brideFamilyParents: string;
  brideFamilyGrandparents: string;
  groomPhoto: string;
  groomDescription: string;
  groomTags: { emoji: string; label: string }[];
  groomFamilyParents: string;
  groomFamilyGrandparents: string;
  events: IChristianWeddingEvent[];
  galleryImages: { src: string; alt: string }[];
  blessings: IChristianWeddingBlessing[];
  sharePhoto: string;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  templateVariant: "tabs" | "scroll";
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const christianWeddingEventSchema = new Schema<IChristianWeddingEvent>(
  {
    name: { type: String, default: "" },
    hindi: { type: String, default: "" },
    icon: { type: String, default: "🎊" },
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    venue: { type: String, default: "" },
    details: { type: String, default: "", trim: true },
    accent: { type: String, default: "from-amber-500/20 to-amber-600/5 border-amber-500/30" },
    disabled: { type: Boolean, default: false },
  },
  { _id: false }
);

const christianWeddingBlessingSchema = new Schema<IChristianWeddingBlessing>(
  {
    name: { type: String, default: "Guest", trim: true },
    message: { type: String, default: "", trim: true },
    voiceUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const christianWeddingPageSchema = new Schema<IChristianWeddingPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    brideName: { type: String, default: "", trim: true },
    groomName: { type: String, default: "", trim: true },
    weddingDate: { type: String, default: "2026-07-22T19:00:00+00:00" },
    venue: { type: String, default: "", trim: true },
    blessing: { type: String, default: "God bless this union", trim: true },
    bridePhoto: { type: String, default: "" },
    brideDescription: { type: String, default: "A heart full of grace and joy.", trim: true },
    brideTags: {
      type: [{ emoji: String, label: String }],
      default: [{ emoji: "✝️", label: "Faith" }, { emoji: "📖", label: "Kind" }],
    },
    brideFamilyParents: { type: String, default: "", trim: true },
    brideFamilyGrandparents: { type: String, default: "", trim: true },
    groomPhoto: { type: String, default: "" },
    groomDescription: { type: String, default: "A gentleman of kindness and faith.", trim: true },
    groomTags: {
      type: [{ emoji: String, label: String }],
      default: [{ emoji: "🎓", label: "Graduate" }, { emoji: "💼", label: "Professional" }],
    },
    groomFamilyParents: { type: String, default: "", trim: true },
    groomFamilyGrandparents: { type: String, default: "", trim: true },
    events: {
      type: [christianWeddingEventSchema],
      default: [
        { name: "Rehearsal Dinner", hindi: "", icon: "🍽️", date: "", time: "6 PM", venue: "", details: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30", disabled: false },
        { name: "Ceremony", hindi: "", icon: "⛪", date: "", time: "4 PM", venue: "", details: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30", disabled: false },
        { name: "Reception", hindi: "", icon: "🥂", date: "", time: "7 PM", venue: "", details: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30", disabled: false },
        { name: "Brunch", hindi: "", icon: "☕", date: "", time: "10 AM", venue: "", details: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30", disabled: true },
        { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
        { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
      ],
    },
    galleryImages: {
      type: [{ src: String, alt: String }],
      default: [],
    },
    blessings: {
      type: [christianWeddingBlessingSchema],
      default: [],
    },
    sharePhoto: { type: String, default: "" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
    templateVariant: { type: String, enum: ["tabs", "scroll"], default: "tabs" },
  },
  { timestamps: true, collection: "christian_wedding_pages" }
);

christianWeddingPageSchema.pre("save", async function (next) {
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

christianWeddingPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IChristianWeddingPage>("ChristianWeddingPage", christianWeddingPageSchema);
