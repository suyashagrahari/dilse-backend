import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the count, the record, the status, `totalDays`, the
 * missed day, the repair window, the most-used word — nothing on the archive
 * screen. `deriveStreak` and `deriveStats` recompute every one of them from
 * `checkIns` on read. A streak whose number is a column in the database is a
 * number that drifts, and a drifted streak is the single most visible bug this
 * product can ship.
 */
export const STREAK_LIMITS = {
  /** Display truncation is 20 (client `truncWord`). Storage keeps what they
   *  typed, emoji included — capped only so one row cannot grow unbounded. */
  word: 200,
  /** The sealed note. Short keeps it a whisper rather than a chore. */
  note: 60,
  name: 80,
  personId: 64,
  letter: 2000,
  microLine: 200,
  /** A plain https URL. Uploaded media is turned into one before it gets here. */
  url: 2000,
  /** "2026-08-07". An ISO day key in the PAIR's zone, never a timestamp. */
  date: 40,
  /** An ISO timestamp — the moment they tapped. */
  timestamp: 40,
  /** IANA, e.g. "Asia/Kolkata". */
  timezone: 64,
  /** A `randomUUID()` is 36 chars; the cap leaves room for a future format. */
  sideToken: 64,
  /** Never hold more than this. Covers are a kindness, not a currency. */
  maxCovers: 3,
  /** ~13 years of daily check-ins. This template is opened every day for years. */
  maxCheckInDays: 5000,
  maxMilestones: 24,
  maxMicroLetters: 520,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 10000,
  password: 128,
  /** The snap-app skin. */
  handle: 40,
  token: 24,
  place: 60,
  chatLine: 200,
  maxChats: 8,
} as const;

/** Which half of the pair. Stable for the life of the pair. */
export type Side = "a" | "b";

export interface IPerson {
  id: string;
  name: string;
  photoUrl: string;
}

/** One partner's contribution to one day. */
export interface ICheckInEntry {
  word: string;
  /** Optional. A failed upload must still leave the check-in valid. */
  photoUrl?: string;
  /** ISO timestamp of the moment they tapped. Used for "who's first". */
  at: string;
  /**
   * The sealed note. NEVER sent to the partner on the current day until they
   * have checked in themselves — see `projectSharedCheckIns` in the controller.
   */
  note?: string;
}

export interface ICheckInDay {
  /** YYYY-MM-DD in the PAIR's timezone. Never the device's. */
  date: string;
  a?: ICheckInEntry;
  b?: ICheckInEntry;
  /**
   * The side that SPENT the cover — NOT the side that was covered for.
   *
   * Do not flip this. `COPY.coveredBy(name)` on the client renders "Meera
   * covered for you." to the partner who was covered FOR, so the field has to
   * name the spender or that string cannot be written at all: the reader is
   * the other side by construction. Set only by `POST /:id/cover`.
   */
  covered?: Side;
}

export interface IMilestone {
  /** Day count at which this unlocks. Measured on the HIGH WATER MARK. */
  atDay: number;
  letter: string;
  /** ISO. Set once, the first time it is opened. Never cleared. */
  openedOn?: string;
}

/** A one-line sender note that unlocks every 7 completed days. */
export interface IMicroLetter {
  /** 1 = unlocks at 7 days, 2 = at 14, and so on. */
  week: number;
  line: string;
}

export interface IStreakPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  pair: { a: IPerson; b: IPerson };
  /** YYYY-MM-DD. The first day the pair existed. */
  startedOn: string;
  /** IANA. ONE per pair, set at creation. Every day boundary goes through it. */
  timezone: string;
  checkIns: ICheckInDay[];
  /** Earned, spendable. Capped at STREAK_LIMITS.maxCovers, floored at 0. */
  covers: { a: number; b: number };
  milestones: IMilestone[];
  microLetters: IMicroLetter[];
  // ── The snap-app skin (all optional; old pages simply lack them) ──
  /** Usernames shown under the names ("ananya.bby"). */
  handleA: string;
  handleB: string;
  /** Bitmoji-style avatar preset ids. */
  avatarA: string;
  avatarB: string;
  /** Zodiac sign ids for the friendship charms ("leo"). */
  zodiacA: string;
  zodiacB: string;
  /** The place both avatars stand on the parody map. */
  mapPlace: string;
  /** Lines the sender "saved in chat" — shown at the top of the conversation. */
  chats: string[];
  /** Memories: framed photos, each with a caption and a little note. */
  photos: ILovePhoto[];
  /** The main letter + its optional one-question lock. */
  letter: string;
  lockQuestion: string;
  lockAnswer: string;
  /**
   * Denormalised from `pair.a.name` / `pair.b.name` by the pre-save hook below.
   * The dashboard queries in `share.controller` (`getMyCreations`,
   * `getReceivedPages`) read flat `senderName`/`recipientName` off every
   * template model; without these two a streak shows up as "Someone".
   */
  senderName: string;
  recipientName: string;
  /**
   * One unguessable token per side, minted alongside `shareId`. The share link
   * carries one — `/<shareId>?k=<token>` — and the sender sends each partner
   * theirs, which is how the server learns WHICH HALF OF THE PAIR is reading
   * without a login.
   *
   * These are independent `randomUUID()`s. They are deliberately NOT derived
   * from `shareId` or from each other: if they were, holding the share link
   * would be enough to compute both, and the whole point is that holding one
   * link identifies you as exactly one side.
   *
   * `select: false` so they never ride along on an ordinary read. The share
   * handler asks for them by name and strips them back out before responding.
   */
  sideTokenA: string;
  sideTokenB: string;
  // Security & meta
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
    id: { type: String, default: "", maxlength: STREAK_LIMITS.personId },
    name: { type: String, default: "", maxlength: STREAK_LIMITS.name },
    photoUrl: { type: String, default: "", maxlength: STREAK_LIMITS.url },
  },
  { _id: false }
);

/**
 * `photoUrl` and `note` carry no default on purpose. An absent optional field
 * must stay absent in the stored document rather than materialising as "" —
 * `noteViewFor` on the client treats a falsy note as "no note at all", and the
 * share projection keys off presence.
 */
const checkInEntrySchema = new Schema<ICheckInEntry>(
  {
    word: { type: String, default: "", maxlength: STREAK_LIMITS.word },
    photoUrl: { type: String, maxlength: STREAK_LIMITS.url },
    at: { type: String, default: "", maxlength: STREAK_LIMITS.timestamp },
    note: { type: String, maxlength: STREAK_LIMITS.note },
  },
  { _id: false }
);

const checkInDaySchema = new Schema<ICheckInDay>(
  {
    date: { type: String, default: "", maxlength: STREAK_LIMITS.date },
    a: { type: checkInEntrySchema },
    b: { type: checkInEntrySchema },
    covered: { type: String, enum: ["a", "b"] },
  },
  { _id: false }
);

const milestoneSchema = new Schema<IMilestone>(
  {
    atDay: { type: Number, default: 0, min: 0 },
    letter: { type: String, default: "", maxlength: STREAK_LIMITS.letter },
    openedOn: { type: String, maxlength: STREAK_LIMITS.timestamp },
  },
  { _id: false }
);

const microLetterSchema = new Schema<IMicroLetter>(
  {
    week: { type: Number, default: 1, min: 1 },
    line: { type: String, default: "", maxlength: STREAK_LIMITS.microLine },
  },
  { _id: false }
);

const coversSchema = new Schema<{ a: number; b: number }>(
  {
    a: { type: Number, default: 0, min: 0, max: STREAK_LIMITS.maxCovers },
    b: { type: Number, default: 0, min: 0, max: STREAK_LIMITS.maxCovers },
  },
  { _id: false }
);

/**
 * TODO(reconciliation): a nightly sweep must recompute every pair's state from
 * the check-in log rather than trusting any incremental update. `checkIns` is
 * the ledger and it is the only thing here that is authoritative; the covers
 * balance, the milestone `openedOn` stamps and any future cached counter are
 * derived facts that a retried request, a partial write, or a clock skew can
 * put out of step with the ledger. The job must, per pair: replay `checkIns`
 * from `startedOn` in the pair's `timezone`, recompute completed days and runs,
 * re-derive earned covers (one per COVER_EARN_EVERY completed days, capped),
 * subtract the days actually marked `covered`, and write the corrected balance
 * back — logging any pair whose stored state differed. Streak bugs are
 * extremely visible: the number is the entire product, a couple looks at it
 * every single day, and a single off-by-one is read as "the app lost our
 * streak". Reconciling nightly means a bad increment survives hours, not years.
 */
const streakPageSchema = new Schema<IStreakPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    pair: {
      type: new Schema<{ a: IPerson; b: IPerson }>(
        { a: { type: personSchema, default: () => ({}) }, b: { type: personSchema, default: () => ({}) } },
        { _id: false }
      ),
      default: () => ({}),
    },
    startedOn: { type: String, default: "", maxlength: STREAK_LIMITS.date },
    timezone: { type: String, default: "", maxlength: STREAK_LIMITS.timezone },
    checkIns: { type: [checkInDaySchema], default: [] },
    covers: { type: coversSchema, default: () => ({ a: 0, b: 0 }) },
    milestones: { type: [milestoneSchema], default: [] },
    microLetters: { type: [microLetterSchema], default: [] },
    handleA: { type: String, default: "", maxlength: STREAK_LIMITS.handle },
    handleB: { type: String, default: "", maxlength: STREAK_LIMITS.handle },
    avatarA: { type: String, default: "", maxlength: STREAK_LIMITS.token },
    avatarB: { type: String, default: "", maxlength: STREAK_LIMITS.token },
    zodiacA: { type: String, default: "", maxlength: STREAK_LIMITS.token },
    zodiacB: { type: String, default: "", maxlength: STREAK_LIMITS.token },
    mapPlace: { type: String, default: "", maxlength: STREAK_LIMITS.place },
    chats: { type: [String], default: [] },
    photos: loveKitFields.photos,
    letter: loveKitFields.letter,
    lockQuestion: loveKitFields.lockQuestion,
    lockAnswer: loveKitFields.lockAnswer,
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the hook for why it is not done in the controller.
    senderName: { type: String, default: "", maxlength: STREAK_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: STREAK_LIMITS.name },
    // Per-side reader identity. Minted by the pre-save hook, never by a caller.
    sideTokenA: { type: String, default: "", maxlength: STREAK_LIMITS.sideToken, select: false },
    sideTokenB: { type: String, default: "", maxlength: STREAK_LIMITS.sideToken, select: false },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

streakPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  // Two independent tokens, minted once and never rotated — rotating them would
  // silently break a link a couple has had bookmarked for a year.
  if (!this.sideTokenA) this.sideTokenA = randomUUID();
  if (!this.sideTokenB) this.sideTokenB = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is
  // the one someone forgets — a renamed pair would keep its old dashboard row
  // forever with no visible error anywhere.
  this.senderName = (this.pair?.a?.name ?? "").slice(0, STREAK_LIMITS.name);
  this.recipientName = (this.pair?.b?.name ?? "").slice(0, STREAK_LIMITS.name);
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

streakPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IStreakPage>("StreakPage", streakPageSchema);
