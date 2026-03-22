import mongoose, { Schema, Document } from "mongoose";

export interface IReferralRecord extends Document {
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  createdAt: Date;
}

const referralRecordSchema = new Schema<IReferralRecord>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referee:  { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  },
  { timestamps: true }
);

export default mongoose.model<IReferralRecord>("ReferralRecord", referralRecordSchema);
