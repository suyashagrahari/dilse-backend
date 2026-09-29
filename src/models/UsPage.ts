import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields } from "../utils/loveMedia";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the formatted stat strings ("84.7K"), the
 * "Followed by … and 2 others" line, or the pinned-first ordering. `formatStat`,
 * `followedByLine` and `orderedPosts` derive all three from the raw numbers and
 * arrays below. Storing "84.7K" would mean a profile whose follower count and
 * its own label can disagree.
 */
export const US_LIMITS = {
  handle: 40,
  displayName: 80,
  category: 80,
  /** One line of the bio block. */
  bioLine: 160,
  maxBioLines: 6,
  linkLabel: 80,
  /** A plain https URL. Uploaded media is turned into one before it gets here. */
  url: 2000,
  caption: 2200,
  /** "Liked by arjun and 847 others" */
  likedByName: 120,
  /** "3 days ago" */
  postedAgo: 40,
  location: 120,
  postId: 64,
  commentText: 600,
  highlightTitle: 60,
  slideCaption: 200,
  /** Nothing on screen counts higher than this; it also bounds `formatStat`. */
  maxStat: 1_000_000_000,
  maxPosts: 60,
  maxComments: 30,
  maxHighlights: 10,
  maxSlides: 20,
  maxFollowedBy: 10,
  /** "Up to 3. Rendered first with a pin glyph." */
  maxPinned: 3,
  /** Carousel photos after the first, per post. */
  maxMore: 4,
  name: 40,
  note: 60,
  dm: 300,
  maxDms: 16,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 500,
  password: 128,
} as const;

/** Framing: focal point 0–100 and zoom 100–300, as the editor's adjuster writes it. */
export interface ICrop {
  x: number;
  y: number;
  scale: number;
}

export interface IFrame {
  url: string;
  crop?: ICrop;
}

export interface IComment {
  handle: string;
  text: string;
  likes?: number;
}

export interface IPost {
  id: string;
  imageUrl: string;
  crop?: ICrop;
  more?: IFrame[];
  caption: string;
  likes: number;
  likedByName: string;
  postedAgo: string;
  location?: string;
  isMultiple?: boolean;
  isVideo?: boolean;
  comments: IComment[];
}

export interface IHighlightSlide {
  imageUrl: string;
  crop?: ICrop;
  caption?: string;
}

export interface IHighlight {
  title: string;
  coverUrl: string;
  slides: IHighlightSlide[];
}

export interface IUsPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The sender's first name — signs the letter, owns the grey DM bubbles. */
  from: string;
  /** The recipient's name. */
  to: string;
  note: string;
  avatarCrop?: ICrop;
  /** DM thread, alternating from → to → from… */
  dms: string[];
  letter: string;
  lockQuestion: string;
  lockAnswer: string;
  handle: string;
  displayName: string;
  category: string;
  bio: string[];
  /** Optional in the contract; absent rather than "" when unused. */
  link?: { label: string; url: string };
  avatarUrl: string;
  stats: { posts: number; followers: number; following: number };
  /** Named handles render semibold inside the "Followed by …" line. */
  followedBy: string[];
  highlights: IHighlight[];
  posts: IPost[];
  /** Up to 3. Rendered first with a pin glyph. */
  pinnedPostIds: string[];
  /**
   * Denormalised by the pre-save hook below, so this template appears on the
   * dashboard alongside the others — `share.controller`'s `getMyCreations` and
   * `getReceivedPages` read flat `senderName`/`recipientName` off every
   * template model, and without these two a profile shows up as "Someone".
   *
   * BOTH ARE `displayName`, DELIBERATELY — this is not a copy-paste slip. Every
   * other template has a sender addressing a recipient; this one is a single
   * shared account that a couple owns jointly ("A relationship gets its own
   * account"). There is no second party to name, so splitting `displayName`
   * into a from/to pair would be inventing a distinction the contract does not
   * have. The dashboard row reads "Us — Meera & Arjun" on both sides, which is
   * the honest rendering of a joint profile.
   */
  senderName: string;
  recipientName: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const cropSchema = new Schema<ICrop>(
  {
    x: { type: Number, min: 0, max: 100 },
    y: { type: Number, min: 0, max: 100 },
    scale: { type: Number, min: 100, max: 300 },
  },
  { _id: false }
);

const frameSchema = new Schema<IFrame>(
  {
    url: { type: String, default: "", maxlength: US_LIMITS.url },
    crop: { type: cropSchema },
  },
  { _id: false }
);

const commentSchema = new Schema<IComment>(
  {
    handle: { type: String, default: "", maxlength: US_LIMITS.handle },
    text: { type: String, default: "", maxlength: US_LIMITS.commentText },
    likes: { type: Number, min: 0, max: US_LIMITS.maxStat },
  },
  { _id: false }
);

/**
 * `location`, `isMultiple` and `isVideo` carry no default on purpose. They are
 * optional in the contract and an absent one must stay absent — a stored
 * `isVideo: false` would put a play glyph decision in the data instead of in
 * the sender's hands.
 */
const postSchema = new Schema<IPost>(
  {
    id: { type: String, default: "", maxlength: US_LIMITS.postId },
    imageUrl: { type: String, default: "", maxlength: US_LIMITS.url },
    crop: { type: cropSchema },
    more: { type: [frameSchema], default: undefined },
    caption: { type: String, default: "", maxlength: US_LIMITS.caption },
    likes: { type: Number, default: 0, min: 0, max: US_LIMITS.maxStat },
    likedByName: { type: String, default: "", maxlength: US_LIMITS.likedByName },
    postedAgo: { type: String, default: "", maxlength: US_LIMITS.postedAgo },
    location: { type: String, maxlength: US_LIMITS.location },
    isMultiple: { type: Boolean },
    isVideo: { type: Boolean },
    comments: { type: [commentSchema], default: [] },
  },
  { _id: false }
);

const highlightSlideSchema = new Schema<IHighlightSlide>(
  {
    imageUrl: { type: String, default: "", maxlength: US_LIMITS.url },
    crop: { type: cropSchema },
    caption: { type: String, maxlength: US_LIMITS.slideCaption },
  },
  { _id: false }
);

const highlightSchema = new Schema<IHighlight>(
  {
    title: { type: String, default: "", maxlength: US_LIMITS.highlightTitle },
    coverUrl: { type: String, default: "", maxlength: US_LIMITS.url },
    slides: { type: [highlightSlideSchema], default: [] },
  },
  { _id: false }
);

const linkSchema = new Schema<{ label: string; url: string }>(
  {
    label: { type: String, default: "", maxlength: US_LIMITS.linkLabel },
    url: { type: String, default: "", maxlength: US_LIMITS.url },
  },
  { _id: false }
);

const statsSchema = new Schema<{ posts: number; followers: number; following: number }>(
  {
    posts: { type: Number, default: 0, min: 0, max: US_LIMITS.maxStat },
    followers: { type: Number, default: 0, min: 0, max: US_LIMITS.maxStat },
    following: { type: Number, default: 0, min: 0, max: US_LIMITS.maxStat },
  },
  { _id: false }
);

const usPageSchema = new Schema<IUsPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    from: { type: String, default: "", maxlength: US_LIMITS.name },
    to: { type: String, default: "", maxlength: US_LIMITS.name },
    note: { type: String, default: "", maxlength: US_LIMITS.note },
    avatarCrop: { type: cropSchema },
    dms: { type: [String], default: [] },
    letter: loveKitFields.letter,
    lockQuestion: loveKitFields.lockQuestion,
    lockAnswer: loveKitFields.lockAnswer,
    handle: { type: String, default: "", maxlength: US_LIMITS.handle },
    displayName: { type: String, default: "", maxlength: US_LIMITS.displayName },
    category: { type: String, default: "", maxlength: US_LIMITS.category },
    bio: { type: [String], default: [] },
    link: { type: linkSchema },
    avatarUrl: { type: String, default: "", maxlength: US_LIMITS.url },
    stats: { type: statsSchema, default: () => ({ posts: 0, followers: 0, following: 0 }) },
    followedBy: { type: [String], default: [] },
    highlights: { type: [highlightSchema], default: [] },
    posts: { type: [postSchema], default: [] },
    pinnedPostIds: { type: [String], default: [] },
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the hook and the interface for why both are `displayName`.
    senderName: { type: String, default: "", maxlength: US_LIMITS.displayName },
    recipientName: { type: String, default: "", maxlength: US_LIMITS.displayName },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

usPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is
  // the one someone forgets — a renamed profile would keep its old dashboard
  // row forever with no visible error anywhere.
  //
  // Both sides get `displayName`: this is one shared account, not a sender and
  // a recipient. See the interface for the full reasoning.
  // Pages made since the names were asked for carry a real from/to pair; older
  // ones only have the joint display name, so both sides fall back to it.
  const shared = (this.displayName ?? "").slice(0, US_LIMITS.displayName);
  this.senderName = (this.from || shared).slice(0, US_LIMITS.displayName);
  this.recipientName = (this.to || shared).slice(0, US_LIMITS.displayName);
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

usPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IUsPage>("UsPage", usPageSchema);
