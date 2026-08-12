// ─── WallEntry ───────────────────────────────────────────────────────────────
//
// One opt-in row on the public Wall.
//
// ── WHY A SEPARATE COLLECTION ───────────────────────────────────────────────
//
// There is no shared "creations" table in this codebase — there are 48 separate
// per-template collections with no common base schema. A Wall that queried them
// live would have to fan out across all 48, merge, sort by date and paginate in
// application memory on every request. That is not a page you can server-render.
//
// So the Wall is denormalized: one small document written once, at the moment
// consent is given. Reading the Wall is a single indexed query.
//
// The bigger win is a privacy one, and it is structural rather than a matter of
// discipline. This document holds no photo, no message text, no full name, no
// share link and no password. The Wall query cannot leak any of those, because
// it does not join to anything that has them. Nobody can later "just add a
// field" to the Wall response and accidentally expose a love letter — the data
// is not in the collection being read.
//
// ── WHY NO previewUrl ───────────────────────────────────────────────────────
//
// The obvious way to make the Wall look good is a thumbnail of the real page.
// That is exactly what must never happen: these pages contain uploaded photos
// and private messages, and a screenshot pipeline is one bug away from
// publishing them. Cards are instead rendered from type — the template's own
// palette, its name, and the two first names — entirely on the client, from the
// fields below. No image of a creation is ever generated, stored or served.

import mongoose, { Schema, Document } from "mongoose";

export type WallStatus = "pending" | "approved" | "removed";

export interface IWallEntry extends Document {
  /** Which template. Matches WALL_TEMPLATES[].templateType. */
  templateType: string;
  /** The builder slug — denormalized so a filtered query needs no join. */
  templateSlug: string;
  /** The creation this came from. Never dereferenced by the read path. */
  pageId: mongoose.Types.ObjectId;
  /** The owner, so they can revoke. Never exposed in a public response. */
  userId: mongoose.Types.ObjectId;
  /**
   * First names only, derived once at consent time.
   *
   * Derived, never accepted from the client: the browser knows both names
   * already, but trusting it would let anyone POST any pair of names onto the
   * public Wall. These are read off the creation document server-side.
   */
  creatorFirstName: string;
  recipientFirstName: string;
  /** "for" → "A made this for B". "and" → "A & B". */
  pairing: "for" | "and";
  /**
   * Team-made showcase entry. Rendered with a visible "Example" badge and
   * excluded from every count the page prints. Never set by a user request —
   * only by the seed script, which is why there is no route that can set it.
   */
  isExample: boolean;
  status: WallStatus;
  /** Set when a report hides an entry, so the queue can show why. */
  reportCount: number;
  consentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const wallEntrySchema = new Schema<IWallEntry>(
  {
    templateType: { type: String, required: true, index: true },
    templateSlug: { type: String, required: true, index: true },
    pageId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    creatorFirstName: { type: String, default: "", maxlength: 40 },
    recipientFirstName: { type: String, default: "", maxlength: 40 },
    pairing: { type: String, enum: ["for", "and"], default: "for" },
    isExample: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "approved", "removed"],
      // Nothing reaches the Wall without a human approving it.
      default: "pending",
      index: true,
    },
    reportCount: { type: Number, default: 0 },
    consentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// The Wall index: approved rows, newest first.
wallEntrySchema.index({ status: 1, createdAt: -1 });
// One filtered page: approved rows for one slug, newest first.
wallEntrySchema.index({ templateSlug: 1, status: 1, createdAt: -1 });
// Consent is idempotent — ticking the box twice must not create two rows.
wallEntrySchema.index({ templateType: 1, pageId: 1 }, { unique: true });

export default mongoose.model<IWallEntry>("WallEntry", wallEntrySchema);
