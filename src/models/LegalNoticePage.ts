import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * Where a single demand stands. The recipient drives this from the shared page
 * WITHOUT logging in (see `recordLegalNoticeResponse`), which is why it lives on
 * the document rather than in the browser — a response has to survive a hard
 * refresh on a different device.
 */
export type DemandResponse = "pending" | "accepted" | "contested";

/** One numbered demand the addressee must answer. */
export interface IDemand {
  /** Stable id. The public respond endpoint addresses a demand by this, never by index. */
  id: string;
  /**
   * Capped at 60 characters on purpose. This is a petty-and-affectionate format
   * and the cap is what stops it collecting real grievances — a product
   * decision, not a field-length guess. Do not raise it.
   */
  text: string;
  response: DemandResponse;
  /** One line, only meaningful when `response === "contested"`. */
  grounds: string;
  complied: boolean;
  /**
   * ISO datetime compliance was recorded. Stamped once, server-side, so the
   * margin reads "COMPLIED 16.03.2026" — the day it actually happened — instead
   * of silently re-dating itself to today on every reload.
   */
  compliedOn: string;
}

/**
 * Lifecycle of the notice as a whole. Recomputed server-side on every response
 * so a fresh reader sees the right state before any client JS runs.
 */
export type NoticeState = "served" | "responded" | "complied" | "final";

/**
 * The addressee's reply document. Empty on every notice today — it is the
 * drop-in point for the counter-notice (his own demands, rendered as a second
 * document in the same stack). The respond endpoint already accepts
 * `notice: "counter"` and routes into this array.
 */
export interface ICounterNotice {
  /** ISO date the counter-notice was filed. Empty string = not filed. */
  filedOn: string;
  demands: IDemand[];
}

export interface ILegalNoticePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // ── Parties ───────────────────────────────────────────────────────────────
  /** The client on whose instructions the notice issues. */
  senderName: string;
  senderCity: string;
  /** The party served. Drives every second-person line in the notice. */
  addresseeName: string;
  addresseeCity: string;
  // ── The (fictional) advocate ──────────────────────────────────────────────
  advocateName: string;
  advocateEnrollment: string;
  advocateChamber: string;
  // ── Document meta ─────────────────────────────────────────────────────────
  /** e.g. "LN/2026/0447". Also seeds the stamp-paper serial deterministically. */
  refNo: string;
  /** ISO `YYYY-MM-DD`. Stored as a string so it round-trips through JSON and
   *  never shifts across timezones. Rendered as DD.MM.YYYY. */
  datedOn: string;
  /** ISO `YYYY-MM-DD` the relationship began. */
  relationshipSince: string;
  /** Numbered paragraphs. Every one is normalised to begin with "That ". */
  recitals: string[];
  demands: IDemand[];
  /** ISO datetime. `datedOn` + 7 days. Drives the countdown and FINAL NOTICE. */
  complianceDeadline: string;
  escalationClause: string;
  /** Dense footer, joined with " · " at render. Always carries the no-legal-effect line. */
  finePrint: string[];
  noticeState: NoticeState;
  counterNotice: ICounterNotice;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const demandSchema = new Schema<IDemand>(
  {
    id: { type: String, required: true },
    text: { type: String, default: "", maxlength: 60 },
    response: { type: String, enum: ["pending", "accepted", "contested"], default: "pending" },
    grounds: { type: String, default: "", maxlength: 80 },
    complied: { type: Boolean, default: false },
    compliedOn: { type: String, default: "", maxlength: 32 },
  },
  { _id: false }
);

const counterNoticeSchema = new Schema<ICounterNotice>(
  {
    filedOn: { type: String, default: "", maxlength: 32 },
    demands: { type: [demandSchema], default: [] },
  },
  { _id: false }
);

const legalNoticePageSchema = new Schema<ILegalNoticePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", maxlength: 80 },
    senderCity: { type: String, default: "", maxlength: 60 },
    addresseeName: { type: String, default: "", maxlength: 80 },
    addresseeCity: { type: String, default: "", maxlength: 60 },
    advocateName: { type: String, default: "", maxlength: 80 },
    advocateEnrollment: { type: String, default: "", maxlength: 48 },
    advocateChamber: { type: String, default: "", maxlength: 120 },
    refNo: { type: String, default: "", maxlength: 32 },
    datedOn: { type: String, default: "", maxlength: 32 },
    relationshipSince: { type: String, default: "", maxlength: 32 },
    recitals: { type: [String], default: [] },
    demands: { type: [demandSchema], default: [] },
    complianceDeadline: { type: String, default: "", maxlength: 32 },
    escalationClause: { type: String, default: "", maxlength: 600 },
    finePrint: { type: [String], default: [] },
    noticeState: { type: String, enum: ["served", "responded", "complied", "final"], default: "served" },
    counterNotice: { type: counterNoticeSchema, default: () => ({ filedOn: "", demands: [] }) },
    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

legalNoticePageSchema.pre("save", async function (next) {
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

legalNoticePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<ILegalNoticePage>("LegalNoticePage", legalNoticePageSchema);
