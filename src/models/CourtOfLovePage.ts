import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";

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
  /**
   * The pre-love-kit letter. Superseded by `letter` (the Final Judgement); kept
   * so pages published before the kit still read theirs — the client falls back
   * to it when `letter` is empty.
   */
  secretLetter: string;
  /** Love kit — the Exhibits: framed photos, each with a caption + testimony. */
  photos: ILovePhoto[];
  /** Love kit — up to three GIFs, woven through the evidence and the judgement. */
  gifs: string[];
  /** The Final Judgement — the main letter, read after the gavel. */
  letter: string;
  /** Theme id (supreme | pink | night | parchment); "" = the default. */
  theme: string;
  /** The last question the Court asks before the judgement is unsealed. */
  lockQuestion: string;
  lockAnswer: string;
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
    ...loveKitFields,
    // The judgement replaces `secretLetter`, which allowed 3000 characters —
    // keep that ceiling so an old letter copied across is never rejected.
    letter: { type: String, default: "", maxlength: 3000 },
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

courtOfLovePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ICourtOfLovePage>("CourtOfLovePage", courtOfLovePageSchema);
