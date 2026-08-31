// ─── Early access to a template ──────────────────────────────────────────────
//
// One row per grant that is in force: this user may use this template even
// though it is hidden from everyone else.
//
// The use case is a pre-release. A template is finished, held back from the
// public with `TemplateVisibility`, and handed to a client or a tester first.
//
// ── WHY REVOKING DELETES THE ROW ────────────────────────────────────────────
//
// So the collection is a list of grants that are IN FORCE, the way
// `TemplateVisibility` is a list of decisions that have been made. A
// `revoked: true` tombstone would mean every read has to filter for it and every
// count is wrong by default — and the one query that matters here, "who can see
// this template", is exactly the one that would silently include revoked people
// the first time somebody forgot the filter.
//
// The audit log is where the history lives. `services/adminAudit.ts` records
// both the grant and the revoke with who did it, so deleting the row loses
// nothing that anybody needs to answer later.
//
// ── WHY NOT AN ARRAY ON THE USER ────────────────────────────────────────────
//
// `user.earlyAccess: [String]` was the obvious cheap version, and it is what the
// client effectively receives — `/auth/me` returns exactly that array. But as
// STORAGE it loses who granted it and when, which on a privileged action in a
// codebase that audits every other one is the first thing you will be asked. It
// also makes "who has access to this template" a scan of every user document
// rather than an index hit.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplateGrant extends Document {
  userId: mongoose.Types.ObjectId;
  slug: string;
  grantedBy: mongoose.Types.ObjectId;
  grantedByEmail: string;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateGrantSchema = new Schema<ITemplateGrant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    grantedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /**
     * Denormalised so the admin list renders without joining User for every row.
     * A super admin's email does not change often, and if it did, the audit log
     * still holds the id.
     */
    grantedByEmail: { type: String, default: "" },
    /** Free text: "Sharma wedding demo, 3 Sep". In six weeks this is the answer
     *  to "why does this client have access to this". */
    note: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

// One grant per (user, template). Granting twice is an upsert, not two rows —
// which is what lets the endpoint be idempotent without a read-then-write race.
templateGrantSchema.index({ userId: 1, slug: 1 }, { unique: true });

export default mongoose.model<ITemplateGrant>("TemplateGrant", templateGrantSchema);
