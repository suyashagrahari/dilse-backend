// ─── A creator we would like to invite, who has not joined yet ──────────────
//
// The super admin adds people by hand (name, email, Instagram) from
// /admin/influencers/prospects, writes to them, and the row tracks where each
// one stands. It is deliberately NOT a User: a prospect has no account, never
// signed anything, and must never appear in any list that mails users.
//
// ── THE STATUS LADDER ──────────────────────────────────────────────────────
//
//   new ─► contacted ─► replied ─► joined
//              │            │
//              └────────────┴─► not_interested · bounced · unsubscribed
//
// `joined` is set by the influencer join flow, never by hand. The last three
// are terminal for mail: `canEmailProspect` refuses them, server-side, for
// every kind of send. They are kept even when the admin deletes the row (a
// soft delete), so re-adding the same address cannot quietly undo an
// unsubscribe.
//
// ── CONTACT LIMITS ─────────────────────────────────────────────────────────
//
// No fixed cap: after the first email the admin may always send another — a
// follow-up in the same thread, a new email, or a reply. Hard blocks are only
// unsubscribed / bounced / complained / joined; "not interested" needs an
// explicit confirm. The counts (`contactCount`, `followUpCount`) and dates
// are tracked here rather than inferred from the thread, so a pasted or
// mis-threaded message can never reset them. See canEmailProspect.

import mongoose, { Document, Schema } from "mongoose";

export const PROSPECT_STATUSES = [
  "new",
  "contacted",
  "replied",
  "joined",
  "not_interested",
  "bounced",
  "unsubscribed",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

/** Statuses that may never be emailed again. */
export const SUPPRESSED_STATUSES: readonly ProspectStatus[] = ["not_interested", "bounced", "unsubscribed", "joined"];

export const FOLLOWER_RANGES = ["", "<10k", "10k-50k", "50k-200k", "200k-1M", "1M+"] as const;
export type FollowerRange = (typeof FOLLOWER_RANGES)[number];

export const PROSPECT_NAME_MAX = 80;
export const PROSPECT_NOTE_MAX = 400;
export const PROSPECT_NICHE_MAX = 60;

export interface IInfluencerProspect extends Document {
  name: string;
  email: string;
  /** Lowercased handle without "@", or "". */
  instagram: string;
  /** Free text the admin wrote — the ONLY thing the AI may say about them. */
  note: string;
  niche: string;
  followerRange: FollowerRange;

  status: ProspectStatus;
  source: "manual" | "csv";
  createdBy?: mongoose.Types.ObjectId;
  createdByEmail: string;

  contactCount: number;
  lastContactedAt?: Date;
  initialSentAt?: Date;
  followUpSentAt?: Date;
  /** Follow-ups sent so far. The first carries no link; later ones may. */
  followUpCount?: number;
  lastReplyAt?: Date;

  threadId?: mongoose.Types.ObjectId;
  /**
   * The style of the first email, set when it is sent. A follow-up or reply
   * keeps it, so the conversation comes from the same sender throughout.
   */
  outreachStyle?: "personal" | "classic";
  /** Secret in the unsubscribe link. Unique, never shown in the admin UI. */
  unsubscribeToken: string;
  unsubscribedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;

  joinedUserId?: mongoose.Types.ObjectId;
  joinedAt?: Date;

  /** Soft delete — see the header. */
  deletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const prospectSchema = new Schema<IInfluencerProspect>(
  {
    name: { type: String, required: true, trim: true, maxlength: PROSPECT_NAME_MAX },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    instagram: { type: String, default: "", trim: true, lowercase: true, maxlength: 30, index: true },
    note: { type: String, default: "", trim: true, maxlength: PROSPECT_NOTE_MAX },
    niche: { type: String, default: "", trim: true, maxlength: PROSPECT_NICHE_MAX },
    followerRange: { type: String, enum: FOLLOWER_RANGES, default: "" },

    status: { type: String, enum: PROSPECT_STATUSES, default: "new", index: true },
    source: { type: String, enum: ["manual", "csv"], default: "manual" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByEmail: { type: String, default: "", lowercase: true, trim: true },

    contactCount: { type: Number, default: 0, min: 0 },
    lastContactedAt: { type: Date },
    initialSentAt: { type: Date },
    followUpSentAt: { type: Date },
    followUpCount: { type: Number, default: 0, min: 0 },
    lastReplyAt: { type: Date },

    threadId: { type: Schema.Types.ObjectId, ref: "EmailThread" },
    outreachStyle: { type: String, enum: ["personal", "classic"] },
    unsubscribeToken: { type: String, required: true, unique: true },
    unsubscribedAt: { type: Date },
    bouncedAt: { type: Date },
    complainedAt: { type: Date },

    joinedUserId: { type: Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date },

    deletedAt: { type: Date, index: true },
  },
  { timestamps: true }
);

prospectSchema.index({ deletedAt: 1, createdAt: -1 });

export default mongoose.model<IInfluencerProspect>("InfluencerProspect", prospectSchema);
