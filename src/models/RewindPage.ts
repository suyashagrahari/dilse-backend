import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: `daysTogether`, `winters`, `hours` and every other
 * time-shaped number on screen. They are derived on the client from `startDate`
 * alone. A year-in-review where the sender types "847 days" into a form is a
 * slideshow with big fonts.
 */
export const REWIND_LIMITS = {
  /** The ranked list — the highest-screenshot slide in the deck. */
  maxTopReasons: 5,
  maxStats: 6,
  /** Six questions today; the cap leaves room without inviting a payload. */
  maxAnswers: 12,
  maxPhotos: 8,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 80,
  /** A plain https URL. Uploaded media is turned into one before it gets here. */
  url: 2000,
  /** "2023-06-14". An ISO date, not a timestamp. */
  startDate: 40,
  songTitle: 160,
  songArtist: 160,
  reason: 300,
  statKey: 40,
  statLabel: 160,
  statValue: 40,
  statSub: 300,
  answerKey: 40,
  answerValue: 60,
  closingLine: 800,
  password: 128,
} as const;

/** A sender-authored joke stat. Not time-derived; these are the ones they write. */
export interface IStat {
  key: string;
  label: string;
  value: string;
  sub: string;
}

export interface IRewindPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  senderPhotoUrl: string;
  recipientName: string;
  recipientPhotoUrl: string;
  /** ISO date. EVERY time-based stat on screen derives from this one field. */
  startDate: string;
  songTitle: string;
  songArtist: string;
  /** "" skips the song slide entirely rather than rendering a placeholder. */
  audioUrl: string;
  topReasons: string[];
  stats: IStat[];
  /**
   * Free-form, keyed by question id. Stored as a Map because the key set is
   * owned by the client's QUESTIONS table, not by this schema. The controller
   * converts it back to a plain object on read — `JSON.stringify` of a Map is
   * `{}`, and the client coercer would then see nothing.
   */
  answers: Map<string, string>;
  photos: string[];
  closingLine: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const statSchema = new Schema<IStat>(
  {
    key: { type: String, default: "", maxlength: REWIND_LIMITS.statKey },
    label: { type: String, default: "", maxlength: REWIND_LIMITS.statLabel },
    value: { type: String, default: "", maxlength: REWIND_LIMITS.statValue },
    sub: { type: String, default: "", maxlength: REWIND_LIMITS.statSub },
  },
  { _id: false }
);

const rewindPageSchema = new Schema<IRewindPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: REWIND_LIMITS.name },
    senderPhotoUrl: { type: String, default: "", maxlength: REWIND_LIMITS.url },
    recipientName: { type: String, default: "", maxlength: REWIND_LIMITS.name },
    recipientPhotoUrl: { type: String, default: "", maxlength: REWIND_LIMITS.url },
    startDate: { type: String, default: "", maxlength: REWIND_LIMITS.startDate },
    songTitle: { type: String, default: "", maxlength: REWIND_LIMITS.songTitle },
    songArtist: { type: String, default: "", maxlength: REWIND_LIMITS.songArtist },
    audioUrl: { type: String, default: "", maxlength: REWIND_LIMITS.url },
    topReasons: { type: [String], default: [] },
    stats: { type: [statSchema], default: [] },
    answers: { type: Map, of: String, default: {} },
    photos: { type: [String], default: [] },
    closingLine: { type: String, default: "", maxlength: REWIND_LIMITS.closingLine },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rewindPageSchema.pre("save", async function (next) {
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

rewindPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IRewindPage>("RewindPage", rewindPageSchema);
