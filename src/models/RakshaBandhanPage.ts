import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

// ─── Raksha Bandhan ──────────────────────────────────────────────────────────
//
// A sister builds the page; her brother opens it and performs the ritual.
//
// ── THE ONE STRUCTURAL RULE ─────────────────────────────────────────────────
//
// `shagun` holds her UPI details so he can send the customary money after the
// rakhi is tied. There is deliberately NO field recording whether he paid — no
// `shagunSent`, no `paidAt`, no `reminderCount`. The absence is the point: a
// page that cannot store the answer cannot nag him for it, cannot ask him to
// confirm, and cannot show her a number that turns a gift into an invoice.
//
// If someone later adds such a field, every guilt-trip this template was built
// to avoid becomes one `if` away. It is easier to defend a column that does not
// exist than a feature nobody is allowed to build on top of it.

export type RakhiCharm = "om" | "swastik" | "evil-eye" | "heart" | "star";

export interface IMemory {
  imageUrl: string;
  caption: string;
  year: string;
}

export interface ILedgerRow {
  label: string;
  value: string;
}

export interface IRakhiDesign {
  threadColorA: string;
  threadColorB: string;
  beadColor: string;
  charm: RakhiCharm;
  pendantText: string;
}

export interface IShagun {
  upiId: string;
  qrImageUrl: string;
  note: string;
}

export interface IRakshaBandhanPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  brotherName: string;
  sisterName: string;
  city: string;
  /** The two of them together — the hero of the shareable card. */
  photoUrl: string;

  greeting: string[];
  rakhi: IRakhiDesign;
  memories: IMemory[];
  ledger: ILedgerRow[];
  shagun: IShagun;

  /**
   * What he typed back. Written by the PUBLIC vachan route — he is not logged
   * in and never will be, so this is the one field a non-owner may set, and it
   * is write-once (see the controller).
   */
  vachan: string;
  vachanAt: Date | null;

  distanceKm: number;
  festivalDate: string;

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const rakshaBandhanPageSchema = new Schema<IRakshaBandhanPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    brotherName: { type: String, default: "" },
    sisterName: { type: String, default: "" },
    city: { type: String, default: "" },
    photoUrl: { type: String, default: "" },

    greeting: { type: [String], default: [] },

    rakhi: {
      threadColorA: { type: String, default: "#9B2226" },
      threadColorB: { type: String, default: "#E8913A" },
      beadColor: { type: String, default: "#B08D57" },
      charm: {
        type: String,
        enum: ["om", "swastik", "evil-eye", "heart", "star"],
        default: "om",
      },
      pendantText: { type: String, default: "" },
    },

    memories: {
      type: [
        {
          imageUrl: { type: String, default: "" },
          caption: { type: String, default: "" },
          year: { type: String, default: "" },
        },
      ],
      default: [],
    },

    ledger: {
      type: [
        {
          label: { type: String, default: "" },
          value: { type: String, default: "" },
        },
      ],
      default: [],
    },

    shagun: {
      upiId: { type: String, default: "" },
      qrImageUrl: { type: String, default: "" },
      note: { type: String, default: "" },
    },

    vachan: { type: String, default: "" },
    vachanAt: { type: Date, default: null },

    distanceKm: { type: Number, default: 0 },
    // Raksha Bandhan 2026. Stored per-page rather than hardcoded so a page made
    // this year still says the right thing when it is reopened next year.
    festivalDate: { type: String, default: "2026-08-28" },

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rakshaBandhanPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

rakshaBandhanPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IRakshaBandhanPage>(
  "RakshaBandhanPage",
  rakshaBandhanPageSchema
);
