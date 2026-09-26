import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the dial position, the decoy stations, the VU
 * levels, the current segment index or any phase. The tuner is generated from
 * `station.frequency` by `resolveDecoys` and the meters are read off a live
 * AnalyserNode — a radio whose needle position came out of the database would
 * be a screenshot of a radio.
 */
export const DEDICATION_LIMITS = {
  stationName: 60,
  /** "98.3", or "14.3" if that's the date they met. Parsed as a number client-side. */
  frequency: 12,
  name: 80,
  city: 80,
  /** A plain https URL. Uploaded audio is turned into one before it gets here. */
  url: 2000,
  /** An 11-char YouTube id, validated by `parseYouTubeId` at input time. */
  youtubeId: 24,
  songTitle: 160,
  songArtist: 160,
  /** "This one goes out to Meera in Bengaluru, from Arjun." */
  dedication: 400,
  /** Subtitle text, for someone who can't use sound right now. */
  caption: 600,
  signOff: 800,
  /** The booth caps a take at 90s; this leaves headroom for a long show. */
  maxDurationMs: 24 * 3_600_000,
  /** A show is an evening, not a boxset. */
  maxSegments: 24,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  password: 128,
  /** Uploaded, transcoded personal videos. Each is ≤10MB before compression. */
  maxClips: 3,
  /** The carousel in the radio's window. */
  maxPhotos: 12,
  photoCaption: 80,
  photoNote: 600,
  /** The love letter under the radio. */
  letter: 2000,
} as const;

export interface IPhoto {
  url: string;
  caption?: string;
  /** A little letter written for this one photo. */
  note?: string;
  /** Framing: focal point 0–100 and zoom 100–300 (%). */
  cropX?: number;
  cropY?: number;
  scale?: number;
}

export interface IStation {
  name: string;
  frequency: string;
}

/**
 * A discriminated union in the contract (`VoiceSegment | SongSegment`), stored
 * as one subdocument whose non-`kind` fields are all optional and carry no
 * default. The controller writes exactly the keys the segment's `kind` calls
 * for, so a stored voice segment has no `youtubeId` key at all rather than an
 * empty one — which is what keeps the round-tripped object assignable to the
 * union the client actually narrows on.
 */
export interface ISegment {
  kind: "voice" | "song" | "clip";
  // voice
  audioUrl?: string;
  durationMs?: number;
  caption?: string;
  // song
  youtubeId?: string;
  title?: string;
  artist?: string;
  startSeconds?: number;
  endSeconds?: number;
  dedication?: string;
  // clip — an uploaded video, played on the radio's screen
  videoUrl?: string;
  posterUrl?: string;
}

export interface IDedicationPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  station: IStation;
  sender: { name: string; city: string };
  recipient: { name: string; city: string };
  segments: ISegment[];
  /** The final text card, over a dimming radio face. */
  signOff: string;
  photos: IPhoto[];
  letter: string;
  /**
   * Denormalised from `sender.name` / `recipient.name` by the pre-save hook
   * below. The dashboard queries in `share.controller` (`getMyCreations`,
   * `getReceivedPages`) read flat `senderName`/`recipientName` off every
   * template model; without these two a show shows up as "Someone".
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

const stationSchema = new Schema<IStation>(
  {
    name: { type: String, default: "", maxlength: DEDICATION_LIMITS.stationName },
    frequency: { type: String, default: "", maxlength: DEDICATION_LIMITS.frequency },
  },
  { _id: false }
);

const personSchema = new Schema<{ name: string; city: string }>(
  {
    name: { type: String, default: "", maxlength: DEDICATION_LIMITS.name },
    city: { type: String, default: "", maxlength: DEDICATION_LIMITS.city },
  },
  { _id: false }
);

const segmentSchema = new Schema<ISegment>(
  {
    kind: { type: String, enum: ["voice", "song", "clip"], required: true },
    audioUrl: { type: String, maxlength: DEDICATION_LIMITS.url },
    durationMs: { type: Number, min: 0, max: DEDICATION_LIMITS.maxDurationMs },
    caption: { type: String, maxlength: DEDICATION_LIMITS.caption },
    youtubeId: { type: String, maxlength: DEDICATION_LIMITS.youtubeId },
    title: { type: String, maxlength: DEDICATION_LIMITS.songTitle },
    artist: { type: String, maxlength: DEDICATION_LIMITS.songArtist },
    startSeconds: { type: Number, min: 0 },
    endSeconds: { type: Number, min: 0 },
    dedication: { type: String, maxlength: DEDICATION_LIMITS.dedication },
    videoUrl: { type: String, maxlength: DEDICATION_LIMITS.url },
    posterUrl: { type: String, maxlength: DEDICATION_LIMITS.url },
  },
  { _id: false }
);

const photoSchema = new Schema<IPhoto>(
  {
    url: { type: String, required: true, maxlength: DEDICATION_LIMITS.url },
    caption: { type: String, maxlength: DEDICATION_LIMITS.photoCaption },
    note: { type: String, maxlength: DEDICATION_LIMITS.photoNote },
    cropX: { type: Number, min: 0, max: 100 },
    cropY: { type: Number, min: 0, max: 100 },
    scale: { type: Number, min: 100, max: 300 },
  },
  { _id: false }
);

const dedicationPageSchema = new Schema<IDedicationPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    station: { type: stationSchema, default: () => ({}) },
    sender: { type: personSchema, default: () => ({}) },
    recipient: { type: personSchema, default: () => ({}) },
    segments: { type: [segmentSchema], default: [] },
    signOff: { type: String, default: "", maxlength: DEDICATION_LIMITS.signOff },
    photos: { type: [photoSchema], default: [] },
    letter: { type: String, default: "", maxlength: DEDICATION_LIMITS.letter },
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the hook for why it is not done in the controller.
    senderName: { type: String, default: "", maxlength: DEDICATION_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: DEDICATION_LIMITS.name },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dedicationPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is
  // the one someone forgets — a renamed sender would keep their old dashboard
  // row forever with no visible error anywhere.
  this.senderName = (this.sender?.name ?? "").slice(0, DEDICATION_LIMITS.name);
  this.recipientName = (this.recipient?.name ?? "").slice(0, DEDICATION_LIMITS.name);
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

dedicationPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IDedicationPage>("DedicationPage", dedicationPageSchema);
