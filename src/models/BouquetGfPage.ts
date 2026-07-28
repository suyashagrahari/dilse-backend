import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IStemCount {
  id: number;
  count: number;
}

export type BouquetMode = "color" | "mono";

export interface IBouquetGfPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  mode: BouquetMode;
  flowers: IStemCount[];
  arrangementSeed: number;
  greenery: number;
  recipientName: string;
  senderName: string;
  message: string;
  deedEnabled: boolean;
  deedClauses: string[];
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const bouquetGfPageSchema = new Schema<IBouquetGfPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    mode: { type: String, enum: ["color", "mono"], default: "color" },
    flowers: {
      type: [
        {
          id: { type: Number, default: 0 },
          count: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    arrangementSeed: { type: Number, default: 7 },
    greenery: { type: Number, default: 0 },
    recipientName: { type: String, default: "" },
    senderName: { type: String, default: "" },
    message: { type: String, default: "" },
    deedEnabled: { type: Boolean, default: true },
    deedClauses: { type: [String], default: [] },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bouquetGfPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

bouquetGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IBouquetGfPage>("BouquetGfPage", bouquetGfPageSchema);
