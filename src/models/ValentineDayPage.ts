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
import { VALENTINE_DAY_SLUGS, VW_LIMITS, type ValentineDaySlug } from "../config/valentineDays";

/** Written only by the public `react` beacon — never by the owner's form. */
export interface IValentineReactions {
  openedAt?: Date | null;
  completedAt?: Date | null;
  answer?: "yes" | null;
  answeredAt?: Date | null;
  noDodges?: number | null;
  count?: number | null;
}

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
  music: boolean;
  endLine: string;
  /** Day-specific fields, validated by the day's FieldSpec list. */
  extras: Record<string, unknown>;
  reactions: IValentineReactions;
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const reactionsSchema = new Schema<IValentineReactions>(
  {
    openedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    answer: { type: String, enum: ["yes", null], default: null },
    answeredAt: { type: Date, default: null },
    noDodges: { type: Number, default: null, min: 0, max: VW_LIMITS.maxNoDodges },
    count: { type: Number, default: null, min: 0, max: VW_LIMITS.maxCount },
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
    // The longest day (Valentine's) allows 2000; the controller applies each
    // day's own cap before this one is ever reached.
    letter: loveKitFields.letter,
    photos: loveKitFields.photos,
    gifs: { type: Schema.Types.Mixed, default: {} },
    music: { type: Boolean, default: true },
    endLine: { type: String, default: "", maxlength: VW_LIMITS.endLine },
    extras: { type: Schema.Types.Mixed, default: {} },
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

/** "happy-rose-day" → "RoseDayPage", "happy-valentines-day" → "ValentinesDayPage". */
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
