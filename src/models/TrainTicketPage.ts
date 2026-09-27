import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";

/**
 * Train Ticket — a parody reservation slip whose reveal mechanic is a PNR status
 * check. Everything is invented: the issuing authority is the fictional
 * "Indian Hearts Railway / IHRCTC" and no real carrier's marks are stored,
 * referenced or reproduced anywhere in this template.
 */

/** One traveller on the slip. `gender` mirrors the single-letter column a slip prints. */
export interface IPassenger {
  name: string;
  age: number;
  /** M / F / X — X is the neutral option offered in the editor. */
  gender: string;
  /** What the slip was booked as, e.g. "WL 47". */
  bookingStatus: string;
  /** What it resolved to, e.g. "CNF". */
  currentStatus: string;
  coach: string;
  seat: string;
  berth: string;
}

/** One label/value pair in the fare block. Values are prose, not currency. */
export interface IFareLine {
  label: string;
  value: string;
}

/** One node on the running-status timeline (the relationship as a route). */
export interface IStation {
  name: string;
  /** Optional parenthetical, e.g. "unscheduled stop". */
  label: string;
  /** ISO timestamp, or "" when the stop has no date yet. */
  at: string;
  /** Right-aligned detail text, e.g. "dep 14 Mar 2023, 02:11" or "27 times". */
  detail: string;
  status: "passed" | "current" | "upcoming";
}

export interface ITrainTicketPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  /** Reservation identity. */
  pnr: string;
  trainNo: string;
  trainName: string;
  from: { code: string; name: string };
  to: { code: string; name: string };
  /** ISO. Drives the live boarding countdown. */
  departureAt: string;
  /** ISO. Printed as the arrival time on the slip. */
  arrivalAt: string;
  /**
   * ISO. THE GATE. Until this moment passes, the shared endpoint refuses to
   * emit passenger names, seats or the letter — see `redactUntilChart` in the
   * controller. Empty string means "chart already prepared".
   */
  chartPreparedAt: string;
  classCode: string;
  quota: string;

  passengers: IPassenger[];
  fare: IFareLine[];
  stations: IStation[];
  delay: { amount: string; reason: string };
  finePrint: string[];
  /** The sincere payload, shown under the slip once the chart is prepared. */
  letter: string;
  /** Love kit: framed photos with little letters, GIFs and the colour theme. */
  photos: ILovePhoto[];
  gifs: string[];
  theme: string;
  lockQuestion: string;
  lockAnswer: string;

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const passengerSchema = new Schema<IPassenger>(
  {
    name: { type: String, default: "", maxlength: 60 },
    age: { type: Number, default: 0, min: 0, max: 150 },
    gender: { type: String, default: "X", maxlength: 1 },
    bookingStatus: { type: String, default: "", maxlength: 24 },
    currentStatus: { type: String, default: "", maxlength: 24 },
    coach: { type: String, default: "", maxlength: 8 },
    seat: { type: String, default: "", maxlength: 8 },
    berth: { type: String, default: "", maxlength: 24 },
  },
  { _id: false }
);

const fareLineSchema = new Schema<IFareLine>(
  {
    label: { type: String, default: "", maxlength: 60 },
    value: { type: String, default: "", maxlength: 60 },
  },
  { _id: false }
);

const stationSchema = new Schema<IStation>(
  {
    name: { type: String, default: "", maxlength: 60 },
    label: { type: String, default: "", maxlength: 40 },
    at: { type: String, default: "", maxlength: 40 },
    detail: { type: String, default: "", maxlength: 60 },
    status: { type: String, enum: ["passed", "current", "upcoming"], default: "upcoming" },
  },
  { _id: false }
);

const stationCodeSchema = new Schema<{ code: string; name: string }>(
  {
    code: { type: String, default: "", maxlength: 6 },
    name: { type: String, default: "", maxlength: 40 },
  },
  { _id: false }
);

const trainTicketPageSchema = new Schema<ITrainTicketPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    pnr: { type: String, default: "", maxlength: 24 },
    trainNo: { type: String, default: "", maxlength: 12 },
    trainName: { type: String, default: "", maxlength: 40 },
    from: { type: stationCodeSchema, default: () => ({ code: "", name: "" }) },
    to: { type: stationCodeSchema, default: () => ({ code: "", name: "" }) },
    departureAt: { type: String, default: "", maxlength: 40 },
    arrivalAt: { type: String, default: "", maxlength: 40 },
    chartPreparedAt: { type: String, default: "", maxlength: 40 },
    classCode: { type: String, default: "", maxlength: 8 },
    quota: { type: String, default: "", maxlength: 16 },

    passengers: { type: [passengerSchema], default: [] },
    fare: { type: [fareLineSchema], default: [] },
    stations: { type: [stationSchema], default: [] },
    delay: {
      type: new Schema(
        {
          amount: { type: String, default: "", maxlength: 40 },
          reason: { type: String, default: "", maxlength: 120 },
        },
        { _id: false }
      ),
      default: () => ({ amount: "", reason: "" }),
    },
    finePrint: { type: [String], default: [] },
    letter: { type: String, default: "", maxlength: 4000 },
    photos: loveKitFields.photos,
    gifs: loveKitFields.gifs,
    theme: loveKitFields.theme,
    lockQuestion: loveKitFields.lockQuestion,
    lockAnswer: loveKitFields.lockAnswer,

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

trainTicketPageSchema.pre("save", async function (next) {
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

trainTicketPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) {
    await rememberPagePassword(this, trimmed);
    return true;
  }

  // ── THEN EXACTLY AS TYPED, FOR PAGES OLDER THAN THAT FIX ──────────────────
  //
  // A page published before passwords were trimmed hashed the string WITH its
  // whitespace — "sunflower " — because no builder trimmed and every phone
  // keyboard offers a space after a word. Trimming the candidate here is what
  // then took away the only key that opened it: the sender's own password
  // stopped working on their own page, and so did the trimmed version. There
  // was no string the recipient could type.
  //
  // scripts/repair-page-passwords.js re-hashes those rows from `passwordRaw`,
  // but it needs someone to run it against production, and a row whose
  // passwordRaw is missing cannot be repaired at all. This costs one extra
  // comparison and needs nobody to remember anything.
  //
  // Skipped when the two strings are equal, so an ordinary wrong password is
  // still exactly one bcrypt comparison.
  if (raw === trimmed) return false;
  if (await bcrypt.compare(raw, this.password)) {
    await rememberPagePassword(this, raw);
    return true;
  }
  return false;
};

export default mongoose.model<ITrainTicketPage>("TrainTicketPage", trainTicketPageSchema);
