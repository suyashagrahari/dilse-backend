import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * A single place on the route.
 *
 * `surprise` is the load-bearing flag: when true the client never renders the
 * name until the stop unlocks. The server stores the name either way — the
 * reveal is enforced by `buildItinerary()` on the client, which simply never
 * puts a locked stop's name onto an object that reaches the DOM.
 */
export interface IStop {
  /** Stable client-side id (`s1`, `s2`, …). */
  id: string;
  /** 1-based, and authoritative. Never rely on array position. */
  order: number;
  name: string;
  address: string;
  /** 0/0 is the "not supplied" sentinel — Null Island is not a date venue. */
  lat: number;
  lng: number;
  /** ISO 8601, UTC. */
  arriveAt: string;
  durationMins: number;
  /** Why he chose it. The emotional payload. */
  why: string;
  dressNote: string;
  surprise: boolean;
}

/** Where they meet. Revealed as soon as the invitation is accepted. */
export interface IGeoPoint {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * Shared between the schema and the controller so the caps live in exactly one
 * place. The client caps these too, but the client is not a security boundary.
 */
export const DATE_INVITE_LIMITS = {
  maxStops: 6,
  /** Guard against a caller posting a 100k-element array before we ever slice. */
  maxRawItems: 200,
  maxPhotos: 12,
  name: 80,
  placeName: 160,
  address: 300,
  stopId: 40,
  /** ISO 8601 timestamps. Generous, but nowhere near a payload. */
  iso: 40,
  /** A plain https URL. Uploaded photos are turned into one before they get here. */
  url: 2000,
  dressCode: 200,
  dressNote: 200,
  note: 400,
  why: 800,
  closingLine: 800,
  password: 128,
  latMin: -90,
  latMax: 90,
  lngMin: -180,
  lngMax: 180,
  durationMinsMin: 15,
  durationMinsMax: 1440,
  durationMinsDefault: 240,
  stopDurationMin: 5,
  stopDurationMax: 600,
  stopDurationDefault: 45,
  orderMin: 1,
  /** -1 means "the date has not started". */
  currentStopIndexMin: -1,
} as const;

export type WalkingLevel = "minimal" | "some" | "a lot";
export type RsvpState = "pending" | "accepted" | "declined" | "reschedule";

export interface IDateInvitationPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  senderName: string;
  recipientName: string;
  /** ISO 8601, UTC. Everything is stored and compared in UTC, displayed local. */
  startsAt: string;
  durationMins: number;
  dressCode: string;
  walkingLevel: WalkingLevel;
  note: string;
  meetingPoint: IGeoPoint;
  stops: IStop[];
  /** Recipient-owned state. The sender never sets this to anything but "pending". */
  rsvp: RsvpState;
  proposedDate: string;
  /** Index of the stop being visited. -1 before the date starts. */
  currentStopIndex: number;
  /** ISO timestamps, parallel to `stops` by index. "" means not yet arrived. */
  arrivedAt: string[];
  photos: string[];
  closingLine: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const geoPointSchema = new Schema<IGeoPoint>(
  {
    name: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.placeName },
    address: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.address },
    lat: { type: Number, default: 0, min: DATE_INVITE_LIMITS.latMin, max: DATE_INVITE_LIMITS.latMax },
    lng: { type: Number, default: 0, min: DATE_INVITE_LIMITS.lngMin, max: DATE_INVITE_LIMITS.lngMax },
  },
  { _id: false }
);

const stopSchema = new Schema<IStop>(
  {
    id: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.stopId },
    order: { type: Number, default: DATE_INVITE_LIMITS.orderMin, min: DATE_INVITE_LIMITS.orderMin, max: DATE_INVITE_LIMITS.maxStops },
    name: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.placeName },
    address: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.address },
    lat: { type: Number, default: 0, min: DATE_INVITE_LIMITS.latMin, max: DATE_INVITE_LIMITS.latMax },
    lng: { type: Number, default: 0, min: DATE_INVITE_LIMITS.lngMin, max: DATE_INVITE_LIMITS.lngMax },
    arriveAt: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.iso },
    durationMins: {
      type: Number,
      default: DATE_INVITE_LIMITS.stopDurationDefault,
      min: DATE_INVITE_LIMITS.stopDurationMin,
      max: DATE_INVITE_LIMITS.stopDurationMax,
    },
    why: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.why },
    dressNote: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.dressNote },
    // Surprise is the default: forgetting to set it must not leak a name.
    surprise: { type: Boolean, default: true },
  },
  { _id: false }
);

const dateInvitationPageSchema = new Schema<IDateInvitationPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.name },
    recipientName: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.name },
    startsAt: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.iso },
    durationMins: {
      type: Number,
      default: DATE_INVITE_LIMITS.durationMinsDefault,
      min: DATE_INVITE_LIMITS.durationMinsMin,
      max: DATE_INVITE_LIMITS.durationMinsMax,
    },
    dressCode: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.dressCode },
    walkingLevel: { type: String, enum: ["minimal", "some", "a lot"], default: "some" },
    note: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.note },
    meetingPoint: { type: geoPointSchema, default: () => ({}) },
    stops: { type: [stopSchema], default: [] },
    rsvp: { type: String, enum: ["pending", "accepted", "declined", "reschedule"], default: "pending" },
    proposedDate: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.iso },
    currentStopIndex: {
      type: Number,
      default: DATE_INVITE_LIMITS.currentStopIndexMin,
      min: DATE_INVITE_LIMITS.currentStopIndexMin,
      max: DATE_INVITE_LIMITS.maxStops,
    },
    arrivedAt: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    closingLine: { type: String, default: "", maxlength: DATE_INVITE_LIMITS.closingLine },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

dateInvitationPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

dateInvitationPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IDateInvitationPage>("DateInvitationPage", dateInvitationPageSchema);
