import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 */
export const LOVEFLIX_LIMITS = {
  maxRows: 6,
  maxRowItems: 12,
  maxScenes: 24,
  /** Exactly 2 on a non-finale scene; the extras are dropped. */
  maxChoices: 2,
  maxCredits: 12,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 80,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  url: 2000,
  showTitle: 80,
  tagline: 400,
  rating: 120,
  seasons: 60,
  metYear: 12,
  rowTitle: 120,
  itemTitle: 120,
  caption: 300,
  runtime: 24,
  sceneId: 60,
  sceneText: 2000,
  choiceLabel: 160,
  finaleText: 2000,
  finaleQuestion: 200,
  creditRole: 80,
  creditName: 120,
  password: 128,
  matchPercentMin: 1,
  matchPercentMax: 100,
  matchPercentDefault: 99,
  progressMin: 0,
  progressMax: 100,
  choiceSecondsMin: 4,
  choiceSecondsMax: 60,
  choiceSecondsDefault: 10,
  defaultChoiceIndexMin: 0,
  defaultChoiceIndexMax: 1,
} as const;

export type RowKind = "cards" | "top10";

export interface IRowItem {
  title: string;
  imageUrl: string;
  caption: string;
  runtime: string;
  /** 0-100. Renders a thin accent bar across the card bottom. 0 hides it. */
  progress: number;
}

export interface IRow {
  title: string;
  kind: RowKind;
  items: IRowItem[];
}

export interface IChoice {
  label: string;
  nextSceneId: string;
}

export interface IScene {
  id: string;
  imageUrl: string;
  /** Narration, revealed line by line. Split on newlines by the renderer. */
  text: string;
  choices: IChoice[];
  choiceSeconds: number;
  /** Used when the timer runs out. Timing out is a joke, never a failure. */
  defaultChoiceIndex: number;
  isFinale: boolean;
}

export interface ICredit {
  role: string;
  name: string;
}

export interface ILoveflixPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  senderPhotoUrl: string;
  recipientName: string;
  recipientPhotoUrl: string;
  showTitle: string;
  tagline: string;
  heroImageUrl: string;
  /** Rendered as "99% Match" in the accent colour. */
  matchPercent: number;
  rating: string;
  seasons: string;
  metYear: string;
  rows: IRow[];
  scenes: IScene[];
  startSceneId: string;
  finaleText: string;
  finaleQuestion: string;
  credits: ICredit[];
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const rowItemSchema = new Schema<IRowItem>(
  {
    title: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.itemTitle },
    imageUrl: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.url },
    caption: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.caption },
    runtime: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.runtime },
    progress: {
      type: Number,
      default: 0,
      min: LOVEFLIX_LIMITS.progressMin,
      max: LOVEFLIX_LIMITS.progressMax,
    },
  },
  { _id: false }
);

const rowSchema = new Schema<IRow>(
  {
    title: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.rowTitle },
    kind: { type: String, enum: ["cards", "top10"], default: "cards" },
    items: { type: [rowItemSchema], default: [] },
  },
  { _id: false }
);

const choiceSchema = new Schema<IChoice>(
  {
    label: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.choiceLabel },
    nextSceneId: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.sceneId },
  },
  { _id: false }
);

const sceneSchema = new Schema<IScene>(
  {
    id: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.sceneId },
    imageUrl: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.url },
    text: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.sceneText },
    choices: { type: [choiceSchema], default: [] },
    choiceSeconds: {
      type: Number,
      default: LOVEFLIX_LIMITS.choiceSecondsDefault,
      min: LOVEFLIX_LIMITS.choiceSecondsMin,
      max: LOVEFLIX_LIMITS.choiceSecondsMax,
    },
    defaultChoiceIndex: {
      type: Number,
      default: LOVEFLIX_LIMITS.defaultChoiceIndexMin,
      min: LOVEFLIX_LIMITS.defaultChoiceIndexMin,
      max: LOVEFLIX_LIMITS.defaultChoiceIndexMax,
    },
    isFinale: { type: Boolean, default: false },
  },
  { _id: false }
);

const creditSchema = new Schema<ICredit>(
  {
    role: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.creditRole },
    name: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.creditName },
  },
  { _id: false }
);

const loveflixPageSchema = new Schema<ILoveflixPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.name },
    senderPhotoUrl: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.url },
    recipientName: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.name },
    recipientPhotoUrl: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.url },
    showTitle: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.showTitle },
    tagline: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.tagline },
    heroImageUrl: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.url },
    matchPercent: {
      type: Number,
      default: LOVEFLIX_LIMITS.matchPercentDefault,
      min: LOVEFLIX_LIMITS.matchPercentMin,
      max: LOVEFLIX_LIMITS.matchPercentMax,
    },
    rating: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.rating },
    seasons: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.seasons },
    metYear: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.metYear },
    rows: { type: [rowSchema], default: [] },
    scenes: { type: [sceneSchema], default: [] },
    startSceneId: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.sceneId },
    finaleText: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.finaleText },
    finaleQuestion: { type: String, default: "", maxlength: LOVEFLIX_LIMITS.finaleQuestion },
    credits: { type: [creditSchema], default: [] },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

loveflixPageSchema.pre("save", async function (next) {
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

loveflixPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ILoveflixPage>("LoveflixPage", loveflixPageSchema);
