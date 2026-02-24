import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export interface IReceptionBlessing {
  name: string;
  message: string;
  createdAt: Date;
}

export interface IReceptionPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  brideName: string;
  groomName: string;
  receptionDate: string;
  venue: string;
  venueAddress: string;
  venueMapQuery: string;
  venueTimings: string;
  tagline: string;
  heroImage: string;
  bride: {
    name: string;
    role: string;
    description: string;
    photo: string;
    tags: { emoji: string; label: string }[];
  };
  groom: {
    name: string;
    role: string;
    description: string;
    photo: string;
    tags: { emoji: string; label: string }[];
  };
  families: { bride: string; groom: string };
  galleryImages: { src: string; alt: string; span: string; category: string }[];
  blessings: IReceptionBlessing[];
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const personInfoSchema = new Schema(
  {
    name: { type: String, default: "", trim: true },
    role: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    photo: { type: String, default: "" },
    tags: { type: [{ emoji: String, label: String }], default: [] },
  },
  { _id: false }
);

const receptionBlessingSchema = new Schema<IReceptionBlessing>(
  {
    name: { type: String, default: "Guest", trim: true },
    message: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const receptionPageSchema = new Schema<IReceptionPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    brideName: { type: String, default: "", trim: true },
    groomName: { type: String, default: "", trim: true },
    receptionDate: { type: String, default: "2026-03-15T19:00:00+05:30" },
    venue: { type: String, default: "", trim: true },
    venueAddress: { type: String, default: "", trim: true },
    venueMapQuery: { type: String, default: "", trim: true },
    venueTimings: { type: String, default: "7:00 PM — 11:30 PM", trim: true },
    tagline: { type: String, default: "Request the pleasure of your company", trim: true },
    heroImage: { type: String, default: "/assets/Reception/reception.png" },
    bride: {
      type: personInfoSchema,
      default: () => ({ name: "", role: "The Bride", description: "", photo: "", tags: [] }),
    },
    groom: {
      type: personInfoSchema,
      default: () => ({ name: "", role: "The Groom", description: "", photo: "", tags: [] }),
    },
    families: {
      type: { bride: { type: String, default: "" }, groom: { type: String, default: "" } },
      default: { bride: "", groom: "" },
    },
    galleryImages: {
      type: [{ src: String, alt: String, span: String, category: String }],
      default: [],
    },
    blessings: {
      type: [receptionBlessingSchema],
      default: [],
    },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

receptionPageSchema.pre("save", async function (next) {
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

receptionPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IReceptionPage>("ReceptionPage", receptionPageSchema);
