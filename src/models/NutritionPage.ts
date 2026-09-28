import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";
import { loveKitFields, type ILovePhoto } from "../utils/loveMedia";

// ─── Nutrition Facts — the persisted shape ───────────────────────────────────
//
// Mirrors `NutritionData` in
// client/app/(templates)/nutrition/components/types.ts, field for field.
//
// ── THE ONE THING THAT WOULD KILL THIS TEMPLATE AT THE DATABASE LAYER ─────────
//
// `calories` is a String. So is every `dv`. The headline calorie count in the
// demo is "∞", and a Number-typed path would cast that to NaN on the way in and
// print "NaN" on a page somebody sent to a person they love. Mongoose casts
// silently and the editor would look fine right up until the reload. These
// fields are FREE TEXT: stored as given, printed as given, never parsed.

export interface INutrient {
  label: string;
  amount: string;
  dv: string;
  bold: boolean;
  indent: number;
  note: string;
}

export interface IVitamin {
  label: string;
  dv: string;
  note: string;
}

export interface INutritionPage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  productName: string;
  servingSize: string;
  servingsPerContainer: string;
  /** FREE TEXT. "∞" is a valid value. Never a Number. */
  calories: string;
  caloriesNote: string;
  nutrients: INutrient[];
  vitamins: IVitamin[];
  notSignificantSource: string[];
  footnote: string;
  ingredients: string[];
  allergen: string;
  message: string[];
  photoUrl: string;
  distributedBy: string;

  // Love kit — "servings" (photos + memory notes), side-effect GIFs, the note
  // inside the wrapper (main letter), the packaging theme and the letter lock.
  photos: ILovePhoto[];
  gifs: string[];
  letter: string;
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

const nutritionPageSchema = new Schema<INutritionPage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    productName: { type: String, default: "" },
    servingSize: { type: String, default: "" },
    servingsPerContainer: { type: String, default: "" },
    // String. See the note at the top of this file before changing it.
    calories: { type: String, default: "" },
    caloriesNote: { type: String, default: "" },
    nutrients: {
      type: [
        {
          label: { type: String, default: "" },
          amount: { type: String, default: "" },
          // String, for the same reason `calories` is.
          dv: { type: String, default: "" },
          bold: { type: Boolean, default: false },
          indent: { type: Number, default: 0 },
          note: { type: String, default: "" },
        },
      ],
      default: [],
    },
    vitamins: {
      type: [
        {
          label: { type: String, default: "" },
          dv: { type: String, default: "" },
          note: { type: String, default: "" },
        },
      ],
      default: [],
    },
    notSignificantSource: { type: [String], default: [] },
    footnote: { type: String, default: "" },
    ingredients: { type: [String], default: [] },
    allergen: { type: String, default: "" },
    message: { type: [String], default: [] },
    photoUrl: { type: String, default: "" },
    distributedBy: { type: String, default: "" },

    // Love kit (photos, gifs, letter, theme, lockQuestion, lockAnswer).
    ...loveKitFields,

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

nutritionPageSchema.pre("save", async function (next) {
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

nutritionPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<INutritionPage>("NutritionPage", nutritionPageSchema);
