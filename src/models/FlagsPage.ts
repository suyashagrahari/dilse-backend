import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** LEFT = red flag, RIGHT = green flag, UP = it's complicated. */
export type SwipeChoice = "red" | "green" | "complicated";
export const SWIPE_CHOICES: SwipeChoice[] = ["red", "green", "complicated"];

/** 'sincere' cards are drag-locked in the viewer and break the comedy rhythm. */
export type CardKind = "flag" | "sincere";
export const CARD_KINDS: CardKind[] = ["flag", "sincere"];

/**
 * One authored response per swipe direction.
 *
 * This is the whole mechanic: the direction the recipient swipes selects which
 * of these three strings is revealed on the flip. Modelled as a fixed nested
 * schema rather than a Map so the three paths are guaranteed to exist on every
 * card — a missing key would flip to a blank card back and read as a bug.
 * Empty strings are legal (a `sincere` card has no comeback for any direction).
 */
export interface IFlagResponses {
  red: string;
  green: string;
  complicated: string;
}

export interface IFlagCard {
  /** Stable client-side id. Used to key swipe results back to the card. */
  id: string;
  /** About the SENDER. Hard-capped at 70 chars so it never wraps off the card. */
  statement: string;
  responses: IFlagResponses;
  /** The sender's actual verdict. Drives the "HE SAYS" strip and OVERRULED. */
  truth: SwipeChoice;
  kind: CardKind;
}

/** The profile header the deck is judging. */
export interface IFlagsSender {
  name: string;
  age: number;
  /**
   * Either an https URL or an inline base64 data URL uploaded in the EditSheet.
   * Deliberately uncapped — a maxlength would silently truncate a data URL into
   * a broken image. Empty string means the viewer draws its initials fallback.
   */
  photoUrl: string;
  tagline: string;
}

export interface IFlagsPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // ── Content ──────────────────────────────────────────────────────────────
  sender: IFlagsSender;
  recipientName: string;
  cards: IFlagCard[];
  /** The closing sentence. Not a game. */
  finalCard: string;
  // ── Security & meta ──────────────────────────────────────────────────────
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

// Field caps. Exported so the controller sanitiser and the schema validators
// can never drift apart.
export const FLAGS_LIMITS = {
  senderName: 80,
  senderTagline: 240,
  recipientName: 80,
  cardId: 64,
  /** The spec's hard limit — the card is a fixed-width artifact. */
  statement: 70,
  response: 400,
  /**
   * The stored value is always an S3 URL — an inline `data:` upload is pushed
   * to the bucket by the controller before it reaches the document, so this
   * can be capped. Storing base64 here would bloat both the document and every
   * shared-page response.
   */
  photoUrl: 2000,
  finalCard: 1000,
  password: 128,
  maxCards: 24,
  minAge: 13,
  maxAge: 120,
} as const;

const responsesSchema = new Schema<IFlagResponses>(
  {
    red: { type: String, default: "", maxlength: FLAGS_LIMITS.response },
    green: { type: String, default: "", maxlength: FLAGS_LIMITS.response },
    complicated: { type: String, default: "", maxlength: FLAGS_LIMITS.response },
  },
  { _id: false }
);

const cardSchema = new Schema<IFlagCard>(
  {
    id: { type: String, default: "", maxlength: FLAGS_LIMITS.cardId },
    statement: { type: String, default: "", maxlength: FLAGS_LIMITS.statement },
    responses: {
      type: responsesSchema,
      required: true,
      default: () => ({ red: "", green: "", complicated: "" }),
    },
    truth: { type: String, enum: SWIPE_CHOICES, default: "red" },
    kind: { type: String, enum: CARD_KINDS, default: "flag" },
  },
  { _id: false }
);

const senderSchema = new Schema<IFlagsSender>(
  {
    name: { type: String, default: "", maxlength: FLAGS_LIMITS.senderName },
    age: { type: Number, default: FLAGS_LIMITS.minAge, min: FLAGS_LIMITS.minAge, max: FLAGS_LIMITS.maxAge },
    photoUrl: { type: String, default: "", maxlength: FLAGS_LIMITS.photoUrl },
    tagline: { type: String, default: "", maxlength: FLAGS_LIMITS.senderTagline },
  },
  { _id: false }
);

const flagsPageSchema = new Schema<IFlagsPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    // Content
    sender: {
      type: senderSchema,
      required: true,
      default: () => ({ name: "", age: FLAGS_LIMITS.minAge, photoUrl: "", tagline: "" }),
    },
    recipientName: { type: String, default: "", maxlength: FLAGS_LIMITS.recipientName },
    cards: { type: [cardSchema], default: [] },
    finalCard: { type: String, default: "", maxlength: FLAGS_LIMITS.finalCard },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

flagsPageSchema.pre("save", async function (next) {
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

flagsPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IFlagsPage>("FlagsPage", flagsPageSchema);
