import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  googleId?: string;
  provider: "local" | "google";
  theme: "light" | "dark" | "system";
  subdomain?: string;
  refreshToken?: string;
  points: number;
  totalPointsEarned: number;
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "light",
    },
    subdomain: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    points: {
      type: Number,
      default: 0,
    },
    totalPointsEarned: {
      type: Number,
      default: 0,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    referredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  // Auto-generate referral code on first save
  if (!this.referralCode) {
    let code = generateReferralCode();
    // ensure uniqueness
    while (await mongoose.model("User").exists({ referralCode: code })) {
      code = generateReferralCode();
    }
    this.referralCode = code;
  }

  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>("User", userSchema);
