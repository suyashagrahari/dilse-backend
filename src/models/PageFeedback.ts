// ─── What a creator thought, the moment they finished ────────────────────────
//
// One row per page published: a star rating, optionally a few words, and the
// support conversation that may follow. Written by the creator's own browser
// straight after a successful publish, read by a super admin in
// /admin/feedback.
//
// ── WHY THIS IS KEYED ON THE PAGE URL AND NOT A pageId ──────────────────────
//
// The obvious shape is `{ templateType, pageId }`, matching every other
// per-page record in here. It was rejected because of where the feedback is
// raised from: `openShareSheet`, the one call that all forty-three editors
// already make on publish. That payload carries the published URL and the
// template slug; it does not carry the page's database id, and adding it would
// mean editing forty-three editor hooks — the exact per-template plumbing the
// share bus exists to avoid, with the exact failure mode it exists to avoid
// (forget one, and that template silently never asks).
//
// The URL is unique per page and is also the only identifier a super admin
// actually wants: it is clickable. So it is what gets stored.
//
// The cost of that choice is that this row cannot be joined back to the page
// document, so it cannot follow the page when it is deleted. That is acceptable
// here — feedback is about the EXPERIENCE OF CREATING, not about the page, and
// it stays useful after the page is gone.
//
// ── WHY THE USER IS DENORMALISED ────────────────────────────────────────────
//
// `userName` and `userEmail` are copied in at write time rather than populated
// from `userId` on read. Two reasons: the admin list is a table of a hundred
// rows and should not fan out into a hundred user lookups, and — more
// importantly — a reply is an EMAIL. The address that gets written to is the one
// captured with the feedback, so what a super admin approves in the panel is
// provably what gets sent, even if the account is renamed or deleted in
// between. `userId` is kept alongside for grouping, not for reading identity.

import mongoose, { Schema, Document } from "mongoose";

export const RATINGS = [1, 2, 3, 4, 5] as const;
export const FEEDBACK_STATUSES = ["new", "read", "replied"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const COMMENT_MAX = 2000;
export const REPLY_MAX = 6000;
export const SUBJECT_MAX = 200;
export const NOTES_MAX = 2000;

export interface IFeedbackReply {
  subject: string;
  body: string;
  sentAt: Date;
  /** Which staff member pressed Send. Not the AI — see `aiAssisted`. */
  sentByEmail: string;
  /**
   * True when the text started life as a generated draft.
   *
   * Recorded because the two are not the same thing to audit later: a human
   * wrote this one from scratch, that one was a draft a human read and approved.
   * Nothing in the product treats them differently; this is for looking back.
   */
  aiAssisted: boolean;
}

export interface IPageFeedback extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;
  templateSlug: string;
  templateLabel: string;
  pageUrl: string;
  rating: number;
  comment: string;
  status: FeedbackStatus;
  adminNotes: string;
  replies: IFeedbackReply[];
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const replySchema = new Schema<IFeedbackReply>(
  {
    subject: { type: String, required: true, maxlength: SUBJECT_MAX },
    body: { type: String, required: true, maxlength: REPLY_MAX },
    sentAt: { type: Date, default: Date.now },
    sentByEmail: { type: String, default: "", lowercase: true, trim: true },
    aiAssisted: { type: Boolean, default: false },
  },
  { _id: false }
);

const pageFeedbackSchema = new Schema<IPageFeedback>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: { type: String, default: "", trim: true, maxlength: 160 },
    userEmail: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      maxlength: 180,
      index: true,
    },

    /** The editor route — "happy-rakshabandhan-to-brother", not "rakhi-brother". */
    templateSlug: { type: String, default: "", trim: true, lowercase: true, maxlength: 120, index: true },
    /** Resolved server-side from the catalog, so the client cannot mislabel it. */
    templateLabel: { type: String, default: "", trim: true, maxlength: 160 },

    pageUrl: { type: String, default: "", trim: true, maxlength: 500 },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number of stars",
      },
      index: true,
    },
    comment: { type: String, default: "", trim: true, maxlength: COMMENT_MAX },

    status: {
      type: String,
      enum: FEEDBACK_STATUSES,
      default: "new",
      index: true,
    },
    adminNotes: { type: String, default: "", maxlength: NOTES_MAX },
    replies: { type: [replySchema], default: [] },

    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "", maxlength: 400 },
  },
  { timestamps: true }
);

// One rating per page, per person.
//
// This is what makes the client's "ask once per page" promise true even when
// somebody clears their browser storage or publishes from a second device: the
// second submission updates the first row instead of creating a duplicate. It
// is deliberately NOT unique on `userId` alone — the product decision is that
// every new page they publish gets its own ask, because the whole point is
// seeing whether one specific template disappoints people.
pageFeedbackSchema.index({ userId: 1, pageUrl: 1 }, { unique: true });

// The admin list is "newest first", filtered by status or stars.
pageFeedbackSchema.index({ createdAt: -1 });
pageFeedbackSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IPageFeedback>("PageFeedback", pageFeedbackSchema);
