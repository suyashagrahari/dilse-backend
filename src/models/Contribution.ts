import mongoose, { Schema, Document } from "mongoose";

/**
 * A contribution is something a *friend* added to somebody else's published
 * page: a review on the product template, a comment on the watch template, a
 * tag on the caller template. One collection serves all of them.
 *
 * Two rules the rest of the system leans on:
 *
 *   1. `status` starts at "pending" and only the page owner can move it. A
 *      contributor cannot publish themselves onto a stranger's gift.
 *   2. `ownerId` is denormalised at create time. Moderation queries then answer
 *      "is this mine?" from the contribution alone, without loading the page —
 *      which matters because the page lives in one of several collections and
 *      re-resolving it on every approve would mean a registry lookup per row.
 */

export type ContributionStatus = "pending" | "published" | "rejected";

export interface IContribution extends Document {
  /** Template slug the page belongs to: "product" | "watch" | "call". */
  pageType: string;
  /** The page document, in the collection `pageType` names. */
  pageId: mongoose.Types.ObjectId;
  /** How contributors address the page — the only id a friend ever sees. */
  shareId: string;
  /** Denormalised page owner. The sole authority on who may moderate this row. */
  ownerId: mongoose.Types.ObjectId;
  /** "review" | "comment" | "tag" — decides how `payload` is shaped. */
  kind: string;
  submitterName: string;
  /**
   * Kind-specific fields, already validated and key-stripped by the controller.
   * Mixed in the schema; never the raw request body.
   */
  payload: Record<string, unknown>;
  status: ContributionStatus;
  /** The word filter tripped. A hint for the human queue, never a gate. */
  flagged: boolean;
  /** Per-submission key from the client. See the unique index below. */
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Hard cap on the display name. Mirrored by the controller before it ever gets here. */
export const SUBMITTER_NAME_MAX = 30;

const contributionSchema = new Schema<IContribution>(
  {
    pageType:       { type: String, required: true },
    pageId:         { type: Schema.Types.ObjectId, required: true },
    shareId:        { type: String, required: true },
    ownerId:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind:           { type: String, required: true },
    submitterName:  { type: String, required: true, maxlength: SUBMITTER_NAME_MAX, trim: true },
    payload:        { type: Schema.Types.Mixed, default: {} },
    status:         { type: String, enum: ["pending", "published", "rejected"], default: "pending", required: true },
    flagged:        { type: Boolean, default: false },
    idempotencyKey: { type: String, required: true },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
//
// The contributor link is REUSABLE — one link, opened by twenty friends — so
// there is no token to burn and no single-use anything. Dedupe happens here
// instead: the client mints a key per submission, and a retry, a double-tap, or
// a flaky network replaying the POST collides on this index. The controller
// turns that collision into "here is the row you already created", so a double
// submit is a no-op rather than a second review.
contributionSchema.index({ shareId: 1, idempotencyKey: 1 }, { unique: true });

// The public read: published rows for one page. Also the moderation queue's
// index, which filters the same shareId on status "pending".
contributionSchema.index({ shareId: 1, status: 1 });

// No standalone `shareId` index: it is the leading field of both compound
// indexes above, so MongoDB already serves a bare shareId lookup from either.
// A third index would cost a write per insert and buy nothing.

export default mongoose.model<IContribution>("Contribution", contributionSchema);
