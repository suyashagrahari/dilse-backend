import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

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
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

missYouGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IMissYouGfPage>("MissYouGfPage", missYouGfPageSchema);
