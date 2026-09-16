import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. These mirror the client contract's LIMITS/MAX_* block field for field;
 * the client caps too, but the client is not a security boundary.
 */
export const WATCH_LIMITS = {
  maxComments: 60,
  maxReplies: 6,
  maxChapters: 24,
  maxRelated: 12,
  maxParagraphs: 8,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  /** 12 hours. A chapter beyond this is corrupt data, not a long video. */
  maxSeconds: 43_200,
  name: 60,
  handle: 40,
  title: 200,
  stat: 32,
  ago: 48,
  duration: 12,
  label: 160,
  paragraph: 800,
  comment: 1200,
  prompt: 240,
  id: 64,
  /** An embed id has never been longer than this. */
  embedId: 20,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  url: 2000,
  password: 128,
} as const;

/**
 * Contributed comments land as "pending" and only a "published" one is shown to
 * the recipient. The gate is deliberate: the comment box is open to anybody with
 * the link, and this page is a gift.
 */
export type CommentStatus = "pending" | "published";

export interface IReply {
  author: string;
  text: string;
  ago: string;
}

export interface IComment {
  id: string;
  author: string;
  avatarUrl: string;
  text: string;
  /** "2 years ago" — free text, never a parsed date. */
  ago: string;
  likes: number;
  /** Draws the channel-owner chip beside the name. */
  isCreator: boolean;
  /** The little hearted-by-creator badge on the avatar. */
  hearted: boolean;
  replies: IReply[];
  status: CommentStatus;
}

/** One chapter marker. `seconds` is an offset, and it is a number so the seek is exact. */
export interface IChapter {
  seconds: number;
  label: string;
}

export interface IWatchDescription {
  /** Paragraphs above the chapter list. */
  intro: string[];
  chapters: IChapter[];
  /** Paragraphs below the chapter list. */
  outro: string[];
}

/** One card in the related rail. */
export interface IRelatedVideo {
  id: string;
  /** A card with an embed id is playable, one without is decorative. */
  youtubeId: string;
  title: string;
  channel: string;
  /** Display-ready, unit included: "2,481 views". */
  views: string;
  ago: string;
  /** "4:12" — a label, never seeked to. */
  duration: string;
  thumbnailUrl: string;
}

export interface IWatchVideo {
  /**
   * A wire key, handed straight to the embed URL and never rendered as chrome.
   * Reduced to [A-Za-z0-9_-] before it is stored.
   */
  youtubeId: string;
  title: string;
  /** Display-ready string, unit included. May hold "∞". Never parsed. */
  views: string;
  /** "Premiered 14 Feb 2026" — free text. */
  postedAgo: string;
  /** Display-ready string. May hold "∞". Never parsed. */
  likes: string;
}

export interface IWatchChannel {
  name: string;
  handle: string;
  avatarUrl: string;
  /** Display-ready string, unit included: "2 subscribers". Never parsed. */
  subscribers: string;
}

export interface IWatchPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The friends' write link. A different secret from shareId, on purpose. */
  contribToken: string;
  video: IWatchVideo;
  channel: IWatchChannel;
  description: IWatchDescription;
  comments: IComment[];
  /** Rendered above the list with a pin glyph. Not repeated inside `comments`. */
  pinnedComment?: IComment;
  related: IRelatedVideo[];
  /** Shown above the "add a comment" box on the published page. */
  contributorPrompt: string;
  /** When false the published page hides the comment box entirely. */
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

const replySchema = new Schema<IReply>(
  {
    author: { type: String, default: "", maxlength: WATCH_LIMITS.name },
    text: { type: String, default: "", maxlength: WATCH_LIMITS.comment },
    ago: { type: String, default: "", maxlength: WATCH_LIMITS.ago },
  },
  { _id: false }
);

const commentSchema = new Schema<IComment>(
  {
    id: { type: String, default: "", maxlength: WATCH_LIMITS.id },
    author: { type: String, default: "", maxlength: WATCH_LIMITS.name },
    avatarUrl: { type: String, default: "", maxlength: WATCH_LIMITS.url },
    text: { type: String, default: "", maxlength: WATCH_LIMITS.comment },
    ago: { type: String, default: "", maxlength: WATCH_LIMITS.ago },
    likes: { type: Number, default: 0, min: 0 },
    isCreator: { type: Boolean, default: false },
    hearted: { type: Boolean, default: false },
    replies: { type: [replySchema], default: [] },
    // Unknown values fail closed to "pending" — an unmoderated comment must
    // never default its way onto the recipient's page.
    status: { type: String, enum: ["pending", "published"], default: "pending" },
  },
  { _id: false }
);

const chapterSchema = new Schema<IChapter>(
  {
    seconds: { type: Number, default: 0, min: 0, max: WATCH_LIMITS.maxSeconds },
    label: { type: String, default: "", maxlength: WATCH_LIMITS.label },
  },
  { _id: false }
);

const descriptionSchema = new Schema<IWatchDescription>(
  {
    intro: { type: [String], default: [] },
    chapters: { type: [chapterSchema], default: [] },
    outro: { type: [String], default: [] },
  },
  { _id: false }
);

const relatedVideoSchema = new Schema<IRelatedVideo>(
  {
    id: { type: String, default: "", maxlength: WATCH_LIMITS.id },
    youtubeId: { type: String, default: "", maxlength: WATCH_LIMITS.embedId },
    title: { type: String, default: "", maxlength: WATCH_LIMITS.title },
    channel: { type: String, default: "", maxlength: WATCH_LIMITS.name },
    views: { type: String, default: "", maxlength: WATCH_LIMITS.stat },
    ago: { type: String, default: "", maxlength: WATCH_LIMITS.ago },
    duration: { type: String, default: "", maxlength: WATCH_LIMITS.duration },
    thumbnailUrl: { type: String, default: "", maxlength: WATCH_LIMITS.url },
  },
  { _id: false }
);

const videoSchema = new Schema<IWatchVideo>(
  {
    youtubeId: { type: String, default: "", maxlength: WATCH_LIMITS.embedId },
    title: { type: String, default: "", maxlength: WATCH_LIMITS.title },
    views: { type: String, default: "", maxlength: WATCH_LIMITS.stat },
    postedAgo: { type: String, default: "", maxlength: WATCH_LIMITS.ago },
    likes: { type: String, default: "", maxlength: WATCH_LIMITS.stat },
  },
  { _id: false }
);

const channelSchema = new Schema<IWatchChannel>(
  {
    name: { type: String, default: "", maxlength: WATCH_LIMITS.name },
    handle: { type: String, default: "", maxlength: WATCH_LIMITS.handle + 1 },
    avatarUrl: { type: String, default: "", maxlength: WATCH_LIMITS.url },
    subscribers: { type: String, default: "", maxlength: WATCH_LIMITS.stat },
  },
  { _id: false }
);

const watchPageSchema = new Schema<IWatchPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    contribToken: { type: String, unique: true, sparse: true, index: true },
    video: { type: videoSchema, default: () => ({}) },
    channel: { type: channelSchema, default: () => ({}) },
    description: { type: descriptionSchema, default: () => ({}) },
    comments: { type: [commentSchema], default: [] },
    // The pin is optional and stays absent rather than empty: a blank pinned
    // comment would render as an empty pinned card above the list.
    pinnedComment: { type: commentSchema, default: undefined },
    related: { type: [relatedVideoSchema], default: [] },
    contributorPrompt: { type: String, default: "", maxlength: WATCH_LIMITS.prompt },
    contributorsEnabled: { type: Boolean, default: true },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

watchPageSchema.pre("save", async function (next) {
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

watchPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IWatchPage>("WatchPage", watchPageSchema);
