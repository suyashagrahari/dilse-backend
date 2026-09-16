import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IHoliPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;
  // Sender info
  senderName: string;
  senderFamily: string;
  senderMembers: { name: string; relation: string }[];
  senderPhoto: string;
  // Recipient
  recipientName: string;
  // Two wish cards
  homeWishMessage: string;    // shown on Home page
  congratsMessage: string;    // shown on Wish page (family wish)
  // Display
  hindiTitle: string;
  hindiSubtitle: string;
  englishSubtitle: string;
  holiDate: string;
  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const holiPageSchema = new Schema<IHoliPage>(
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
      default: "Wishing you a Holi filled with vibrant colors and warm joy!",
    },
    congratsMessage: {
      type: String,
      default:
        "Wishing you and your family a very colorful and joyful Holi! May this festival bring happiness, love, and prosperity to your life. Happy Holi from our family to yours!",
    },
    hindiTitle: { type: String, default: "होली है!" },
    hindiSubtitle: {
      type: String,
      default: "आपको और आपके परिवार को होली की हार्दिक शुभकामनाएं",
    },
    englishSubtitle: {
      type: String,
      default: "Wishing you joy, colors, and countless blessings this Holi",
    },
    holiDate: { type: String, default: "2026-03-14T00:00:00" },
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

holiPageSchema.pre("save", async function (next) {
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

holiPageSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  if (!this.password) return true;

  const raw = candidate || "";
  const trimmed = raw.trim();

  // Trimmed first: that is what every page saved since passwords began being
  // trimmed at hash time actually stores.
  if (await bcrypt.compare(trimmed, this.password)) return true;

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
  return bcrypt.compare(raw, this.password);
};

export default mongoose.model<IHoliPage>("HoliPage", holiPageSchema);
