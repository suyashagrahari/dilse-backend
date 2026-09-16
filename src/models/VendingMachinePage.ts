import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/** What a slot dispenses. Mirrors `SlotKind` in the client contract. */
export type SlotKind = "compliment" | "memory" | "voucher" | "empty";
export const SLOT_KINDS: SlotKind[] = ["compliment", "memory", "voucher", "empty"];

/** One tray position on the 3×6 grid. */
export interface ISlot {
  /** "A1".."C6". */
  code: string;
  kind: SlotKind;
  /** Shelf-tag text. The client truncates it for display; the full string lives here. */
  label: string;
  /** The full text revealed on the coupon. */
  payload: string;
  /** In credits. Almost always 1. */
  price: number;
  soldOut: boolean;
  /** Exactly one slot jams. Normalised client-side and re-checked in the controller. */
  sticks: boolean;
}

/**
 * What the recipient typed to earn a credit.
 *
 * PRIVACY — these are personal lines written by someone who never signed up for
 * anything. They belong to the SENDER only. The path is `select: false` so that
 * no query returns it unless it explicitly asks: that includes the FROZEN
 * generic `GET /share/:shareId` dispatcher in `share.controller.ts`, which
 * strips only `password`/`passwordRaw` and would otherwise hand every answer
 * straight back to the next visitor.
 */
export interface ICreditAnswer {
  prompt: string;
  answer: string;
  createdAt: Date;
}

export interface IVendingMachinePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** Stencilled across the machine's header. */
  machineName: string;
  /** Who stocked the machine. */
  senderName: string;
  /** Who is standing in front of it. */
  recipientName: string;
  slots: ISlot[];
  /** Questions the machine asks to earn credit. */
  creditPrompts: string[];
  /** Scrolling LED copy. */
  displayIdleMessages: string[];
  /** Sender-only. `select: false` — see ICreditAnswer. */
  creditAnswers: ICreditAnswer[];
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const slotSchema = new Schema<ISlot>(
  {
    code: { type: String, default: "", maxlength: 4 },
    kind: { type: String, enum: SLOT_KINDS, default: "compliment" },
    label: { type: String, default: "", maxlength: 60 },
    payload: { type: String, default: "", maxlength: 600 },
    price: { type: Number, default: 1, min: 0, max: 9 },
    soldOut: { type: Boolean, default: false },
    sticks: { type: Boolean, default: false },
  },
  { _id: false }
);

const creditAnswerSchema = new Schema<ICreditAnswer>(
  {
    prompt: { type: String, default: "", maxlength: 200 },
    answer: { type: String, default: "", maxlength: 100 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const vendingMachinePageSchema = new Schema<IVendingMachinePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    machineName: { type: String, default: "", maxlength: 60 },
    senderName: { type: String, default: "", maxlength: 80 },
    recipientName: { type: String, default: "", maxlength: 80 },
    slots: { type: [slotSchema], default: [] },
    creditPrompts: { type: [String], default: [] },
    displayIdleMessages: { type: [String], default: [] },
    // Sender-only. Never selected by default — the public reader must not see it.
    creditAnswers: { type: [creditAnswerSchema], default: [], select: false },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

vendingMachinePageSchema.pre("save", async function (next) {
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

vendingMachinePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IVendingMachinePage>("VendingMachinePage", vendingMachinePageSchema);
