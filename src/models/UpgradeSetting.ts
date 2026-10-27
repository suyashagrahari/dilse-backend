// ─── Upgrade offer on/off ────────────────────────────────────────────────────
//
// One row per free template whose premium offer a super admin switched OFF (or
// back on). No row = the offer is on, so a fresh database changes nothing.

import mongoose, { Schema, Document } from "mongoose";

export interface IUpgradeSetting extends Document {
  from: string;
  enabled: boolean;
  updatedByEmail: string;
  updatedAt: Date;
}

const upgradeSettingSchema = new Schema<IUpgradeSetting>(
  {
    from: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, required: true },
    updatedByEmail: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IUpgradeSetting>("UpgradeSetting", upgradeSettingSchema);
