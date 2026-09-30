// ─── Template tier: premium or normal ────────────────────────────────────────
//
// One row per template a super admin has moved between the Premium collection
// and the normal gallery. Same "list of decisions" shape as TemplatePricing and
// TemplateVisibility: a template with no row keeps the tier the code gives it
// (`PREMIUM_SLUGS` in client/data/template-registry.ts), so a fresh database
// changes nothing and a new template needs no row to appear in the right place.
//
// Tier is presentation only — which room of the gallery a template sits in and
// which card it gets. What a user PAYS is still TemplatePricing's job.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplateTier extends Document {
  slug: string;
  premium: boolean;
  updatedByEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateTierSchema = new Schema<ITemplateTier>(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    premium: { type: Boolean, required: true },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateTier>("TemplateTier", templateTierSchema);
