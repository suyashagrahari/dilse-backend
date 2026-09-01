// ─── A follow-up we sent about an unpublished draft ──────────────────────────
//
// One row per email actually sent. Its real job is not history — it is to stop
// the same person being written to twice about the same page, which for
// unsolicited mail is the difference between attentive and spam.
//
// ── WHY THE PAGE IS ADDRESSED BY (templateType, pageId) ─────────────────────
//
// Unlike `PageFeedback`, which keys on the published URL, a draft HAS no URL —
// not being published is the whole point. The pair is what every admin surface
// already uses to address a page across the 43 collections, and it survives the
// page later being published and gaining a URL.

import mongoose, { Schema, Document } from "mongoose";

export const NUDGE_SUBJECT_MAX = 200;
export const NUDGE_BODY_MAX = 6000;

export interface IDraftNudge extends Document {
  userId: mongoose.Types.ObjectId;
  userName: string;
  userEmail: string;

  templateType: string;
  templateLabel: string;
  pageId: mongoose.Types.ObjectId;

  /** The classified reason at the time of sending, for looking back. */
  stallReason: string;
  completeness: number;

  subject: string;
  body: string;
  sentAt: Date;
  sentByEmail: string;
  aiAssisted: boolean;
  /** SES's id for the accepted message. Absent when SES was not configured. */
  sesMessageId: string;

  createdAt: Date;
  updatedAt: Date;
}

const draftNudgeSchema = new Schema<IDraftNudge>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, default: "", trim: true, maxlength: 160 },
    userEmail: { type: String, default: "", trim: true, lowercase: true, maxlength: 180, index: true },

    templateType: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    templateLabel: { type: String, default: "", trim: true, maxlength: 160 },
    pageId: { type: Schema.Types.ObjectId, required: true, index: true },

    stallReason: { type: String, default: "", maxlength: 60 },
    completeness: { type: Number, default: 0, min: 0, max: 100 },

    subject: { type: String, required: true, maxlength: NUDGE_SUBJECT_MAX },
    body: { type: String, required: true, maxlength: NUDGE_BODY_MAX },
    sentAt: { type: Date, default: Date.now, index: true },
    sentByEmail: { type: String, default: "", lowercase: true, trim: true },
    aiAssisted: { type: Boolean, default: false },
    sesMessageId: { type: String, default: "" },
  },
  { timestamps: true }
);

// One follow-up per draft. The controller checks this before generating, so the
// panel can grey the row out rather than letting somebody write an email that
// the write then rejects.
//
// NOT unique on userId alone: a person with four abandoned drafts across four
// templates is four separate conversations. The per-user cooldown that stops
// those arriving as four emails in one afternoon lives in the controller, where
// it can be explained to whoever is being stopped.
draftNudgeSchema.index({ pageId: 1 }, { unique: true });
draftNudgeSchema.index({ userId: 1, sentAt: -1 });

export default mongoose.model<IDraftNudge>("DraftNudge", draftNudgeSchema);
