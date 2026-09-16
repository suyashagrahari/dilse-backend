import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * There is deliberately no score, no timer and no failure state anywhere in this
 * model — a piece released in the wrong place simply returns to the tray. If a
 * field here starts to look like a counter, the design has gone wrong.
 */
export const PUZZLE_LIMITS = {
  /**
   * Hard ceiling of 16 pieces, mirroring `GRID.maxPieces` on the client. A
   * 24-piece jigsaw on a 380px screen is data entry, not a gift.
   */
  maxPieces: 16,
  minCols: 2,
  maxCols: 6,
  defaultCols: 3,
  minRows: 2,
  maxRows: 6,
  defaultRows: 4,
  /** One line per piece at most; fewer is normal and gets spread out. */
  maxLines: 16,
  /** One note per piece at most; the melody wraps if it is shorter. */
  maxMelodyNotes: 16,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 80,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  url: 2000,
  line: 400,
  finalPieceMessage: 300,
  closingLine: 800,
  password: 128,
  /** Semitone offsets from C4. Two octaves either way is already generous. */
  semitoneMin: -24,
  semitoneMax: 24,
} as const;

export type FinalPieceMode = "auto" | "sender-release";

export interface IPhotoPuzzlePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  recipientName: string;
  /** The image being assembled. */
  imageUrl: string;
  /** Cross-dissolves in on completion. "" skips the reveal entirely. */
  revealImageUrl: string;
  cols: number;
  rows: number;
  /** One line revealed per placed piece, in order. */
  lines: string[];
  /** Semitone offsets from C4, one per piece. Wraps if shorter than the grid. */
  melody: number[];
  finalPieceMode: FinalPieceMode;
  /** Shown while waiting for the sender to release the last piece. */
  finalPieceMessage: string;
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

const photoPuzzlePageSchema = new Schema<IPhotoPuzzlePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: PUZZLE_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: PUZZLE_LIMITS.name },
    imageUrl: { type: String, default: "", maxlength: PUZZLE_LIMITS.url },
    revealImageUrl: { type: String, default: "", maxlength: PUZZLE_LIMITS.url },
    cols: {
      type: Number,
      default: PUZZLE_LIMITS.defaultCols,
      min: PUZZLE_LIMITS.minCols,
      max: PUZZLE_LIMITS.maxCols,
    },
    rows: {
      type: Number,
      default: PUZZLE_LIMITS.defaultRows,
      min: PUZZLE_LIMITS.minRows,
      max: PUZZLE_LIMITS.maxRows,
    },
    lines: { type: [String], default: [] },
    melody: { type: [Number], default: [] },
    finalPieceMode: { type: String, enum: ["auto", "sender-release"], default: "sender-release" },
    finalPieceMessage: { type: String, default: "", maxlength: PUZZLE_LIMITS.finalPieceMessage },
    closingLine: { type: String, default: "", maxlength: PUZZLE_LIMITS.closingLine },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

photoPuzzlePageSchema.pre("save", async function (next) {
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

photoPuzzlePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IPhotoPuzzlePage>("PhotoPuzzlePage", photoPuzzlePageSchema);
