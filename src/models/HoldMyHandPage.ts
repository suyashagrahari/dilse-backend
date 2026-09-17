import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/** One line that surfaces once `progressMs` reaches `atMs`. */
export interface IHoldLine {
  /** Milliseconds of accumulated hold at which this line becomes eligible. */
  atMs: number;
  /** The line itself. Short — it sits over the photo for ~2.5s. */
  text: string;
}

/**
 * `kind`  — sincere run. "okay, you can let go now." at the end is honest.
 * `evil`  — the betrayal. The same line is bait; letting go costs 5x drain.
 */
export type HoldMode = "kind" | "evil";

export interface IHoldMyHandPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** Who is asking them to hold on. Signs the letter. */
  senderName: string;
  /** Who is holding. Drives every second-person line. */
  recipientName: string;
  /**
   * The face that comes into focus. Either a bundled asset path
   * (`/templates/hold-my-hand/…`) or a base64 data URL uploaded in the EditSheet.
   * Deliberately uncapped — an uploaded photo arrives inline and a maxlength
   * would silently truncate it into a broken image. Empty string → heart fallback.
   */
  photoUrl: string;
  /** How long they must hold, in ms. Clamped 10s–5min by the controller. */
  durationMs: number;
  mode: HoldMode;
  /** 1 = one finger. 2 = two simultaneous pointers for the whole duration. */
  hands: number;
  /** Timed lines shown during a successful hold. */
  holdLines: IHoldLine[];
  /** Shown on release, indexed by how many times they have let go. */
  releaseLines: string[];
  /** Low-opacity fragments of the letter; one surfaces per 12s of progress. */
  ghostFragments: string[];
  /** The full letter, revealed only at 100%. */
  letter: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const holdLineSchema = new Schema<IHoldLine>(
  {
    atMs: { type: Number, default: 0, min: 0 },
    text: { type: String, default: "", maxlength: 160 },
  },
  { _id: false }
);

const holdMyHandPageSchema = new Schema<IHoldMyHandPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: 80 },
    recipientName: { type: String, default: "", maxlength: 80 },
    photoUrl: { type: String, default: "" },
    durationMs: { type: Number, default: 60000, min: 10000, max: 300000 },
    mode: { type: String, enum: ["kind", "evil"], default: "kind" },
    hands: { type: Number, enum: [1, 2], default: 1 },
    holdLines: { type: [holdLineSchema], default: [] },
    releaseLines: { type: [String], default: [] },
    ghostFragments: { type: [String], default: [] },
    letter: { type: String, default: "", maxlength: 4000 },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

holdMyHandPageSchema.pre("save", async function (next) {
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

holdMyHandPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IHoldMyHandPage>("HoldMyHandPage", holdMyHandPageSchema);
