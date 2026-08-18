// ─── Template visibility ─────────────────────────────────────────────────────
//
// One row per template the admin has made a decision about. Nothing else.
//
// ── WHY THIS IS NOT A FIELD ON `Template` ───────────────────────────────────
//
// `models/Template.ts` looks like the obvious home — it already has `isActive`.
// It is the wrong one. That collection is a SECOND, older catalogue, populated by
// `scripts/seed.ts`, which does `deleteMany({})` and re-inserts a hardcoded list;
// it has drifted well behind the templates the app actually ships, and nothing
// the gallery renders reads it. Putting release control on a stale table means
// the newest template — the one most likely to need holding back — has no row to
// hold it back with, and the first `npm run seed` erases every decision made.
//
// ── WHAT OWNS WHAT ──────────────────────────────────────────────────────────
//
//   CODE owns the catalogue.  `client/data/template-registry.ts` imports every
//                             template's config; that list is what exists.
//   THIS owns visibility.     One boolean per slug, and only for slugs somebody
//                             has actually decided about.
//
// A slug with no row falls back to `config/templateVisibility.ts` — see
// `DEFAULT_HIDDEN` there. That is what makes the collection small and readable:
// it is a list of decisions, not a mirror of the app.
//
// ── WHY THERE IS NO `environment` FIELD ─────────────────────────────────────
//
// Because there does not need to be. Staging and production run the same image
// against DIFFERENT DATABASES, so each already has its own copy of this
// collection. A template hidden in production is untouched in staging, and the
// admin screen on each host edits that host's own rows. An `environment` column
// would let one deploy write the other's settings, which is the failure this
// design exists to avoid.
//
// Note also that `env.IS_PROD` is TRUE on staging — the dev deploy fills the
// `PROD_*` variables from its own secrets — so keying any of this on the
// environment flag would have hidden templates on staging too, which is the
// opposite of what it is for.

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplateVisibility extends Document {
  /** The template's URL slug, e.g. "happy-rakshabandhan-to-sister". */
  slug: string;
  /** Visible in the gallery and buildable by users on THIS deployment. */
  live: boolean;
  /**
   * Who flipped it last, by email rather than by id.
   *
   * An id needs a join to mean anything, and the only question anyone asks of
   * this field is "who turned the rakhi page off" — which an email answers on
   * its own, in the row, months later, even if that admin account is gone.
   */
  updatedByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const templateVisibilitySchema = new Schema<ITemplateVisibility>(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    live: { type: Boolean, required: true },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<ITemplateVisibility>(
  "TemplateVisibility",
  templateVisibilitySchema
);
