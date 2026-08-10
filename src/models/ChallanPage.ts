import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

/**
 * Challan — a parody traffic-violation notice served on someone you love.
 *
 * The issuing body is INVENTED end to end ("Department of Heart Traffic,
 * Republic of Us"). Nothing here carries, or may ever carry, a real state
 * emblem, a real motto, a real transport-department mark, or any identity
 * document. This is a NOTICE, never an ID: there is no field for a person's
 * photo beside their name and a number, because that combination is what an
 * identity card is, and a convincing fake one is not a joke.
 *
 * THE FIELD THAT DECIDES THIS TEMPLATE: `totalFine` is a String and stays one.
 * "one date" is a legal total. Typed as Number, Mongoose casts it to NaN on the
 * way in and the whole conceit dies at the database layer. Nothing here or
 * downstream may Number(), parseFloat(), sum, compare, or currency-format it —
 * it is printed, and only printed. Per-offence `fine` IS a Number, and it is
 * never summed into `totalFine`.
 *
 * This template has no contributor loop; there is nothing for a friend to add.
 */

/** The invented issuing body. Every value is fiction and must read as such. */
export interface IChallanAuthority {
  name: string;
  department: string;
  state: string;
  /** Invented, Devanagari-styled motto. Never a real national or state motto. */
  motto: string;
}

export interface IChallanAccused {
  name: string;
  address: string;
  /** A joke plate. Never a real-format plate tied to a real person. */
  vehicleNo: string;
}

export interface IChallanOfficer {
  name: string;
  /** Invented badge id. No real force's numbering scheme. */
  id: string;
  post: string;
}

/** The road-camera frame: a degraded, timestamped shot of a vehicle. */
export interface IChallanEvidence {
  imageUrl: string;
  plateText: string;
  /** Burned into the frame's corner as free text. Never parsed as a date. */
  timestamp: string;
}

export interface IChallanOffence {
  /** Invented statute. Never a real IPC/MVA section. */
  section: string;
  description: string;
  /** Rendered, never arithmetic'd into `totalFine`. */
  fine: number;
  note?: string;
}

/** One row in the settlement sheet. */
export interface IChallanSettlementMethod {
  id: string;
  label: string;
  sub?: string;
}

export interface IChallanPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  authority: IChallanAuthority;
  challanNo: string;
  /** ISO 8601, stored as text. */
  issuedAt: string;
  /** ISO 8601, stored as text. May already be in the past — a supported state. */
  dueAt: string;
  accused: IChallanAccused;
  officer: IChallanOfficer;
  location: string;
  evidence: IChallanEvidence;
  offences: IChallanOffence[];
  /** STRING. Never Number()/parseFloat/summed — see the header. */
  totalFine: string;
  settlement: { methods: IChallanSettlementMethod[] };
  /** The sincere payload, shown after the challan is "paid". */
  paidMessage: string[];
  /** The sincere payload, shown after the objection is upheld. */
  contestMessage: string[];

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const authoritySchema = new Schema<IChallanAuthority>(
  {
    name: { type: String, default: "", maxlength: 80 },
    department: { type: String, default: "", maxlength: 80 },
    state: { type: String, default: "", maxlength: 60 },
    motto: { type: String, default: "", maxlength: 80 },
  },
  { _id: false }
);

const accusedSchema = new Schema<IChallanAccused>(
  {
    name: { type: String, default: "", maxlength: 60 },
    address: { type: String, default: "", maxlength: 200 },
    vehicleNo: { type: String, default: "", maxlength: 32 },
  },
  { _id: false }
);

const officerSchema = new Schema<IChallanOfficer>(
  {
    name: { type: String, default: "", maxlength: 60 },
    id: { type: String, default: "", maxlength: 24 },
    post: { type: String, default: "", maxlength: 80 },
  },
  { _id: false }
);

const evidenceSchema = new Schema<IChallanEvidence>(
  {
    imageUrl: { type: String, default: "", maxlength: 2000 },
    plateText: { type: String, default: "", maxlength: 32 },
    // Free text burned into the frame. Deliberately not a Date.
    timestamp: { type: String, default: "", maxlength: 48 },
  },
  { _id: false }
);

const offenceSchema = new Schema<IChallanOffence>(
  {
    section: { type: String, default: "", maxlength: 80 },
    description: { type: String, default: "", maxlength: 240 },
    fine: { type: Number, default: 0 },
    note: { type: String, default: "", maxlength: 240 },
  },
  { _id: false }
);

const settlementMethodSchema = new Schema<IChallanSettlementMethod>(
  {
    id: { type: String, default: "", maxlength: 48 },
    label: { type: String, default: "", maxlength: 60 },
    sub: { type: String, default: "", maxlength: 200 },
  },
  { _id: false }
);

const challanPageSchema = new Schema<IChallanPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    authority: {
      type: authoritySchema,
      default: () => ({ name: "", department: "", state: "", motto: "" }),
    },
    challanNo: { type: String, default: "", maxlength: 48 },
    issuedAt: { type: String, default: "", maxlength: 40 },
    dueAt: { type: String, default: "", maxlength: 40 },
    accused: {
      type: accusedSchema,
      default: () => ({ name: "", address: "", vehicleNo: "" }),
    },
    officer: {
      type: officerSchema,
      default: () => ({ name: "", id: "", post: "" }),
    },
    location: { type: String, default: "", maxlength: 200 },
    evidence: {
      type: evidenceSchema,
      default: () => ({ imageUrl: "", plateText: "", timestamp: "" }),
    },
    offences: { type: [offenceSchema], default: [] },
    // String on purpose. "one date" is a legal total and must survive a round
    // trip; a Number here casts it to NaN and kills the joke at the DB layer.
    totalFine: { type: String, default: "", maxlength: 80 },
    settlement: {
      type: new Schema<IChallanPage["settlement"]>(
        {
          methods: { type: [settlementMethodSchema], default: [] },
        },
        { _id: false }
      ),
      default: () => ({ methods: [] }),
    },
    paidMessage: { type: [String], default: [] },
    contestMessage: { type: [String], default: [] },

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

challanPageSchema.pre("save", async function (next) {
  if (!this.shareId) this.shareId = randomUUID();
  if (this.isModified("password") && this.password) {
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

challanPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IChallanPage>("ChallanPage", challanPageSchema);
