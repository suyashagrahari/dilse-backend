// ─── Upgrade offer funnel events ─────────────────────────────────────────────
//
// One row per step a visitor takes through a free → premium offer (see
// config/upgradePaths.ts): the offer shown, "Try premium" pressed, the premium
// preview ready, edit opened, back to free, which one they finally published.
// Super admin → Upgrades reads these as a funnel.
//
// `visitorId` is a random id the browser keeps, so a visitor counts once per
// step whether or not they were signed in yet. Rows expire after a year.

import mongoose, { Schema, Document, Types } from "mongoose";
import { UPGRADE_EVENTS, type UpgradeEventName } from "../config/upgradePaths";

export interface IUpgradeEvent extends Document {
  from: string;
  to: string;
  event: UpgradeEventName;
  visitorId: string;
  userId: Types.ObjectId | null;
  pageId: string;
  createdAt: Date;
}

const upgradeEventSchema = new Schema<IUpgradeEvent>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    event: { type: String, required: true, enum: UPGRADE_EVENTS as unknown as string[] },
    visitorId: { type: String, required: true, maxlength: 64 },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    pageId: { type: String, default: "", maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

upgradeEventSchema.index({ from: 1, createdAt: -1 });
upgradeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export default mongoose.model<IUpgradeEvent>("UpgradeEvent", upgradeEventSchema);
