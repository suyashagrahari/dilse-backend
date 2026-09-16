import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the scorecard, the countdown, the wear stage, the
 * twins, the reveal order. `scoreCapsule`, `countdownTo`, `wearFor`,
 * `findTwins` and `revealOrder` all derive from `predictions` on read. Storing
 * a score would mean a capsule whose numbers can disagree with its own cards.
 */
export const CAPSULE_LIMITS = {
  predictionText: 90,
  stake: 120,
  city: 60,
  oneLine: 140,
  name: 80,
  personId: 64,
  predictionId: 64,
  /** A plain https URL. Uploaded media is turned into one before it gets here. */
  url: 2000,
  /** IANA, e.g. "Asia/Kolkata". */
  timezone: 64,
  /** An ISO timestamp. Server time decides eligibility, never the device. */
  timestamp: 40,
  minPredictions: 4,
  /** Per author. Both sides together therefore top out at twice this. */
  maxPredictions: 8,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  password: 128,
} as const;

/**
 * The 24h amend window after sealing. Mirrors `AMEND_WINDOW_MS` in the client
 * contract; `canAmendCapsule` in the controller is the only gate that reads it.
 */
export const AMEND_WINDOW_MS = 24 * 3_600_000;

/**
 * Bump on any breaking change to the stored shape. Readers switch on it.
 * A capsule sealed at v1 must still open at v4 — that is the whole promise, and
 * this field is the only reason it is keepable. Mirrors `PAYLOAD_VERSION`.
 */
export const PAYLOAD_VERSION = 1;

export type Side = "a" | "b";
/** 1..5. The stake weight. Higher confidence wins or loses more. */
export type Confidence = 1 | 2 | 3 | 4 | 5;
export type Verdict = "right" | "wrong";
export type Resolution = "right" | "wrong" | "disputed";
export type CapsuleStatus = "writing" | "sealed" | "opening" | "judged";

export interface IPerson {
  id: string;
  name: string;
  photoUrl: string;
}

export interface IPrediction {
  id: string;
  author: Side;
  /** SEALED. Never leaves the server before `opensOn` — see the controller. */
  text: string;
  confidence: Confidence;
  /** The deliberately absurd one. Scores zero either way. One per author. */
  isWildcard: boolean;
  verdictA?: Verdict;
  verdictB?: Verdict;
  resolved?: Resolution;
}

/** Captured at writing time. The gap between then and now is the payload. */
export interface ICapsuleContext {
  city: string;
  /** ISO. */
  writtenAt: string;
  /** "we were still figuring it out" */
  oneLineAboutNow: string;
}

export interface ICapsulePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** See PAYLOAD_VERSION. Stored, not derived — an old capsule keeps its own. */
  version: number;
  pair: { a: IPerson; b: IPerson };
  /** ISO. */
  sealedOn: string;
  /** ISO. Server time decides eligibility, never the device. */
  opensOn: string;
  /** IANA. One per pair, set at creation. */
  timezone: string;
  /** Max 120 chars. Both must agree before sealing. */
  stake: string;
  /** SEALED alongside the predictions. Withheld entirely until `opensOn`. */
  context: { a: ICapsuleContext; b: ICapsuleContext };
  predictions: IPrediction[];
  status: CapsuleStatus;
  openedAt: string;
  /**
   * Denormalised from `pair.a.name` / `pair.b.name` by the pre-save hook below.
   * The dashboard queries in `share.controller` (`getMyCreations`,
   * `getReceivedPages`) read flat `senderName`/`recipientName` off every
   * template model; without these two a capsule shows up as "Someone".
   *
   * Names are NOT sealed content — `SealedCapsuleView` carries the whole `pair`
   * object. Nothing here widens what a sealed capsule discloses.
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

const personSchema = new Schema<IPerson>(
  {
    id: { type: String, default: "", maxlength: CAPSULE_LIMITS.personId },
    name: { type: String, default: "", maxlength: CAPSULE_LIMITS.name },
    photoUrl: { type: String, default: "", maxlength: CAPSULE_LIMITS.url },
  },
  { _id: false }
);

const predictionSchema = new Schema<IPrediction>(
  {
    id: { type: String, default: "", maxlength: CAPSULE_LIMITS.predictionId },
    author: { type: String, enum: ["a", "b"], required: true },
    text: { type: String, default: "", maxlength: CAPSULE_LIMITS.predictionText },
    confidence: { type: Number, default: 3, min: 1, max: 5 },
    isWildcard: { type: Boolean, default: false },
    verdictA: { type: String, enum: ["right", "wrong"] },
    verdictB: { type: String, enum: ["right", "wrong"] },
    resolved: { type: String, enum: ["right", "wrong", "disputed"] },
  },
  { _id: false }
);

const capsuleContextSchema = new Schema<ICapsuleContext>(
  {
    city: { type: String, default: "", maxlength: CAPSULE_LIMITS.city },
    writtenAt: { type: String, default: "", maxlength: CAPSULE_LIMITS.timestamp },
    oneLineAboutNow: { type: String, default: "", maxlength: CAPSULE_LIMITS.oneLine },
  },
  { _id: false }
);

const capsulePageSchema = new Schema<ICapsulePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    version: { type: Number, default: PAYLOAD_VERSION, min: 1 },
    pair: {
      type: new Schema<{ a: IPerson; b: IPerson }>(
        { a: { type: personSchema, default: () => ({}) }, b: { type: personSchema, default: () => ({}) } },
        { _id: false }
      ),
      default: () => ({}),
    },
    sealedOn: { type: String, default: "", maxlength: CAPSULE_LIMITS.timestamp },
    opensOn: { type: String, default: "", maxlength: CAPSULE_LIMITS.timestamp },
    timezone: { type: String, default: "", maxlength: CAPSULE_LIMITS.timezone },
    stake: { type: String, default: "", maxlength: CAPSULE_LIMITS.stake },
    context: {
      type: new Schema<{ a: ICapsuleContext; b: ICapsuleContext }>(
        {
          a: { type: capsuleContextSchema, default: () => ({}) },
          b: { type: capsuleContextSchema, default: () => ({}) },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    predictions: { type: [predictionSchema], default: [] },
    status: {
      type: String,
      enum: ["writing", "sealed", "opening", "judged"],
      default: "writing",
    },
    openedAt: { type: String, default: "", maxlength: CAPSULE_LIMITS.timestamp },
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the hook for why it is not done in the controller.
    senderName: { type: String, default: "", maxlength: CAPSULE_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: CAPSULE_LIMITS.name },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

capsulePageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is
  // the one someone forgets — a renamed pair would keep its old dashboard row
  // forever with no visible error anywhere.
  this.senderName = (this.pair?.a?.name ?? "").slice(0, CAPSULE_LIMITS.name);
  this.recipientName = (this.pair?.b?.name ?? "").slice(0, CAPSULE_LIMITS.name);
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

capsulePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ICapsulePage>("CapsulePage", capsulePageSchema);
