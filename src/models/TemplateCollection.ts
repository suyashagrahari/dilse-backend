// ─── A curated place: which templates appear there, and in what order ────────
//
// One document per place (`key`), e.g. "wedding" for the /wedding hub. A super
// admin picks the templates in /admin/places. Each item may carry a `group` the
// place uses for its own filter chips (the wedding hub: indian, christian, …).
//
// MEMBERSHIP, NOT MOVE: a template listed here still appears in the main
// gallery. Hiding from the gallery is TemplateVisibility's job.
//
// No document means "automatic": the place keeps the list its code derives
// (for the wedding hub, `isWeddingTemplate` + `filterOf`). Deleting the
// document is how a super admin resets to automatic.
//
// Like TemplateOrder there is no `environment` field: staging and production
// have separate databases, so each host's admin edits its own places.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplateCollectionItem {
  slug: string;
  group?: string;
}

export interface ITemplateCollection extends Document {
  key: string;
  items: ITemplateCollectionItem[];
  updatedByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<ITemplateCollectionItem>(
  {
    slug: { type: String, required: true },
    group: { type: String },
  },
  { _id: false }
);

const templateCollectionSchema = new Schema<ITemplateCollection>(
  {
    key: { type: String, required: true, unique: true },
    items: { type: [itemSchema], default: [] },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateCollection>("TemplateCollection", templateCollectionSchema);
