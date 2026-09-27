import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";

/** One of the two people being registered. */
export interface IParty {
  name: string;
  age: number;
  city: string;
}

/** One dot-leader row in the middle of the certificate. */
export interface ICertField {
  label: string;
  value: string;
}

/**
 * A witness slot. `signaturePath` is SVG path data (a 0 0 160 48 viewBox), never
 * an image — the certificate draws it as a stroked <path> so it stays crisp in
 * the PNG export. An empty string means "not yet signed", which the template
 * renders as a blank ruled line.
 */
export interface IWitness {
  name: string;
  signaturePath: string;
}

/**
 * Explicit lifecycle. The witness-signature-collection flow (a `/witness/:token`
 * page that fills the three slots) lands in a later session; keeping this field
 * now means that flow only has to flip the state, not migrate the collection.
 */
export type CertificateState = "draft" | "awaiting_witnesses" | "registered";

export interface ICourtMarriagePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  partyA: IParty;
  partyB: IParty;
  /**
   * The joint photograph. Deliberately unbounded — an uploaded photo arrives as
   * an inline base64 data URL and a maxlength would silently truncate it into a
   * broken image. `null`/"" prints the empty "affix joint photograph" frame.
   */
  photoUrl: string;
  /** e.g. "RH/2026/004402". Also the deterministic seed for the ink jitter. */
  certificateNo: string;
  /** ISO `YYYY-MM-DD`, stored as a string so it never shifts across timezones. */
  registeredOn: string;
  knownSinceDays: number;
  fields: ICertField[];
  witnesses: IWitness[];
  registrarSignaturePath: string;
  objectionCount: number;
  certificateState: CertificateState;
  // Love kit: photos with little letters, GIFs, the main letter, the theme.
  photos: ILovePhoto[];
  gifs: string[];
  letter: string;
  theme: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const partySchema = new Schema<IParty>(
  {
    name: { type: String, default: "", maxlength: 40 },
    age: { type: Number, default: 0, min: 0, max: 120 },
    city: { type: String, default: "", maxlength: 40 },
  },
  { _id: false }
);

const certFieldSchema = new Schema<ICertField>(
  {
    label: { type: String, default: "", maxlength: 40 },
    value: { type: String, default: "", maxlength: 24 },
  },
  { _id: false }
);

const witnessSchema = new Schema<IWitness>(
  {
    name: { type: String, default: "", maxlength: 30 },
    // Path data for a short cursive scrawl; 1200 is far more than any hand needs.
    signaturePath: { type: String, default: "", maxlength: 1200 },
  },
  { _id: false }
);

const courtMarriagePageSchema = new Schema<ICourtMarriagePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    partyA: { type: partySchema, default: () => ({}) },
    partyB: { type: partySchema, default: () => ({}) },
    photoUrl: { type: String, default: "" },
    certificateNo: { type: String, default: "", maxlength: 24 },
    registeredOn: { type: String, default: "", maxlength: 24 },
    knownSinceDays: { type: Number, default: 0, min: 0, max: 100000 },
    fields: { type: [certFieldSchema], default: [] },
    witnesses: { type: [witnessSchema], default: [] },
    registrarSignaturePath: { type: String, default: "", maxlength: 1200 },
    objectionCount: { type: Number, default: 0, min: 0, max: 9999 },
    certificateState: {
      type: String,
      enum: ["draft", "awaiting_witnesses", "registered"],
      default: "registered",
    },
    // Security & meta
    ...loveKitFields,
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

courtMarriagePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ICourtMarriagePage>("CourtMarriagePage", courtMarriagePageSchema);
