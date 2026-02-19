import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface IBirthdayPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  recipientName: string;
  senderName: string;
  personalMessage: string;
  wishes: string[];
  photos: string[];
  musicTrack: string;
  theme: "romantic" | "elegant" | "playful";
  password: string;
  passwordRaw: string;
  viewCount: number;
  installCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const birthdayPageSchema = new Schema<IBirthdayPage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    recipientName: { type: String, required: true, trim: true },
    senderName: { type: String, default: "Your Love ❤️", trim: true },
    personalMessage: { type: String, default: "" },
    wishes: { type: [String], default: [] },
    photos: { type: [String], default: [] },
    musicTrack: { type: String, default: "" },
    theme: {
      type: String,
      enum: ["romantic", "elegant", "playful"],
      default: "romantic",
    },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    installCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

birthdayPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = crypto.randomBytes(5).toString("base64url").slice(0, 8);
  }
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

birthdayPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IBirthdayPage>("BirthdayPage", birthdayPageSchema);
