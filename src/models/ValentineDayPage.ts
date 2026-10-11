// ─── ValentineDayPage — one collection, eight discriminators ─────────────────
//
// The eight Valentine's-week days share one shape (config/valentineDays.ts).
// They are stored in ONE collection and exposed as eight Mongoose
// DISCRIMINATOR models (RoseDayPage … ValentinesDayPage, discriminatorKey
// "day"), so every query made through a day's model is automatically narrowed
// to `{ day: "<slug>" }`.
//
// That narrowing is the reason for discriminators rather than one model with
// eight TEMPLATE_LOOKUPS entries: the generic share resolver, analytics, admin
// counts and the activity feed all iterate TEMPLATE_LOOKUPS and query each
// model with no type filter. Eight entries over one plain model would resolve
// every shareId to the first day and count every page eight times. With
// discriminators each entry sees only its own day, and nothing generic changes.
//
// The BASE model is never registered in TEMPLATE_LOOKUPS.

import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";
import {
  MUSIC_MODES,
  MUSIC_START_MAX,
  PREMIUM_LIMITS,
  VALENTINE_DAY_SLUGS,
  VW_LIMITS,
  type MusicMode,
  type PremiumFields,
  type ValentineDaySlug,
} from "../config/valentineDays";

/** Written only by the public `react` / `reply` endpoints — never by the owner's form. */
export interface IValentineReactions {
  openedAt?: Date | null;
  completedAt?: Date | null;
  answer?: "yes" | "no" | null;
  answeredAt?: Date | null;
  noDodges?: number | null;
  count?: number | null;
  /** Premium only: the recipient's one reply (first write wins). Absent until then. */
  reply?: { text: string; at: Date } | null;
}

/** Max letter length on this model — the premium tier's 3000 (each day applies its own cap first). */
export const VALENTINE_LETTER_MAX = 3000;

export interface IValentineDayPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The discriminator value — the slug, e.g. "happy-rose-day". */
  day: ValentineDaySlug;
  recipientName: string;
  senderName: string;
  petName: string;
  letter: string;
  photos: ILovePhoto[];
  /** slotId → "" (default sticker) | "none" (hidden) | https GIF/WebP URL. */
  gifs: Record<string, string>;
  /** Kept for older clients: always `musicMode !== "off"`. */
  music: boolean;
  musicMode: MusicMode;
  /** An 11-char YouTube video id (never a URL), or "". */
  musicYoutubeId: string;
  /** Seconds into the song to start from, 0–600. */
  musicStart: number;
  endLine: string;
  /** Day-specific fields, validated by the day's FieldSpec list. */
  extras: Record<string, unknown>;
  /** Premium slugs only — absent (not `{}`) on every $2 page. */
  premium?: PremiumFields;
  reactions: IValentineReactions;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const replySchema = new Schema(
  {
    text: { type: String, default: "", maxlength: PREMIUM_LIMITS.reply },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const reactionsSchema = new Schema<IValentineReactions>(
  {
    openedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    answer: { type: String, enum: ["yes", "no", null], default: null },
    answeredAt: { type: Date, default: null },
    noDodges: { type: Number, default: null, min: 0, max: VW_LIMITS.maxNoDodges },
    count: { type: Number, default: null, min: 0, max: VW_LIMITS.maxCount },
    // No default: a $2 page's reactions must not grow a `reply: null` key. The
    // reply guard `{ "reactions.reply": null }` matches a missing field too.
    reply: { type: replySchema, default: undefined },
  },
  { _id: false }
);

/**
 * The premium sub-document. Sanitised in config/valentineDays.ts
 * (sanitizePremium); these limits are the backstop. Single-nested with no
 * default, so a $2 page never carries a `premium` key at all — with
 * `minimize: false` on the parent a default of `{}` would show up in every
 * $2 payload.
 */
const premiumSchema = new Schema<PremiumFields>(
  {
    voiceNote: { type: String, default: "", maxlength: PREMIUM_LIMITS.voiceUrl },
    voiceNoteSec: { type: Number, default: 0, min: 0, max: PREMIUM_LIMITS.voiceSec },
    voicePeaks: {
      type: [{ type: Number, min: 0, max: 100 }],
      default: [],
      validate: [(v: number[]) => !v || v.length <= PREMIUM_LIMITS.voicePeaks, "too many voice peaks"],
    },
    voiceCaption: { type: String, default: "", maxlength: PREMIUM_LIMITS.voiceCaption },
    songDropAt: { type: Number, default: 0, min: 0, max: PREMIUM_LIMITS.songDropMax },
    unlockAt: { type: String, default: "", maxlength: 40 },
    unlockTz: { type: String, default: "Asia/Kolkata", maxlength: PREMIUM_LIMITS.unlockTz },
    allowReply: { type: Boolean, default: true },
    psLetter: { type: String, default: "", maxlength: PREMIUM_LIMITS.psLetter },
  },
  { _id: false }
);

const valentineDayPageSchema = new Schema<IValentineDayPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    recipientName: { type: String, default: "", maxlength: VW_LIMITS.name },
    senderName: { type: String, default: "", maxlength: VW_LIMITS.name },
    petName: { type: String, default: "", maxlength: VW_LIMITS.petName },
    // The longest $2 day (Valentine's) allows 2000 and every premium day 3000;
    // the controller applies each day's own cap before this one is ever
    // reached. Raised here only — LOVE_LIMITS.letter (other templates) is untouched.
    letter: { ...loveKitFields.letter, maxlength: VALENTINE_LETTER_MAX },
    photos: loveKitFields.photos,
    gifs: { type: Schema.Types.Mixed, default: {} },
    music: { type: Boolean, default: true },
    musicMode: { type: String, enum: MUSIC_MODES, default: "melody" },
    musicYoutubeId: { type: String, default: "", match: [/^(|[A-Za-z0-9_-]{11})$/, "invalid YouTube id"] },
    musicStart: { type: Number, default: 0, min: 0, max: MUSIC_START_MAX },
    endLine: { type: String, default: "", maxlength: VW_LIMITS.endLine },
    extras: { type: Schema.Types.Mixed, default: {} },
    // Premium slugs only; see premiumSchema. Never defaulted.
    premium: { type: premiumSchema, default: undefined },
    reactions: { type: reactionsSchema, default: () => ({}) },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true, discriminatorKey: "day", collection: "valentinedaypages", minimize: false }
);

valentineDayPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    // Trimmed before hashing — see the long note in models/CatchPage.ts. One
    // implementation across every page model; models/pagePassword.test.ts
    // asserts that no copy drifts.
    const trimmed = this.password.trim();

    if (!trimmed) {
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

valentineDayPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  if (await bcrypt.compare(trimmed, this.password)) {
    await rememberPagePassword(this, trimmed);
    return true;
  }

  // Exactly as typed, for a page hashed before passwords were trimmed (none of
  // these exist yet, but the rule is uniform across every page model).
  if (raw === trimmed) return false;
  if (await bcrypt.compare(raw, this.password)) {
    await rememberPagePassword(this, raw);
    return true;
  }
  return false;
};

export const ValentineDayPage = mongoose.model<IValentineDayPage>("ValentineDayPage", valentineDayPageSchema);

/** "happy-rose-day" → "RoseDayPage", "happy-valentines-day" → "ValentinesDayPage", "happy-halloween" → "HalloweenPage". */
const modelName = (slug: string): string =>
  slug
    .replace(/^happy-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("") + "Page";

/** One discriminator model per day. Use these, never the base, for any query. */
export const VALENTINE_DAY_MODELS = Object.fromEntries(
  VALENTINE_DAY_SLUGS.map((slug) => [
    slug,
    ValentineDayPage.discriminator<IValentineDayPage>(modelName(slug), new Schema({}), slug),
  ])
) as Record<ValentineDaySlug, mongoose.Model<IValentineDayPage>>;

export default ValentineDayPage;
