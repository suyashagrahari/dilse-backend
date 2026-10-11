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
export interface IInfluencerProfile {
  status: "active" | "suspended";
  instagram?: string;
  upiId?: string;
  /** Overrides the global default when set. Null/undefined = use default. */
  commissionPercent?: number | null;
  joinedAt: Date;
}

export type AccountStatus = "active" | "suspended" | "banned";

/**
 * "All templates free", granted by a super admin (influencers, mostly). Kept as
 * a record rather than a bare boolean so a revoke still shows who granted it and
 * when. See config/freeAccess.ts for how the gate reads it.
 */
export interface IFreeAccess {
  enabled: boolean;
  grantedBy?: mongoose.Types.ObjectId;
  grantedByEmail?: string;
  grantedAt?: Date;
  note?: string;
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
  /**
   * Present once the user has registered as an influencer. Influencer is NOT a
   * role: it is orthogonal to admin/member, so staff can be influencers too
   * and switching it on never widens what an account may do in /admin.
   */
  influencer?: IInfluencerProfile;
  /**
   * The influencer whose link this user signed up through. Set once, at
   * signup, and never changed — attribution is "new signups, forever".
   * Distinct from `referredBy`, which is the points-based Refer & Earn.
   */
  referredByInfluencer?: mongoose.Types.ObjectId;
  /** ISO-2 country at signup, and the latest seen (≤ daily). Country only — never city or IP. */
  signupCountry?: string | null;
  lastSeenCountry?: string | null;
  lastSeenCountryAt?: Date | null;
  /**
   * Super admins only. Off (default) = the super admin publishes every priced
   * template free; on = they go through the paywall like any customer, to test
   * a real checkout. Meaningless on any other role.
   */
  paysAsCustomer?: boolean;
  freeAccess?: IFreeAccess;
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
    influencer: {
      type: new Schema<IInfluencerProfile>(
        {
          status: { type: String, enum: ["active", "suspended"], default: "active" },
          instagram: { type: String, trim: true, maxlength: 60 },
          upiId: { type: String, trim: true, maxlength: 80 },
          commissionPercent: { type: Number, min: 0, max: 100, default: null },
          joinedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
      default: undefined,
    },
    signupCountry: { type: String, default: undefined },
    lastSeenCountry: { type: String, default: undefined, index: true, sparse: true },
    lastSeenCountryAt: { type: Date, default: undefined },
    referredByInfluencer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
      index: true,
      sparse: true,
    },
    paysAsCustomer: { type: Boolean, default: false },
    freeAccess: {
      type: new Schema<IFreeAccess>(
        {
          enabled: { type: Boolean, default: false },
          grantedBy: { type: Schema.Types.ObjectId, ref: "User" },
          grantedByEmail: { type: String },
          grantedAt: { type: Date },
          note: { type: String, trim: true, maxlength: 200 },
        },
        { _id: false }
      ),
      default: undefined,
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

userSchema.index({ "influencer.status": 1 }, { sparse: true });

export default mongoose.model<IUser>("User", userSchema);
