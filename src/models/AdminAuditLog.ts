import mongoose, { Schema, Document } from "mongoose";

/**
 * Every privileged action a super admin takes, written before the action is
 * reported as done.
 *
 * ── APPEND-ONLY ─────────────────────────────────────────────────────────────
 *
 * There is deliberately no update or delete path anywhere in the codebase for
 * this collection, and the schema is strict so a caller cannot smuggle extra
 * keys in. A log the actor can edit answers the question "what happened?" with
 * "whatever the actor last decided", which is the same as having no log.
 *
 * Reads are what make it worth writing, so `getAuditLog` exposes it in the
 * admin UI rather than leaving it as a table only a mongo shell ever sees.
 */

export type AuditAction =
  | "user.view_profile"
  | "user.reveal_password"
  | "user.suspend"
  | "user.ban"
  | "user.reinstate"
  | "user.force_logout"
  | "user.change_role"
  | "user.adjust_points"
  | "page.view_content"
  | "page.edit_content"
  | "page.reset_password"
  | "page.clear_password"
  | "page.delete"
  | "template.set_pricing"
  | "template.clear_pricing"
  | "template.set_tier"
  | "template.clear_tier"
  | "template.grant_access"
  | "template.revoke_access"
  | "feedback.reply_sent"
  | "draft.followup_sent"
  // A message attributed to a creator that a staff member typed in by hand.
  // See adminThread.controller.ts — the one write in the conversation view that
  // puts words in somebody else's mouth, so it is recorded with who did it.
  | "thread.inbound_pasted"
  | "thread.reply_sent"
  | "impersonation.start"
  | "impersonation.end";

export interface IAdminAuditLog extends Document {
  actorId: mongoose.Types.ObjectId;
  actorEmail: string;
  action: AuditAction;
  targetUserId?: mongoose.Types.ObjectId;
  targetUserEmail?: string;
  targetPageId?: string;
  targetTemplateType?: string;
  /** Field-level before/after. Never holds a plaintext password — see `redact`. */
  changes?: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorEmail: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    targetUserEmail: { type: String },
    targetPageId: { type: String },
    targetTemplateType: { type: String },
    changes: { type: Schema.Types.Mixed },
    reason: { type: String },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: true }
);

// The two questions actually asked of this collection: "what has this admin
// been doing?" and "who has touched this user?" — both newest-first.
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });

export default mongoose.model<IAdminAuditLog>("AdminAuditLog", adminAuditLogSchema);
