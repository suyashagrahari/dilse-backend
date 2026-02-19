import mongoose, { Schema, Document } from "mongoose";

export interface ISharedAccess extends Document {
  shareId: string;
  templateType: string;
  senderUserId: mongoose.Types.ObjectId;
  recipientUserId: mongoose.Types.ObjectId;
  passwordVerified: boolean;
  createdAt: Date;
}

const sharedAccessSchema = new Schema<ISharedAccess>(
  {
    shareId: { type: String, required: true, index: true },
    templateType: { type: String, required: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    passwordVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

sharedAccessSchema.index({ shareId: 1, recipientUserId: 1 }, { unique: true });

export default mongoose.model<ISharedAccess>("SharedAccess", sharedAccessSchema);
