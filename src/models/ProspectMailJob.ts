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
/**
 * initial   the first email to someone we have never written to.
 * followup  a nudge in the SAME thread ("Re: <subject>", In-Reply-To/References).
 * fresh     "New email": a new subject to someone already emailed. Its own
 *           thread in their inbox (no In-Reply-To), the same conversation in
 *           the admin (appended to the prospect's EmailThread).
 * reply     an answer after they wrote back.
 */
export const JOB_KINDS = ["initial", "followup", "fresh", "reply"] as const;
export type JobKind = (typeof JOB_KINDS)[number];
/**
 * How the email is dressed. "personal" — plain text from a person's address,
 * no List-Unsubscribe, no footer (Gmail Primary). "classic" — the original
 * multipart email with the unsubscribe footer and headers.
 */
export const OUTREACH_STYLES = ["personal", "classic"] as const;
export type OutreachStyle = (typeof OUTREACH_STYLES)[number];
/**
 * What a personal first email (and its follow-ups) is for.
 *
 * connect  (default) a short hello from Yash asking to connect: no company,
 *          no product, no numbers, no links — just them, "I'm Yash", and one
 *          easy question. Its follow-ups stay a gentle bump. The real context
 *          (what SubhSandesh makes, the numbers, the paid reel) comes in the
 *          REPLY, once they have written back.
 * pitch    the earlier first email: who we are, the reel idea, numbers.
 * Classic mail is always "pitch".
 */
export const FIRST_TOUCHES = ["connect", "pitch"] as const;
export type FirstTouch = (typeof FIRST_TOUCHES)[number];

export interface IProspectMailJob extends Document {
  prospectId: mongoose.Types.ObjectId;
  batchId: string;
  kind: JobKind;
  style: OutreachStyle;
  /** Connect (a hello, no pitch) or pitch. Rows from before Connect existed were pitches. */
  touch?: FirstTouch;
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
  /** Drawn at send time: how long the queue waits after THIS send (jitter). */
  gapAfterMs?: number;
  /**
   * The admin confirmed sending to someone marked "not interested". Without
   * it the worker skips them (their "no" may have landed after queueing).
   */
  override?: boolean;
  /**
   * The traction proof this email quotes, as it was when Send was pressed (a
   * snapshot: editing or deleting the proof later changes nothing already
   * queued). Its numbers are the only ones the send-time linter allows;
   * `attach` puts the screenshot inline.
   */
  proof?: {
    id: string;
    imageUrl: string;
    source: "search_console" | "google_analytics" | "other";
    periodLabel: string;
    stats: { label: string; value: string }[];
    width?: number;
    height?: number;
    attach: boolean;
  } | null;
  byEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobSchema = new Schema<IProspectMailJob>(
  {
    prospectId: { type: Schema.Types.ObjectId, ref: "InfluencerProspect", required: true, index: true },
    batchId: { type: String, required: true, index: true },
    kind: { type: String, enum: JOB_KINDS, required: true },
    // Rows written before personal mode existed were all classic.
    style: { type: String, enum: OUTREACH_STYLES, default: "classic" },
    touch: { type: String, enum: FIRST_TOUCHES, default: "pitch" },
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
    gapAfterMs: { type: Number },
    override: { type: Boolean, default: false },
    proof: {
      type: new Schema(
        {
          id: { type: String, default: "" },
          imageUrl: { type: String, default: "" },
          source: { type: String, enum: ["search_console", "google_analytics", "other"], default: "other" },
          periodLabel: { type: String, default: "" },
          stats: { type: [{ label: String, value: String, _id: false }], default: [] },
          width: { type: Number },
          height: { type: Number },
          attach: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: null,
    },
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
