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
    // ── Trim before hashing ──────────────────────────────────────────────────
    //
    // Senders type a trailing space constantly — a phone keyboard offers one
    // after every word, and a pasted password brings its own. Every
    // recipient-side viewer trims what it sends. So without this, a page stored
    // with "sunflower " can never be opened by anyone typing "sunflower": the
    // password is correct and the page still will not open, which is exactly
    // what it looked like from the outside.
    //
    // Trimming HERE and not in 43 controllers because this is the one point
    // where a password becomes a hash. Anything that assigns and saves is
    // covered, including paths nobody has written yet.
    const trimmed = this.password.trim();

    if (!trimmed) {
      // Whitespace only is not a password. Hashing "" would leave a page that
      // reports itself protected and opens for nobody.
      this.password = "";
      this.passwordRaw = "";
    } else {
      this.passwordRaw = trimmed;
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(trimmed, salt);
    }
  }
  next();
});

bouquetGfPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  // Trimmed on both sides. One viewer sends untrimmed input, and the stored
  // value is trimmed at save time — so comparing raw would reintroduce the bug.
  return bcrypt.compare((candidate || "").trim(), this.password);
};

export default mongoose.model<IBouquetGfPage>("BouquetGfPage", bouquetGfPageSchema);
