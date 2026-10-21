// ─── Gallery order chosen by a super admin ───────────────────────────────────
//
// ONE document (`key: "gallery"`) holding the slugs a super admin pulled to the
// front of the gallery, in the order they want them shown. Templates not in the
// list keep the gallery's own order (most-created first) after it.
//
// No document — or an empty list — means "no opinion", and the gallery uses the
// code's PINNED_FIRST list (client/lib/galleryRules.ts) exactly as before.
//
// Like TemplateVisibility there is no `environment` field: staging and
// production have separate databases, so each host's admin edits its own order.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplateOrder extends Document {
  key: string;
  slugs: string[];
  updatedByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateOrderSchema = new Schema<ITemplateOrder>(
  {
    key: { type: String, required: true, unique: true, default: "gallery" },
    slugs: { type: [String], default: [] },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateOrder>("TemplateOrder", templateOrderSchema);
