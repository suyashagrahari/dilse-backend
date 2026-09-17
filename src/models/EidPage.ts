import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

export interface IEidPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // Sender info
  senderName: string;
  senderFamily: string;
  senderMembers: { name: string; relation: string }[];
  senderPhoto: string;
  // Recipient
  recipientName: string;
  // Wish messages
  homeWishMessage: string;
  congratsMessage: string;
  // Display
  urduTitle: string;
  urduSubtitle: string;
  englishSubtitle: string;
  eidDate: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const eidPageSchema = new Schema<IEidPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },
    senderName: { type: String, default: "", trim: true },
    senderFamily: { type: String, default: "Family", trim: true },
    senderMembers: {
      type: [{ name: String, relation: String }],
      default: [],
    },
    senderPhoto: { type: String, default: "" },
    recipientName: { type: String, default: "", trim: true },
    homeWishMessage: {
      type: String,
      default:
        "Every moment we share becomes a treasure I hold close to my heart. Thank you for being the reason I smile every single day. May this Eid fill your heart with pure joy and boundless happiness.",
    },
    congratsMessage: {
      type: String,
      default:
        "Wishing you and your family a very blessed Eid! May this Eid bring joy, happiness, and prosperity to your life. Eid Mubarak from our family to yours!",
    },
    urduTitle: { type: String, default: "عید مبارک" },
    urduSubtitle: {
      type: String,
      default: "آپ کو اور آپ کے خاندان کو عید الفطر مبارک ہو",
    },
    englishSubtitle: {
      type: String,
      default: "Wishing you joy, peace, and countless blessings this Eid",
    },
    eidDate: { type: String, default: "2026-03-20T00:00:00" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

eidPageSchema.pre("save", async function (next) {
  if (!this.shareId) {
    this.shareId = randomUUID();
  }
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

eidPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
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

export default mongoose.model<IEidPage>("EidPage", eidPageSchema);
