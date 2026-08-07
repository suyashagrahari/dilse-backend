import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * MONEY IS A STRING HERE. `price.amount`, `price.original` and `bundle[].price`
 * are String columns on purpose — the demo amount is "∞". Nothing on the server
 * may Number()/parseInt()/parseFloat() them, not to sort and not to compare: the
 * moment one is parsed the buy box renders "NaN" on the most-looked-at line of
 * the page. `discountPct` is the only numeric money field, because it is the
 * only one that is a number.
 */
export const PRODUCT_LIMITS = {
  maxPhotos: 8,
  maxBullets: 10,
  maxSpecs: 20,
  maxBundle: 4,
  maxQA: 12,
  maxReviews: 40,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  name: 60,
  title: 200,
  storeName: 80,
  price: 24,
  /** "Reviewed on 14 February 2021" is 27 characters. Do not lower this to 24. */
  ago: 48,
  line: 200,
  bullet: 300,
  specLabel: 60,
  specValue: 160,
  question: 240,
  answer: 600,
  reviewTitle: 160,
  reviewBody: 2000,
  heading: 120,
  aboutBody: 2000,
  prompt: 240,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  url: 2000,
  reviewId: 64,
  password: 128,
  starsMin: 1,
  starsMax: 5,
  starsDefault: 5,
  discountMin: 0,
  discountMax: 100,
} as const;

/** 1–5, as rendered by the star row. Never a float — the histogram buckets on it. */
export type StarRating = 1 | 2 | 3 | 4 | 5;

/**
 * Contributed reviews land as "pending" and only a "published" one is shown to
 * the recipient. The gate is deliberate: the review box is open to anybody with
 * the link, and this page is a gift.
 */
export type ReviewStatus = "pending" | "published";

export interface IReview {
  id: string;
  author: string;
  stars: StarRating;
  title: string;
  body: string;
  /** "Reviewed on 14 February 2021" — free text, never a parsed date. */
  ago: string;
  /** Renders the "Verified Purchase" flag under the byline. */
  verified: boolean;
  helpful: number;
  imageUrl: string;
  status: ReviewStatus;
}

/** One row of the spec table under the bullets. */
export interface ISpec {
  label: string;
  value: string;
}

/** One tile in the "frequently bought together" strip. */
export interface IBundleItem {
  name: string;
  /** STRING. May be "Free", "₹0" or "∞". Never parsed. */
  price: string;
  imageUrl: string;
  note: string;
}

/** One entry in the customer-questions block. */
export interface IQA {
  question: string;
  answer: string;
  /** Who answered — a person, or the store itself. */
  by: string;
  ago: string;
  votes: number;
}

export interface IProductSubject {
  firstName: string;
  lastName: string;
  /** Fills the gallery rail; the first is the hero. */
  photos: string[];
}

export interface IProductSender {
  firstName: string;
}

export interface IProductPrice {
  /** STRING, and the demo value is "∞". See the header of this file. */
  amount: string;
  /** The struck-through was-price. Also a string. Also never parsed. */
  original: string;
  /** The only number in this object, because it is the only one that is one. */
  discountPct: number;
}

export interface IAboutSection {
  heading: string;
  body: string;
  imageUrl: string;
}

export interface IProductPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  subject: IProductSubject;
  sender: IProductSender;
  /** The listing title. Long on purpose — real ones are. */
  title: string;
  /** "Visit the Sharma Store" — the blue link above the title. */
  storeName: string;
  price: IProductPrice;
  /** "In stock." / "Only 1 left in stock." */
  stockLine: string;
  /** The delivery promise, cut-off included. */
  deliveryLine: string;
  /** "About this item" — the bullet block. */
  bullets: string[];
  specs: ISpec[];
  bundle: IBundleItem[];
  qa: IQA[];
  reviews: IReview[];
  aboutSection: IAboutSection;
  /** Shown above the "write a review" box on the published page. */
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

const subjectSchema = new Schema<IProductSubject>(
  {
    firstName: { type: String, default: "", maxlength: PRODUCT_LIMITS.name },
    lastName: { type: String, default: "", maxlength: PRODUCT_LIMITS.name },
    photos: { type: [String], default: [] },
  },
  { _id: false }
);

const senderSchema = new Schema<IProductSender>(
  {
    firstName: { type: String, default: "", maxlength: PRODUCT_LIMITS.name },
  },
  { _id: false }
);

const priceSchema = new Schema<IProductPrice>(
  {
    // String. No min/max, no numeric cast — "∞" has to survive a round trip.
    amount: { type: String, default: "", maxlength: PRODUCT_LIMITS.price },
    original: { type: String, default: "", maxlength: PRODUCT_LIMITS.price },
    discountPct: {
      type: Number,
      default: PRODUCT_LIMITS.discountMin,
      min: PRODUCT_LIMITS.discountMin,
      max: PRODUCT_LIMITS.discountMax,
    },
  },
  { _id: false }
);

const specSchema = new Schema<ISpec>(
  {
    label: { type: String, default: "", maxlength: PRODUCT_LIMITS.specLabel },
    value: { type: String, default: "", maxlength: PRODUCT_LIMITS.specValue },
  },
  { _id: false }
);

const bundleItemSchema = new Schema<IBundleItem>(
  {
    name: { type: String, default: "", maxlength: PRODUCT_LIMITS.title },
    price: { type: String, default: "", maxlength: PRODUCT_LIMITS.price },
    imageUrl: { type: String, default: "", maxlength: PRODUCT_LIMITS.url },
    note: { type: String, default: "", maxlength: PRODUCT_LIMITS.line },
  },
  { _id: false }
);

const qaSchema = new Schema<IQA>(
  {
    question: { type: String, default: "", maxlength: PRODUCT_LIMITS.question },
    answer: { type: String, default: "", maxlength: PRODUCT_LIMITS.answer },
    by: { type: String, default: "", maxlength: PRODUCT_LIMITS.name },
    ago: { type: String, default: "", maxlength: PRODUCT_LIMITS.ago },
    votes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    id: { type: String, default: "", maxlength: PRODUCT_LIMITS.reviewId },
    author: { type: String, default: "", maxlength: PRODUCT_LIMITS.name },
    stars: {
      type: Number,
      default: PRODUCT_LIMITS.starsDefault,
      min: PRODUCT_LIMITS.starsMin,
      max: PRODUCT_LIMITS.starsMax,
    },
    title: { type: String, default: "", maxlength: PRODUCT_LIMITS.reviewTitle },
    body: { type: String, default: "", maxlength: PRODUCT_LIMITS.reviewBody },
    ago: { type: String, default: "", maxlength: PRODUCT_LIMITS.ago },
    verified: { type: Boolean, default: false },
    helpful: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, default: "", maxlength: PRODUCT_LIMITS.url },
    // Unknown values fail closed to "pending" — an unmoderated review must never
    // default its way onto the recipient's page.
    status: { type: String, enum: ["pending", "published"], default: "pending" },
  },
  { _id: false }
);

const productPageSchema = new Schema<IProductPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    subject: { type: subjectSchema, default: () => ({}) },
    sender: { type: senderSchema, default: () => ({}) },
    title: { type: String, default: "", maxlength: PRODUCT_LIMITS.title },
    storeName: { type: String, default: "", maxlength: PRODUCT_LIMITS.storeName },
    price: { type: priceSchema, default: () => ({}) },
    stockLine: { type: String, default: "", maxlength: PRODUCT_LIMITS.line },
    deliveryLine: { type: String, default: "", maxlength: PRODUCT_LIMITS.line },
    bullets: { type: [String], default: [] },
    specs: { type: [specSchema], default: [] },
    bundle: { type: [bundleItemSchema], default: [] },
    qa: { type: [qaSchema], default: [] },
    reviews: { type: [reviewSchema], default: [] },
    aboutSection: {
      type: new Schema<IAboutSection>(
        {
          heading: { type: String, default: "", maxlength: PRODUCT_LIMITS.heading },
          body: { type: String, default: "", maxlength: PRODUCT_LIMITS.aboutBody },
          imageUrl: { type: String, default: "", maxlength: PRODUCT_LIMITS.url },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    contributorPrompt: { type: String, default: "", maxlength: PRODUCT_LIMITS.prompt },
    contributorsEnabled: { type: Boolean, default: true },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

productPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IProductPage>("ProductPage", productPageSchema);
