import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IShaadiCardEvent {
  name: string;
  hindi: string;
  icon: string;
  date: string;
  time: string;
  venue: string;
  /** Longer copy shown in event detail modal */
  details: string;
  accent: string;
  disabled: boolean;
}

export interface IShaadiCardBlessing {
  name: string;
  message: string;
  /** Optional S3 URL for a guest voice note */
  voiceUrl?: string;
  createdAt: Date;
}

export interface IShaadiCardPage extends Document {
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
  events: IShaadiCardEvent[];
  // Gallery (up to 6)
  galleryImages: { src: string; alt: string }[];
  // Blessings wall (guests can add)
  blessings: IShaadiCardBlessing[];
  sharePhoto: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const shaadiCardEventSchema = new Schema<IShaadiCardEvent>(
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

const shaadiCardBlessingSchema = new Schema<IShaadiCardBlessing>(
  {
    name: { type: String, default: "Guest", trim: true },
    message: { type: String, default: "", trim: true },
    voiceUrl: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const shaadiCardPageSchema = new Schema<IShaadiCardPage>(
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
      type: [shaadiCardEventSchema],
      default: [
        { name: "Haldi", hindi: "हल्दी", icon: "🌿", date: "", time: "10 AM", venue: "", details: "", accent: "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30", disabled: false },
        { name: "Mehendi", hindi: "मेहंदी", icon: "🌸", date: "", time: "6 PM", venue: "", details: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30", disabled: false },
        { name: "Sangeet", hindi: "संगीत", icon: "🎶", date: "", time: "7 PM", venue: "", details: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30", disabled: false },
        { name: "Baraat", hindi: "बारात", icon: "🐴", date: "", time: "9 AM", venue: "", details: "", accent: "from-rose-500/20 to-rose-500/5 border-rose-500/30", disabled: false },
        { name: "Wedding", hindi: "विवाह", icon: "🔥", date: "", time: "11 AM", venue: "", details: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30", disabled: false },
        { name: "Reception", hindi: "स्वागत", icon: "💃", date: "", time: "7 PM", venue: "", details: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30", disabled: false },
      ],
    },
    // Gallery
    galleryImages: {
      type: [{ src: String, alt: String }],
      default: [],
    },
    // Blessings
    blessings: {
      type: [shaadiCardBlessingSchema],
      default: [],
    },
    // Security
    sharePhoto: { type: String, default: "" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

shaadiCardPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = randomUUID();
  }
  if (this.isModified("password") && this.password) {
    // ── Trim before hashing ──────────────────────────────────────────────────
    //
    // Senders type a trailing space constantly — a phone keyboard offers one
    // after every word, and a pasted password brings its own. Every
    // recipient-side viewer trims what it sends. So without this, a page stored
    // with "sunflower " can never be opened by anyone typing "sunflower": the
    // password is correct and the page still will not open, which is exactly
    // what it looked like from the outside.
    //
    // Trimming HERE and not in 43 controllers because this is the one point
    // where a password becomes a hash. Anything that assigns and saves is
    // covered, including paths nobody has written yet.
    const trimmed = this.password.trim();

    if (!trimmed) {
      // Whitespace only is not a password. Hashing "" would leave a page that
      // reports itself protected and opens for nobody.
      this.password = "";
      this.passwordRaw = "";
    } else {
      this.passwordRaw = trimmed;
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(trimmed, salt);
    }
  }
  next();
});

shaadiCardPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) return true;

  // ── THEN EXACTLY AS TYPED, FOR PAGES OLDER THAN THAT FIX ──────────────────
  //
  // A page published before passwords were trimmed hashed the string WITH its
  // whitespace — "sunflower " — because no builder trimmed and every phone
  // keyboard offers a space after a word. Trimming the candidate here is what
  // then took away the only key that opened it: the sender's own password
  // stopped working on their own page, and so did the trimmed version. There
  // was no string the recipient could type.
  //
  // scripts/repair-page-passwords.js re-hashes those rows from `passwordRaw`,
  // but it needs someone to run it against production, and a row whose
  // passwordRaw is missing cannot be repaired at all. This costs one extra
  // comparison and needs nobody to remember anything.
  //
  // Skipped when the two strings are equal, so an ordinary wrong password is
  // still exactly one bcrypt comparison.
  if (raw === trimmed) return false;
  return bcrypt.compare(raw, this.password);
};

export default mongoose.model<IShaadiCardPage>("ShaadiCardPage", shaadiCardPageSchema);
