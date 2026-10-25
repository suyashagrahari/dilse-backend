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
  | "template.set_order"
  | "template.clear_order"
  // A curated place's template list (/admin/places), and its reset to automatic.
  | "template.set_collection"
  | "template.clear_collection"
  | "template.grant_access"
  | "template.revoke_access"
  | "feedback.reply_sent"
  | "draft.followup_sent"
  // A message attributed to a creator that a staff member typed in by hand.
  // See adminThread.controller.ts — the one write in the conversation view that
  // puts words in somebody else's mouth, so it is recorded with who did it.
  | "thread.inbound_pasted"
  | "thread.reply_sent"
  // One email to many creators from /admin/outreach, and the opt-out switch
  // that keeps somebody out of every future one.
  | "outreach.broadcast_sent"
  | "outreach.opt_out"
  // The wishlist sale countdown in /admin/wishlist.
  | "promo.start"
  | "promo.stop"
  | "impersonation.start"
  | "impersonation.end"
  // Influencer programme: the global rate, one influencer's rate/status, and
  // money recorded as sent to them.
  | "influencer.settings"
  // International pricing switch and the INR-per-USD rate.
  | "payment.settings"
  // Season campaign (Valentine / Halloween / off) and its real-price sale.
  | "season.settings"
  // A reply to a Contact-page message, sent as support@.
  | "contact.reply_sent"
  | "influencer.update"
  | "influencer.payout_recorded"
  | "influencer.payout_deleted"
  // An email to an influencer from /admin/influencers/:id, sent as
  // influencer-support@. Records whether it began as an AI draft.
  | "influencer.mail_sent"
  // Outreach to creators who have not joined (/admin/influencers/prospects):
  // adding, importing, editing, deleting, and emails queued or cancelled.
  | "prospect.add"
  | "prospect.import"
  | "prospect.update"
  | "prospect.delete"
  | "prospect.mail_queued"
  | "prospect.mail_cancelled"
  // Traction screenshots for outreach: uploaded / replaced, numbers confirmed, deleted.
  | "prospect.proof_uploaded"
  | "prospect.proof_confirmed"
  | "prospect.proof_deleted"
  // A super admin's own "Pay like a customer" switch, and "All templates free"
  // granted to / revoked from an account. See config/freeAccess.ts.
  | "superadmin.pays_as_customer"
  | "user.grant_free_access"
  | "user.revoke_free_access"
  // Revenue: opening one user's billing drill-down (personal + payment data),
  // a manual billing statement emailed to them, and closing their account at
  // their request (with what was hidden or deleted).
  | "user.view_billing"
  | "billing.send_statement"
  | "user.close";

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
