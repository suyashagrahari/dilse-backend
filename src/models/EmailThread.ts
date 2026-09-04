// ─── One email conversation with one creator ────────────────────────────────
//
// A thread is the unit a human thinks in: "what have we said to Asha about her
// Rakhi page, and what did she say back". Messages are embedded rather than
// kept in their own collection, because a thread is never read one message at a
// time and no conversation here will run to hundreds of messages.
//
// ── WHY THIS EXISTS BESIDE DraftNudge ──────────────────────────────────────
//
// `DraftNudge` answers exactly one question — "have we already written to this
// person about this page?" — and it is the unique index that enforces the
// no-double-contact rule. It is deliberately NOT being widened into a
// conversation log: the moment a row holds many messages it can no longer be
// one unique row per page, and that constraint is the only thing standing
// between an unsolicited follow-up and spam.
//
// So `DraftNudge` stays the ledger of first contact, and this holds the
// conversation. `sendDraftEmail` writes both.
//
// ── WHY A THREAD CAN HAVE NO PAGE ──────────────────────────────────────────
//
// `pageId` is optional because of inbound mail. When somebody replies and we
// cannot work out which conversation it belongs to — they wrote to the address
// fresh, or their client stripped the headers and changed the subject — the
// reply still has to be READABLE. Dropping it would be the worst outcome: the
// footer of every follow-up promises a reply will be read. An unmatched reply
// becomes a thread of its own with `kind: "inbound"`, and shows in the panel
// under Unmatched.

import mongoose, { Schema, Document } from "mongoose";

export const THREAD_SUBJECT_MAX = 300;
export const THREAD_BODY_MAX = 60_000;

/** Where a message came from, which decides how much its ids can be trusted. */
export type MessageSource = "ses" | "resend" | "inbound-ses" | "manual";

export interface IThreadMessage {
  direction: "outbound" | "inbound";
  subject: string;
  /** What the person wrote, with quoted history removed. Displayed. */
  body: string;
  /** The untrimmed original, kept because the trim is a heuristic. */
  rawBody: string;
  html: string;

  at: Date;
  /** Which super admin sent it. Empty for inbound. */
  byEmail: string;
  /**
   * The address this message left FROM.
   *
   * Distinct from `byEmail`, which is the admin who typed it. Replies can now
   * go out as feedback@ or support@, and "which address did we answer them
   * from" is not answerable after the fact without recording it — the From on
   * the sent mail is not stored anywhere else.
   *
   * Empty on every message written before this existed, and on inbound mail,
   * where the sender is the thread's own `userEmail`.
   */
  fromAddress: string;
  aiAssisted: boolean;

  /** SES's own id for the accepted message, as returned by the API. */
  providerMessageId: string;
  /** The RFC `Message-ID` header. See emailThread.service for the caveat. */
  rfcMessageId: string;
  rfcMessageIdSource: "received" | "reconstructed" | "";
  inReplyTo: string;
  references: string[];

  source: MessageSource;
  /** Set when the quoted-history trim actually removed something. */
  trimmed: boolean;
}

export interface IEmailThread extends Document {
  /** Unique. `draft:<pageId>:<seq>` for follow-ups, `inbound:<id>` otherwise. */
  threadKey: string;
  kind: "draft" | "feedback" | "inbound";

  userId?: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;

  pageId?: mongoose.Types.ObjectId;
  templateType: string;
  templateLabel: string;

  /** The subject the thread opened with, WITHOUT any `Re:`. The matching key. */
  subject: string;
  subjectKey: string;
  /** Which conversation about this page — 1 unless somebody started a new one. */
  seq: number;

  messages: IThreadMessage[];

  lastMessageAt: Date;
  lastDirection: "outbound" | "inbound";
  /** Message count, denormalised so the list does not have to load bodies. */
  messageCount: number;
  /** An inbound message nobody has opened yet. Drives the panel's badge. */
  unread: boolean;
  status: "open" | "closed";
  /** Free-text, super-admin only. Never sent. */
  notes: string;

  createdAt: Date;
  updatedAt: Date;
}

const threadMessageSchema = new Schema<IThreadMessage>(
  {
    direction: { type: String, enum: ["outbound", "inbound"], required: true },
    subject: { type: String, default: "", maxlength: THREAD_SUBJECT_MAX },
    body: { type: String, default: "", maxlength: THREAD_BODY_MAX },
    rawBody: { type: String, default: "", maxlength: THREAD_BODY_MAX },
    html: { type: String, default: "", maxlength: THREAD_BODY_MAX },

    at: { type: Date, default: Date.now },
    byEmail: { type: String, default: "", lowercase: true, trim: true },
    fromAddress: { type: String, default: "", lowercase: true, trim: true, maxlength: 180 },
    aiAssisted: { type: Boolean, default: false },

    providerMessageId: { type: String, default: "" },
    rfcMessageId: { type: String, default: "", index: true },
    rfcMessageIdSource: { type: String, enum: ["received", "reconstructed", ""], default: "" },
    inReplyTo: { type: String, default: "" },
    references: { type: [String], default: [] },

    source: {
      type: String,
      enum: ["ses", "resend", "inbound-ses", "manual"],
      default: "ses",
    },
    trimmed: { type: Boolean, default: false },
  },
  { _id: true }
);

const emailThreadSchema = new Schema<IEmailThread>(
  {
    threadKey: { type: String, required: true, unique: true, trim: true, maxlength: 200 },
    kind: { type: String, enum: ["draft", "feedback", "inbound"], default: "draft", index: true },

    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    userName: { type: String, default: "", trim: true, maxlength: 160 },
    userEmail: { type: String, default: "", trim: true, lowercase: true, maxlength: 180, index: true },

    pageId: { type: Schema.Types.ObjectId, index: true },
    templateType: { type: String, default: "", trim: true, lowercase: true, maxlength: 120 },
    templateLabel: { type: String, default: "", trim: true, maxlength: 160 },

    subject: { type: String, default: "", maxlength: THREAD_SUBJECT_MAX },
    subjectKey: { type: String, default: "", maxlength: THREAD_SUBJECT_MAX, index: true },
    seq: { type: Number, default: 1, min: 1 },

    messages: { type: [threadMessageSchema], default: [] },

    lastMessageAt: { type: Date, default: Date.now, index: true },
    lastDirection: { type: String, enum: ["outbound", "inbound"], default: "outbound" },
    messageCount: { type: Number, default: 0 },
    unread: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    notes: { type: String, default: "", maxlength: 4000 },
  },
  { timestamps: true }
);

// The list view: newest activity first, optionally narrowed to one person.
emailThreadSchema.index({ lastMessageAt: -1 });
emailThreadSchema.index({ userEmail: 1, lastMessageAt: -1 });
// Inbound matching by subject when the headers gave us nothing to go on.
emailThreadSchema.index({ userEmail: 1, subjectKey: 1, lastMessageAt: -1 });
// "Which conversations exist about this page", for the drafts panel.
emailThreadSchema.index({ pageId: 1, seq: -1 });

export default mongoose.model<IEmailThread>("EmailThread", emailThreadSchema);
