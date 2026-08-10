import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

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
    this.passwordRaw = this.password;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

nutritionPageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return true;
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<INutritionPage>("NutritionPage", nutritionPageSchema);
