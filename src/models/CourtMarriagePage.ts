import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** One polaroid on the memory lane wall. */
export interface IMemory {
  /**
   * Either a bundled asset path (`/templates/court-marriage/…`) or a base64 data URL the
   * sender uploaded in the EditSheet. Deliberately unbounded — an uploaded photo
   * arrives inline and a maxlength would silently truncate it into a broken image.
   */
  imageUrl: string;
  /** The line written under the polaroid. Kept short — it sits on one or two lines. */
  caption: string;
}

/** Which bundled animation headlines the courtMarriage moment. */
export type HeroArt = "ring" | "rose" | "bouquet";

export interface ICourtMarriagePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** Who is asking. Signs the secret note. */
  senderName: string;
  /** Who is being asked. Drives every second-person line in the template. */
  recipientName: string;
  /** Section 1 — the audio gate. */
  gateTitle: string;
  gateButtonLabel: string;
  /** Section 2 — the scrapbook. */
  memoryLaneTitle: string;
  memories: IMemory[];
  /** Section 3 — the ask. */
  askHeadline: string;
  heroArt: HeroArt;
  yesLabel: string;
  /** Section 4 — the payoff. */
  celebrationTitle: string;
  secretNote: string;
  /**
   * ISO `YYYY-MM-DD` of the day they met. Stored as a string rather than a Date
   * so it round-trips through JSON untouched and never shifts across timezones.
   * Empty string hides the day counter.
   */
  metDate: string;
  /**
   * Optional URL of a track to loop behind the page. Empty string means the
   * template falls back to its built-in WebAudio melody.
   */
  musicUrl: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const memorySchema = new Schema<IMemory>(
  {
    imageUrl: { type: String, default: "" },
    caption: { type: String, default: "", maxlength: 140 },
  },
  { _id: false }
);

const courtMarriagePageSchema = new Schema<ICourtMarriagePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: 80 },
    recipientName: { type: String, default: "", maxlength: 80 },
    gateTitle: { type: String, default: "", maxlength: 160 },
    gateButtonLabel: { type: String, default: "", maxlength: 60 },
    memoryLaneTitle: { type: String, default: "", maxlength: 160 },
    memories: { type: [memorySchema], default: [] },
    askHeadline: { type: String, default: "", maxlength: 200 },
    heroArt: { type: String, enum: ["ring", "rose", "bouquet"], default: "ring" },
    yesLabel: { type: String, default: "", maxlength: 60 },
    celebrationTitle: { type: String, default: "", maxlength: 200 },
    secretNote: { type: String, default: "", maxlength: 3000 },
    metDate: { type: String, default: "", maxlength: 24 },
    musicUrl: { type: String, default: "", maxlength: 2000 },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

courtMarriagePageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

courtMarriagePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<ICourtMarriagePage>("CourtMarriagePage", courtMarriagePageSchema);
