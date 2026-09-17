import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * One of the two people being matched.
 *
 * `dob` and `tob` are STRINGS, deliberately — the client treats them as
 * timezone-free calendar/clock values (`YYYY-MM-DD` and `HH:mm`) and feeds them
 * verbatim into a deterministic seed. Storing them as `Date` would shift them by
 * the server's UTC offset and silently change every generated report.
 */
export interface IPerson {
  name: string;
  /** ISO `YYYY-MM-DD`. */
  dob: string;
  /** `HH:mm`, 24h. Empty string = time of birth not stated. */
  tob: string;
  /** Free text, decorative. */
  pob: string;
}

/** The eight kootas of Ashtakoota Milan, in canonical order. */
export const KOOTA_NAMES = [
  "varna", "vashya", "tara", "yoni", "grahaMaitri", "gana", "bhakoot", "nadi",
] as const;

export type KootaName = (typeof KOOTA_NAMES)[number];

/**
 * Sender-written one-liners that override the generated reading for a koota.
 * Every key is optional; an absent or empty key means "use the generated line".
 * Modelled as a fixed sub-document rather than a `Map` because `toObject()` on a
 * Mongoose Map yields a real `Map`, which `JSON.stringify` serialises to `{}` —
 * the shared GET would silently drop every custom reading.
 */
export type ICustomReadings = Partial<Record<KootaName, string>>;

export interface IKundliMilanPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // ── Content ───────────────────────────────────────────────────────────────
  groom: IPerson;
  bride: IPerson;
  /** ISO `YYYY-MM-DD`. Fixes the report year; stored as a string, never a Date. */
  issuedOn: string;
  customReadings: ICustomReadings;
  /** 2-4 upayas, rendered verbatim and in order. */
  remedies: string[];
  /** Invented, comic. Never a real astrologer. */
  astrologerName: string;
  // ── Security & meta ───────────────────────────────────────────────────────
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const personSchema = new Schema<IPerson>(
  {
    name: { type: String, default: "", maxlength: 80 },
    dob: { type: String, default: "", maxlength: 24 },
    tob: { type: String, default: "", maxlength: 8 },
    pob: { type: String, default: "", maxlength: 120 },
  },
  { _id: false }
);

const customReadingsSchema = new Schema<ICustomReadings>(
  {
    varna: { type: String, maxlength: 240 },
    vashya: { type: String, maxlength: 240 },
    tara: { type: String, maxlength: 240 },
    yoni: { type: String, maxlength: 240 },
    grahaMaitri: { type: String, maxlength: 240 },
    gana: { type: String, maxlength: 240 },
    bhakoot: { type: String, maxlength: 240 },
    nadi: { type: String, maxlength: 240 },
  },
  { _id: false }
);

const kundliMilanPageSchema = new Schema<IKundliMilanPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    // Content
    groom: { type: personSchema, default: () => ({}) },
    bride: { type: personSchema, default: () => ({}) },
    issuedOn: { type: String, default: "", maxlength: 24 },
    customReadings: { type: customReadingsSchema, default: () => ({}) },
    remedies: { type: [String], default: [] },
    astrologerName: { type: String, default: "", maxlength: 80 },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

kundliMilanPageSchema.pre("save", async function (next) {
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

kundliMilanPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IKundliMilanPage>("KundliMilanPage", kundliMilanPageSchema);
