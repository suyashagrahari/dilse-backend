import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * A person rendered as a software listing.
 *
 * ── THREE STRING COLUMNS THAT LOOK NUMERIC AND ARE NOT ───────────────────────
 *
 * `meta.size`, `meta.price` and `rating.count` are String columns on purpose.
 * The canonical values are "1 human", "Free (emotionally expensive)" and
 * "8,472". Nothing on the server may Number()/parseInt()/parseFloat() them, not
 * to sort and not to compare: the moment one is parsed the header block renders
 * "NaN" on the most-looked-at line of the page. `rating.average` and
 * `rating.distribution` are the only numbers in that object, because they are
 * the only things that are numbers.
 *
 * ── TWO SECRETS ──────────────────────────────────────────────────────────────
 *
 * `shareId` is a READ capability handed to the one person the page is for.
 * `contribToken` is a WRITE capability handed to a group chat so friends can
 * leave reviews. They are separate columns and are never interchanged —
 * conflating them would mean anyone who can write can also read the gift.
 */
export const APP_LIMITS = {
  maxScreenshots: 8,
  maxDescLines: 12,
  maxNotes: 8,
  maxVersions: 12,
  maxInfoRows: 16,
  maxReviews: 40,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  /** 1★…5★ counts, always exactly five buckets. */
  distributionBuckets: 5,

  name: 60,
  subtitle: 120,
  developer: 80,
  ageRating: 12,
  category: 60,
  /** "1 human". Free text, never a byte count. */
  size: 60,
  languages: 120,
  /** "Free (emotionally expensive)". Free text, never parsed as currency. */
  price: 60,
  /** "8,472". Display only. */
  ratingCount: 24,
  caption: 160,
  descLine: 1200,
  version: 24,
  date: 48,
  note: 240,
  infoLabel: 60,
  infoValue: 200,
  reviewId: 64,
  author: 60,
  reviewTitle: 120,
  /** The contributor form caps at 200; the editor is allowed more room. */
  reviewBody: 600,
  ago: 48,
  responseText: 800,
  prompt: 240,
  /** A plain https URL. Uploaded artwork is turned into one before it gets here. */
  url: 2000,
  password: 128,

  starsMin: 1,
  starsMax: 5,
  starsDefault: 5,
  averageMin: 0,
  averageMax: 5,
} as const;

/** 1–5, as rendered by the star widget. Never a float — the histogram buckets on it. */
export type AppStarRating = 1 | 2 | 3 | 4 | 5;

/**
 * A contributed review lands as "pending" and only a "published" one reaches
 * the recipient. The gate is deliberate: the review box is open to anybody
 * holding the write link, and this page is a gift.
 */
export type AppReviewStatus = "pending" | "published";

export interface IAppMeta {
  name: string;
  subtitle: string;
  iconUrl: string;
  developer: string;
  ageRating: string;
  category: string;
  /** STRING. "1 human". See the header of this file. */
  size: string;
  languages: string;
  /** STRING. "Free (emotionally expensive)". See the header of this file. */
  price: string;
}

export interface IAppRating {
  /** Mean over PUBLISHED reviews, one decimal. A real number, kept unrounded. */
  average: number;
  /** STRING. "8,472". Display only, never arithmetic. */
  count: string;
  /** 1★…5★ counts in index order. Exactly five entries. */
  distribution: number[];
}

export interface IAppScreenshot {
  imageUrl: string;
  caption: string;
}

export interface IAppDescription {
  short: string[];
  full: string[];
}

export interface IAppWhatsNew {
  version: string;
  date: string;
  notes: string[];
}

/**
 * One changelog entry. Newest first in the array, and the order is never
 * touched: the oldest entry carries the driest note and the contrast against
 * the newer ones is where the joke lands.
 */
export interface IAppVersion {
  version: string;
  date: string;
  /** "1 human (now with opinions)" — free text. */
  size: string;
  notes: string[];
}

export interface IAppInfoRow {
  label: string;
  value: string;
  /** Renders as an accent link that fires a toast rather than navigating. */
  link: boolean;
}

export interface IAppDeveloperResponse {
  text: string;
  ago: string;
}

export interface IAppReview {
  id: string;
  author: string;
  stars: AppStarRating;
  title: string;
  body: string;
  /** "2d ago" — free text, never a parsed date. */
  ago: string;
  version: string;
  developerResponse: IAppDeveloperResponse;
  status: AppReviewStatus;
}

export interface IAppPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The friends' write link. A different secret from shareId, on purpose. */
  contribToken: string;
  meta: IAppMeta;
  rating: IAppRating;
  screenshots: IAppScreenshot[];
  description: IAppDescription;
  whatsNew: IAppWhatsNew;
  versionHistory: IAppVersion[];
  info: IAppInfoRow[];
  reviews: IAppReview[];
  /** Shown to friends on the contributor landing. */
  contributorPrompt: string;
  /** Owner switch for the open review box on the shared page. */
  contributorsEnabled: boolean;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const metaSchema = new Schema<IAppMeta>(
  {
    name: { type: String, default: "", maxlength: APP_LIMITS.name },
    subtitle: { type: String, default: "", maxlength: APP_LIMITS.subtitle },
    iconUrl: { type: String, default: "", maxlength: APP_LIMITS.url },
    developer: { type: String, default: "", maxlength: APP_LIMITS.developer },
    ageRating: { type: String, default: "", maxlength: APP_LIMITS.ageRating },
    category: { type: String, default: "", maxlength: APP_LIMITS.category },
    // String. No numeric cast — "1 human" has to survive a round trip.
    size: { type: String, default: "", maxlength: APP_LIMITS.size },
    languages: { type: String, default: "", maxlength: APP_LIMITS.languages },
    // String. No numeric cast — "Free (emotionally expensive)" likewise.
    price: { type: String, default: "", maxlength: APP_LIMITS.price },
  },
  { _id: false }
);

const ratingSchema = new Schema<IAppRating>(
  {
    average: {
      type: Number,
      default: APP_LIMITS.averageMin,
      min: APP_LIMITS.averageMin,
      max: APP_LIMITS.averageMax,
    },
    // String. "8,472" is a label, not a quantity.
    count: { type: String, default: "", maxlength: APP_LIMITS.ratingCount },
    distribution: { type: [Number], default: () => [0, 0, 0, 0, 0] },
  },
  { _id: false }
);

const screenshotSchema = new Schema<IAppScreenshot>(
  {
    imageUrl: { type: String, default: "", maxlength: APP_LIMITS.url },
    caption: { type: String, default: "", maxlength: APP_LIMITS.caption },
  },
  { _id: false }
);

const descriptionSchema = new Schema<IAppDescription>(
  {
    short: { type: [String], default: [] },
    full: { type: [String], default: [] },
  },
  { _id: false }
);

const whatsNewSchema = new Schema<IAppWhatsNew>(
  {
    version: { type: String, default: "", maxlength: APP_LIMITS.version },
    date: { type: String, default: "", maxlength: APP_LIMITS.date },
    notes: { type: [String], default: [] },
  },
  { _id: false }
);

const versionSchema = new Schema<IAppVersion>(
  {
    version: { type: String, default: "", maxlength: APP_LIMITS.version },
    date: { type: String, default: "", maxlength: APP_LIMITS.date },
    size: { type: String, default: "", maxlength: APP_LIMITS.size },
    notes: { type: [String], default: [] },
  },
  { _id: false }
);

const infoRowSchema = new Schema<IAppInfoRow>(
  {
    label: { type: String, default: "", maxlength: APP_LIMITS.infoLabel },
    value: { type: String, default: "", maxlength: APP_LIMITS.infoValue },
    link: { type: Boolean, default: false },
  },
  { _id: false }
);

const developerResponseSchema = new Schema<IAppDeveloperResponse>(
  {
    text: { type: String, default: "", maxlength: APP_LIMITS.responseText },
    ago: { type: String, default: "", maxlength: APP_LIMITS.ago },
  },
  { _id: false }
);

const reviewSchema = new Schema<IAppReview>(
  {
    id: { type: String, default: "", maxlength: APP_LIMITS.reviewId },
    author: { type: String, default: "", maxlength: APP_LIMITS.author },
    stars: {
      type: Number,
      default: APP_LIMITS.starsDefault,
      min: APP_LIMITS.starsMin,
      max: APP_LIMITS.starsMax,
    },
    title: { type: String, default: "", maxlength: APP_LIMITS.reviewTitle },
    body: { type: String, default: "", maxlength: APP_LIMITS.reviewBody },
    ago: { type: String, default: "", maxlength: APP_LIMITS.ago },
    version: { type: String, default: "", maxlength: APP_LIMITS.version },
    developerResponse: { type: developerResponseSchema, default: () => ({}) },
    // Unknown values fail closed to "pending" — an unmoderated review must never
    // default its way onto the recipient's page.
    status: { type: String, enum: ["pending", "published"], default: "pending" },
  },
  { _id: false }
);

const appPageSchema = new Schema<IAppPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    contribToken: { type: String, unique: true, sparse: true, index: true },
    meta: { type: metaSchema, default: () => ({}) },
    rating: { type: ratingSchema, default: () => ({}) },
    screenshots: { type: [screenshotSchema], default: [] },
    description: { type: descriptionSchema, default: () => ({}) },
    whatsNew: { type: whatsNewSchema, default: () => ({}) },
    versionHistory: { type: [versionSchema], default: [] },
    info: { type: [infoRowSchema], default: [] },
    reviews: { type: [reviewSchema], default: [] },
    contributorPrompt: { type: String, default: "", maxlength: APP_LIMITS.prompt },
    contributorsEnabled: { type: Boolean, default: true },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

appPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (!this.contribToken) this.contribToken = randomUUID();
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

appPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IAppPage>("AppPage", appPageSchema);
