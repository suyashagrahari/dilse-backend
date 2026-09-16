import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 *
 * Note what is NOT stored: the "0% spam · verified" label, the tag that renders
 * under the name on the call screen, and the sorted order of the tag list.
 * `spamLabel` and `topTag` derive all three from `spamRisk`, `verified` and the
 * raw counts — storing the label would mean a meter reading and its own caption
 * can disagree, which on this template is the one thing that must never happen.
 */
export const CALL_LIMITS = {
  name: 60,
  number: 32,
  location: 80,
  carrier: 40,
  tag: 48,
  /** "11:47 PM" — a clock label, never a parsed time. */
  time: 16,
  /** "Yesterday" / "Tuesday" / "14 Feb" — free text, never a parsed date. */
  ago: 32,
  duration: 32,
  note: 240,
  /** One revealed line of the answered message. */
  line: 200,
  prompt: 240,
  /** A plain https link. Uploaded media is turned into one before it gets here. */
  url: 2000,
  password: 128,
  maxTags: 12,
  maxLogEntries: 20,
  maxMessageLines: 10,
  /** Nobody has been tagged more times than this; it bounds the count arithmetic. */
  maxTagCount: 1_000_000_000,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 500,
} as const;

/** The four call-direction glyphs, each with its own colour in the log. */
export type CallKind = "missed" | "incoming" | "outgoing" | "rejected";

export const CALL_KINDS: readonly CallKind[] = ["missed", "incoming", "outgoing", "rejected"];

/** One crowd-sourced tag. `count` is how many people submitted it. */
export interface ICallerTag {
  label: string;
  count: number;
}

export interface ICallLogEntry {
  kind: CallKind;
  time: string;
  ago: string;
  /** Absent for missed and rejected calls, which by definition have none. */
  duration?: string;
  /** The line under the entry. Where the joke lives. */
  note?: string;
}

export interface ICaller {
  name: string;
  photoUrl: string;
  number: string;
  location: string;
  carrier: string;
}

export interface ICallPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  /** The friends' write link. A different secret from shareId, on purpose. */
  contribToken: string;
  caller: ICaller;
  /** Whose phone this is. Shown on the lock screen above the call. */
  recipient: { name: string };
  /** Sorted by count descending; the top one is the label under the name. */
  tags: ICallerTag[];
  /** 0–100. The meter renders 0 as an explicit "0% spam", never as an empty bar. */
  spamRisk: number;
  verified: boolean;
  /** An optional voice note that plays instead of a ringtone. null = ringtone. */
  voiceUrl: string | null;
  /** What the caller is calling to say, revealed line by line once answered. */
  message: string[];
  callLog: ICallLogEntry[];
  /** Shown above the "add a tag" box on the published page. */
  contributorPrompt: string;
  /** Whether the published page accepts crowd-sourced tags at all. */
  contributorsEnabled: boolean;
  /**
   * Denormalised by the pre-save hook below, so this template appears on the
   * dashboard alongside the others — `share.controller`'s `getMyCreations` and
   * `getReceivedPages` read flat `senderName`/`recipientName` off every template
   * model, and without these two the row shows up as "Someone".
   *
   * The mapping is crossed on purpose and is not a copy-paste slip. On this
   * template `recipient` is whose phone is ringing — the person who built the
   * page — and `caller` is the person the page is about, whose face fills the
   * screen. So the gift's sender is `recipient.name` and the gift's recipient is
   * `caller.name`, which is the reverse of how the two content fields read.
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

const callerSchema = new Schema<ICaller>(
  {
    name: { type: String, default: "", maxlength: CALL_LIMITS.name },
    photoUrl: { type: String, default: "", maxlength: CALL_LIMITS.url },
    number: { type: String, default: "", maxlength: CALL_LIMITS.number },
    location: { type: String, default: "", maxlength: CALL_LIMITS.location },
    carrier: { type: String, default: "", maxlength: CALL_LIMITS.carrier },
  },
  { _id: false }
);

const recipientSchema = new Schema<{ name: string }>(
  {
    name: { type: String, default: "", maxlength: CALL_LIMITS.name },
  },
  { _id: false }
);

const callerTagSchema = new Schema<ICallerTag>(
  {
    label: { type: String, default: "", maxlength: CALL_LIMITS.tag },
    count: { type: Number, default: 0, min: 0, max: CALL_LIMITS.maxTagCount },
  },
  { _id: false }
);

/**
 * `duration` and `note` carry no default on purpose. Both are optional in the
 * contract and an absent one must stay absent — a stored `duration: ""` on a
 * missed call is a contradiction the log would render literally.
 */
const callLogEntrySchema = new Schema<ICallLogEntry>(
  {
    kind: { type: String, enum: CALL_KINDS, default: "incoming" },
    time: { type: String, default: "", maxlength: CALL_LIMITS.time },
    ago: { type: String, default: "", maxlength: CALL_LIMITS.ago },
    duration: { type: String, maxlength: CALL_LIMITS.duration },
    note: { type: String, maxlength: CALL_LIMITS.note },
  },
  { _id: false }
);

const callPageSchema = new Schema<ICallPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    contribToken: { type: String, unique: true, sparse: true, index: true },
    caller: {
      type: callerSchema,
      default: () => ({ name: "", photoUrl: "", number: "", location: "", carrier: "" }),
    },
    recipient: { type: recipientSchema, default: () => ({ name: "" }) },
    tags: { type: [callerTagSchema], default: [] },
    spamRisk: { type: Number, default: 0, min: 0, max: 100 },
    verified: { type: Boolean, default: false },
    // null is meaningful — it is "ring normally" — so it is the default rather
    // than the empty string every other media field uses.
    voiceUrl: { type: String, default: null, maxlength: CALL_LIMITS.url },
    message: { type: [String], default: [] },
    callLog: { type: [callLogEntrySchema], default: [] },
    contributorPrompt: { type: String, default: "", maxlength: CALL_LIMITS.prompt },
    contributorsEnabled: { type: Boolean, default: true },
    // Denormalised for the dashboard. Written by the pre-save hook, never by a
    // caller — see the interface for why the two are crossed.
    senderName: { type: String, default: "", maxlength: CALL_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: CALL_LIMITS.name },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

callPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (!this.contribToken) this.contribToken = randomUUID();
  // Denormalise the dashboard names in ONE place. Doing it in the create and
  // update handlers instead means two copies of the same rule, and update is the
  // one someone forgets — a renamed caller would keep its old dashboard row
  // forever with no visible error anywhere.
  this.senderName = (this.recipient?.name ?? "").slice(0, CALL_LIMITS.name);
  this.recipientName = (this.caller?.name ?? "").slice(0, CALL_LIMITS.name);
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

callPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ICallPage>("CallPage", callPageSchema);
