// ─── One email sent by a super admin to many creators at once ────────────────
//
// Written by /admin/outreach. A row is created the moment Send is confirmed and
// then filled in as the mail goes out, one recipient at a time, so the panel can
// show live progress and the history can answer "who got what, and when".
//
// ── WHY THE RECIPIENTS LIVE ON THE ROW ──────────────────────────────────────
//
// The list is frozen at confirm time: the addresses a super admin saw in the
// confirmation dialog are exactly the addresses stored here, and exactly the
// ones mailed. Re-running the filter while sending would let somebody who
// signed up mid-send receive mail nobody approved for them.
//
// It also makes a send resumable. If the process restarts half way through,
// the rows still `pending` are the ones that never went, and a resume sends to
// those and nobody else — never a second copy to anyone already `sent`.

import mongoose, { Schema, Document } from "mongoose";

export const BROADCAST_STATUSES = ["sending", "sent", "partial", "failed", "interrupted"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const RECIPIENT_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export interface IBroadcastRecipient {
  userId: mongoose.Types.ObjectId;
  email: string;
  name: string;
  status: RecipientStatus;
  error?: string;
  messageId?: string;
  sentAt?: Date;
}

export interface IBroadcast extends Document {
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  /** What the super admin asked the AI for. Empty when the email was typed by hand. */
  brief: string;
  /** A human description of who it went to, e.g. "Rated 1–3★ · verified". */
  audienceLabel: string;
  /** The filter that produced the list, for looking back. Not re-run. */
  filters: Record<string, unknown>;
  recipients: IBroadcastRecipient[];
  total: number;
  sentCount: number;
  failedCount: number;
  status: BroadcastStatus;
  createdBy: mongoose.Types.ObjectId;
  createdByEmail: string;
  startedAt: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const recipientSchema = new Schema<IBroadcastRecipient>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "" },
    status: { type: String, enum: RECIPIENT_STATUSES, default: "pending" },
    error: { type: String },
    messageId: { type: String },
    sentAt: { type: Date },
  },
  { _id: false }
);

const broadcastSchema = new Schema<IBroadcast>(
  {
    subject: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 8000 },
    ctaLabel: { type: String, default: "", maxlength: 60 },
    ctaUrl: { type: String, default: "", maxlength: 500 },
    brief: { type: String, default: "", maxlength: 2000 },
    audienceLabel: { type: String, default: "", maxlength: 300 },
    filters: { type: Schema.Types.Mixed, default: {} },
    recipients: { type: [recipientSchema], default: [] },
    total: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: BROADCAST_STATUSES, default: "sending", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByEmail: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { timestamps: true }
);

broadcastSchema.index({ createdAt: -1 });
// "When was this person last emailed?" — the fatigue filter in the audience.
broadcastSchema.index({ "recipients.userId": 1, "recipients.status": 1 });

export default mongoose.model<IBroadcast>("Broadcast", broadcastSchema);
