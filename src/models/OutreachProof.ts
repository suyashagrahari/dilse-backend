// ─── Proof of traction for creator outreach ─────────────────────────────────
//
// An analytics screenshot (Google Search Console, Google Analytics …) the
// admin uploaded in Prospects → Traction, with the numbers on it as the admin
// CONFIRMED them. The image lives on the CDN (S3 gifts-media/outreach-proof/);
// the stats are what the AI may quote and the only numbers the first-email
// linter lets through. See services/outreachProof.service.ts.

import mongoose, { Document, Schema } from "mongoose";

export const PROOF_SOURCES = ["search_console", "google_analytics", "other"] as const;
export type ProofSource = (typeof PROOF_SOURCES)[number];

export interface ProofStat {
  /** "Total clicks", "Total impressions", "Users" … as on the screenshot. */
  label: string;
  /** "52.2K", "2.75M", "1.9%" — exactly as on the screenshot. */
  value: string;
}

export interface IOutreachProof extends Document {
  imageUrl: string;
  /** The S3 key, for replacing / deleting the object later. */
  imageKey: string;
  imageWidth: number;
  imageHeight: number;
  contentType: string;
  source: ProofSource;
  /** "Last 3 months (Jul 17 – Oct 2026)". */
  periodLabel: string;
  stats: ProofStat[];
  /** One line the admin wrote about it (shown in the panel; not sent). */
  caption: string;
  /** The default proof preselected in the Generate dialog. At most one. */
  isDefault: boolean;
  active: boolean;
  byEmail: string;
  createdAt: Date;
  updatedAt: Date;
}

const statSchema = new Schema<ProofStat>(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    value: { type: String, required: true, trim: true, maxlength: 24 },
  },
  { _id: false }
);

const proofSchema = new Schema<IOutreachProof>(
  {
    imageUrl: { type: String, required: true, maxlength: 500 },
    imageKey: { type: String, default: "", maxlength: 300 },
    imageWidth: { type: Number, default: 0 },
    imageHeight: { type: Number, default: 0 },
    contentType: { type: String, default: "image/webp", maxlength: 40 },
    source: { type: String, enum: PROOF_SOURCES, default: "other" },
    periodLabel: { type: String, default: "", trim: true, maxlength: 80 },
    stats: { type: [statSchema], default: [] },
    caption: { type: String, default: "", trim: true, maxlength: 280 },
    isDefault: { type: Boolean, default: false, index: true },
    active: { type: Boolean, default: true, index: true },
    byEmail: { type: String, default: "", lowercase: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IOutreachProof>("OutreachProof", proofSchema);
