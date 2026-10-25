import mongoose, { Schema, Document } from "mongoose";
import { ATTENDING, MEALS, RSVP_LIMITS, type Attending, type Meal } from "../config/weddingShared";

/**
 * One guest's answer to a wedding invitation (config/weddingShared). Many per
 * page — unlike the Valentine engine's single first-wins reaction. Written only
 * by the public RSVP endpoint; the owner reads them through their own page.
 */
export interface IWeddingRsvp extends Document {
  pageId: mongoose.Types.ObjectId;
  slug: string;
  guestName: string;
  phone: string;
  attending: Attending;
  /** Party size including the guest; 0 when declining. */
  guests: number;
  /** Event ids (from the page's extras.events) the party will attend. */
  events: string[];
  meal: Meal | null;
  message: string;
  /** sha256 of the edit token handed to the guest's browser ("edit my response"). Never returned. */
  tokenHash: string;
  /** Per-page hash of the client IP (flood forensics without storing the address). */
  ipHash: string;
  /** The owner has been told about this RSVP (single mail or a digest). */
  emailed: boolean;
  /** Set on the RSVP whose arrival sent a digest — the throttle's clock. */
  digestSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const weddingRsvpSchema = new Schema<IWeddingRsvp>(
  {
    pageId: { type: Schema.Types.ObjectId, required: true, index: true },
    slug: { type: String, required: true, maxlength: 60 },
    guestName: { type: String, required: true, maxlength: RSVP_LIMITS.name },
    phone: { type: String, default: "", maxlength: RSVP_LIMITS.phone },
    attending: { type: String, enum: ATTENDING, required: true },
    guests: { type: Number, default: 1, min: 0, max: RSVP_LIMITS.maxGuests },
    events: {
      type: [{ type: String, maxlength: RSVP_LIMITS.eventId }],
      default: [],
      validate: [(v: string[]) => v.length <= 40, "too many events"],
    },
    meal: { type: String, enum: [...MEALS, null], default: null },
    message: { type: String, default: "", maxlength: RSVP_LIMITS.message },
    tokenHash: { type: String, required: true, select: false },
    ipHash: { type: String, default: "", select: false },
    emailed: { type: Boolean, default: false },
    digestSentAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "weddingrsvps" }
);

weddingRsvpSchema.index({ pageId: 1, createdAt: -1 });

export const WeddingRsvp = mongoose.model<IWeddingRsvp>("WeddingRsvp", weddingRsvpSchema);
export default WeddingRsvp;
