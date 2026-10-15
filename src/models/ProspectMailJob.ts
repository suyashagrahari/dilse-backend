// ─── One queued email to one prospect ───────────────────────────────────────
//
// Pressing Send on a selection of 50 does not send 50 emails. It writes 50 of
// these, and the queue worker (services/prospectQueue.service) sends them one
// at a time, spaced out and under a rolling daily cap, so a new sending
// pattern never looks like a burst. Each row is rendered for ITS recipient at
// send time — never a To/CC/BCC list.
//
// The partial unique index allows at most one live (queued or sending) job per
// prospect, so a double-click, two tabs, or two admins cannot queue the same
// person twice.

import mongoose, { Document, Schema } from "mongoose";

export const JOB_STATES = ["queued", "sending", "sent", "failed", "cancelled", "skipped"] as const;
export type JobState = (typeof JOB_STATES)[number];
export const JOB_KINDS = ["initial", "followup", "reply"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface IProspectMailJob extends Document {
  prospectId: mongoose.Types.ObjectId;
  batchId: string;
  kind: JobKind;
  /** The template as approved — merge fields still in it. */
  subject: string;
  body: string;
  aiAssisted: boolean;
  state: JobState;
  /**
   * True exactly while queued or sending. A plain boolean rather than a
   * partial index on `state: {$in: …}`, which older MongoDB servers refuse.
   */
  live?: boolean;
  attempts: number;
  /** Not before this moment (retry backoff). */
  notBefore: Date;
  error: string;
  sentAt?: Date;
  providerMessageId: string;
  via: "" | "ses" | "stub";
  byEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IProspectMailJob>(
  {
    prospectId: { type: Schema.Types.ObjectId, ref: "InfluencerProspect", required: true, index: true },
    batchId: { type: String, required: true, index: true },
    kind: { type: String, enum: JOB_KINDS, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 6000 },
    aiAssisted: { type: Boolean, default: false },
    state: { type: String, enum: JOB_STATES, default: "queued", index: true },
    live: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 },
    notBefore: { type: Date, default: Date.now },
    error: { type: String, default: "", maxlength: 600 },
    sentAt: { type: Date, index: true },
    providerMessageId: { type: String, default: "" },
    via: { type: String, enum: ["", "ses", "stub"], default: "" },
    byEmail: { type: String, default: "", lowercase: true, trim: true },
  },
  { timestamps: true }
);

jobSchema.index({ state: 1, notBefore: 1, createdAt: 1 });
jobSchema.index(
  { prospectId: 1 },
  { unique: true, name: "one_live_job_per_prospect", partialFilterExpression: { live: true } }
);

export default mongoose.model<IProspectMailJob>("ProspectMailJob", jobSchema);
