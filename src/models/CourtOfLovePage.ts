import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** One hearing in the trial: the charge, four pleas, and which one the Court accepts. */
export interface IQuizQuestion {
  /** Short label shown above the question, e.g. "Exhibit A". */
  exhibit: string;
  question: string;
  options: string[];
  /** Index into `options` (0-3). */
  correctIndex: number;
  /** Caveat one-liner shown on the reaction screen after a correct answer. */
  correctNote: string;
  /** ...and after a wrong one. */
  wrongNote: string;
  /**
   * When true every option scores — used by the final cross-examination, where
   * "how much do they love you" has no wrong answer.
   */
  allCorrect: boolean;
}

export interface ICourtOfLovePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The one filing the case. */
  plaintiffName: string;
  /** The one standing trial. */
  accusedName: string;
  /** Hero line on the summons screen. */
  headline: string;
  /** The oath the accused swears before the trial begins. */
  oathText: string;
  questions: IQuizQuestion[];
  /** Revealed with a typewriter effect after a winning verdict. */
  secretLetter: string;
  /** Signed at the bottom of the stamp paper. */
  signatureName: string;
  /** Title printed on the certificate. */
  certificateTitle: string;
  /**
   * BCP-47 tag for the language the content is written in ("hi", "hi-Latn",
   * "ur", …). Set when the case was AI-generated from a story; the viewer uses
   * it for the `lang` attribute and to flip to RTL where the script needs it.
   */
  language: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const questionSchema = new Schema<IQuizQuestion>(
  {
    exhibit: { type: String, default: "", maxlength: 60 },
    question: { type: String, default: "", maxlength: 300 },
    options: { type: [String], default: [] },
    correctIndex: { type: Number, default: 0, min: 0, max: 3 },
    correctNote: { type: String, default: "", maxlength: 200 },
    wrongNote: { type: String, default: "", maxlength: 200 },
    allCorrect: { type: Boolean, default: false },
  },
  { _id: false }
);

const courtOfLovePageSchema = new Schema<ICourtOfLovePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    plaintiffName: { type: String, default: "", maxlength: 80 },
    accusedName: { type: String, default: "", maxlength: 80 },
    headline: { type: String, default: "", maxlength: 200 },
    oathText: { type: String, default: "", maxlength: 400 },
    questions: { type: [questionSchema], default: [] },
    secretLetter: { type: String, default: "", maxlength: 3000 },
    signatureName: { type: String, default: "", maxlength: 80 },
    certificateTitle: { type: String, default: "", maxlength: 120 },
    language: { type: String, default: "en", maxlength: 24 },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

courtOfLovePageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

courtOfLovePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<ICourtOfLovePage>("CourtOfLovePage", courtOfLovePageSchema);
