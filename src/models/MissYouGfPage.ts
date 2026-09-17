import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

export interface IMemory {
  image: string;
  caption: string;
}

export interface IOpenWhenNote {
  label: string;
  text: string;
}

export interface IQuizCard {
  question: string;
  answer: string;
  memory: string;
}

/** Recipient-authored "love map" answers, saved back from the shared page. */
export interface ILoveMap {
  foods: string;
  stress: string;
  dreams: string;
  dates: string;
}

export type DistanceUnit = "km" | "mi";
export type AccentTint = "indigo" | "pink";

export interface IMissYouGfPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  recipientName: string;
  petName: string;
  coverLine: string;
  letterBody: string;
  signature: string;
  yourCity: string;
  theirCity: string;
  reunionDate: string;
  /** ISO — the moment the missing began (last goodbye); powers the count-up timer. */
  sinceDate: string;
  distanceUnit: DistanceUnit;
  memories: IMemory[];
  secret: string;
  openWhen: IOpenWhenNote[];
  quiz: IQuizCard[];
  voiceUrl: string;
  backgroundMusic: string;
  accentTint: AccentTint;
  sharePhoto: string;
  // Recipient engagement (written from the shared page, read by the owner's history)
  hugCount: number;
  lastHugAt?: Date;
  loveMap: ILoveMap;
  loveMapUpdatedAt?: Date;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const missYouGfPageSchema = new Schema<IMissYouGfPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "" },
    recipientName: { type: String, default: "" },
    petName: { type: String, default: "" },
    coverLine: { type: String, default: "" },
    letterBody: { type: String, default: "" },
    signature: { type: String, default: "" },
    yourCity: { type: String, default: "" },
    theirCity: { type: String, default: "" },
    reunionDate: { type: String, default: "" },
    sinceDate: { type: String, default: "" },
    distanceUnit: { type: String, enum: ["km", "mi"], default: "km" },
    memories: {
      type: [
        {
          image: { type: String, default: "" },
          caption: { type: String, default: "" },
        },
      ],
      default: [],
    },
    secret: { type: String, default: "" },
    openWhen: {
      type: [
        {
          label: { type: String, default: "" },
          text: { type: String, default: "" },
        },
      ],
      default: [],
    },
    quiz: {
      type: [
        {
          question: { type: String, default: "" },
          answer: { type: String, default: "" },
          memory: { type: String, default: "" },
        },
      ],
      default: [],
    },
    voiceUrl: { type: String, default: "" },
    backgroundMusic: { type: String, default: "" },
    accentTint: { type: String, enum: ["indigo", "pink"], default: "indigo" },
    sharePhoto: { type: String, default: "" },
    // Recipient engagement
    hugCount: { type: Number, default: 0 },
    lastHugAt: { type: Date },
    loveMap: {
      type: new Schema<ILoveMap>(
        {
          foods: { type: String, default: "" },
          stress: { type: String, default: "" },
          dreams: { type: String, default: "" },
          dates: { type: String, default: "" },
        },
        { _id: false }
      ),
      default: () => ({ foods: "", stress: "", dreams: "", dates: "" }),
    },
    loveMapUpdatedAt: { type: Date },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

missYouGfPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
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

missYouGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) {
    await rememberPagePassword(this, trimmed);
    return true;
  }

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
  if (await bcrypt.compare(raw, this.password)) {
    await rememberPagePassword(this, raw);
    return true;
  }
  return false;
};

export default mongoose.model<IMissYouGfPage>("MissYouGfPage", missYouGfPageSchema);
