import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { isSuperAdminEmail, USER_ROLES, type UserRole } from "../config/roles";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export type { UserRole };

/**
 * Why an account can be refused. `suspended` is reversible and leaves the
 * user's published pages reachable — recipients hold those links and did
 * nothing wrong. `banned` also hides the pages. See `accountStatus.ts`.
 */
export type AccountStatus = "active" | "suspended" | "banned";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password?: string;
  name: string;
  avatar?: string;
  googleId?: string;
  provider: "local" | "google";
  theme: "light" | "dark" | "system";
  role: UserRole;
  status: AccountStatus;
  statusReason?: string;
  statusChangedAt?: Date;
  statusChangedBy?: mongoose.Types.ObjectId;
  suspendedUntil?: Date;
  /**
   * Bumped to invalidate every token already issued to this user. `protect`
   * compares it against the `tv` claim, so a bump is an immediate,
   * irreversible logout of every device — the only force-logout available
   * when refresh tokens are stateless JWTs with a 30-day life.
   */
  tokenVersion: number;
  subdomain?: string;
  /** Names this user gave up by renaming; their old share links still resolve. */
  previousSubdomains?: string[];
  refreshToken?: string;
  points: number;
  totalPointsEarned: number;
  referralCode: string;
  referredBy?: mongoose.Types.ObjectId;
  isVerified: boolean;
  /**
   * Asked not to receive announcements from /admin/outreach. Set by a super
   * admin when somebody replies "unsubscribe". Never affects sign-in codes or
   * replies to mail the person sent us — only one-to-many broadcasts.
   */
  emailOptOut?: boolean;
  otp?: string;
  otpExpiry?: Date;
  pendingReferralCode?: string;
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
    role: {
      type: String,
      enum: USER_ROLES,
      default: "normal",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
      index: true,
    },
    statusReason: { type: String },
    statusChangedAt: { type: Date },
    statusChangedBy: { type: Schema.Types.ObjectId, ref: "User" },
    suspendedUntil: { type: Date },
    tokenVersion: { type: Number, default: 0 },
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
    previousSubdomains: {
      type: [String],
      default: undefined,
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
    isVerified: {
      type: Boolean,
      default: false,
    },
    emailOptOut: { type: Boolean, default: false },
    otp: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
      select: false,
    },
    pendingReferralCode: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  // The super admin is defined by email, not by a row someone can edit: the
  // role is re-asserted on every save so a bad UPDATE cannot strand the
  // deployment with nobody able to reach the super-admin surfaces. For the
  // same reason the account can never be suspended or banned — locking out
  // the only account that can perform an unlock is not recoverable.
  if (isSuperAdminEmail(this.email)) {
    if (this.role !== "superadmin") this.role = "superadmin";
    if (this.status !== "active") {
      this.status = "active";
      this.statusReason = undefined;
      this.suspendedUntil = undefined;
    }
  }

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
