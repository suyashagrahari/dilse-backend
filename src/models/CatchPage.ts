import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * A falling object the recipient can catch. Each one carries exactly one line of
 * the letter, so a caught item ADDS a line and a missed one simply never arrives.
 * There is deliberately no score, no lives and no failure state anywhere in this
 * model — the game is not a gate. If a field here starts to look like a score,
 * the design has gone wrong.
 */
export interface IGoodItem {
  /** Stable client-side id (`g1`, `g2`, …). Used to report which lines were missed. */
  id: string;
  /** An emoji rather than custom art — culturally legible and zero bytes. */
  emoji: string;
  /** "the grey hoodie" — what makes the object specific to them. */
  label: string;
  /** The letter line this object carries. */
  line: string;
}

/** Something to dodge. Petty, never cruel. Carries no text. */
export interface IBadItem {
  id: string;
  emoji: string;
  label: string;
}

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 */
export const CATCH_LIMITS = {
  maxGoodItems: 14,
  maxBadItems: 6,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 80,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  faceUrl: 2000,
  itemId: 40,
  /** Emoji can be multi-codepoint ZWJ sequences — a few chars is not enough. */
  emoji: 32,
  itemLabel: 140,
  itemLine: 600,
  closingLine: 800,
  password: 128,
  durationMinMs: 20000,
  durationMaxMs: 120000,
  durationDefaultMs: 45000,
} as const;

export interface ICatchPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** Who is being written to. Drives every second-person line in the template. */
  recipientName: string;
  /** Who wrote it. Signs off on the closing line. */
  senderName: string;
  /**
   * Their photo, used as the paddle sprite. Always an https URL by the time it
   * is stored — the controller uploads any inline data URL to S3 first. Empty
   * string is normal and supported: the client falls back to an initial.
   */
  faceUrl: string;
  /** 8-14 in practice; hard-capped at 14. Each spawns at most once per run. */
  goodItems: IGoodItem[];
  /** 3-6 in practice; hard-capped at 6. */
  badItems: IBadItem[];
  /** Always shown at the end, caught or not. */
  closingLine: string;
  /** Length of one run. Clamped to 20s-120s here as well as on the client. */
  durationMs: number;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const goodItemSchema = new Schema<IGoodItem>(
  {
    id: { type: String, default: "", maxlength: CATCH_LIMITS.itemId },
    emoji: { type: String, default: "", maxlength: CATCH_LIMITS.emoji },
    label: { type: String, default: "", maxlength: CATCH_LIMITS.itemLabel },
    line: { type: String, default: "", maxlength: CATCH_LIMITS.itemLine },
  },
  { _id: false }
);

const badItemSchema = new Schema<IBadItem>(
  {
    id: { type: String, default: "", maxlength: CATCH_LIMITS.itemId },
    emoji: { type: String, default: "", maxlength: CATCH_LIMITS.emoji },
    label: { type: String, default: "", maxlength: CATCH_LIMITS.itemLabel },
  },
  { _id: false }
);

const catchGamePageSchema = new Schema<ICatchPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    recipientName: { type: String, default: "", maxlength: CATCH_LIMITS.name },
    senderName: { type: String, default: "", maxlength: CATCH_LIMITS.name },
    faceUrl: { type: String, default: "", maxlength: CATCH_LIMITS.faceUrl },
    goodItems: { type: [goodItemSchema], default: [] },
    badItems: { type: [badItemSchema], default: [] },
    closingLine: { type: String, default: "", maxlength: CATCH_LIMITS.closingLine },
    durationMs: {
      type: Number,
      default: CATCH_LIMITS.durationDefaultMs,
      min: CATCH_LIMITS.durationMinMs,
      max: CATCH_LIMITS.durationMaxMs,
    },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

catchGamePageSchema.pre("save", async function (next) {
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

catchGamePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ICatchPage>("CatchPage", catchGamePageSchema);
