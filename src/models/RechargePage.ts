import mongoose, { Schema, Document } from "mongoose";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { rememberPagePassword } from "../services/pagePasswordRecovery";

/**
 * Recharge — a prepaid top-up flow played straight: subscriber strip, category
 * rail, plan grid, payment sheet, receipt. The operator is the invented
 * "DIL Prepaid" and the payment rails are invented with it; no real network and
 * no real payment app is named or coloured anywhere in this template.
 *
 * THE FIELD THAT DECIDES THIS TEMPLATE: `price` is a String and stays one. The
 * headline plan's price is "∞". Nothing here — and nothing downstream — parses,
 * sums, sorts or compares it as a number, and the grid renders plans in stored
 * order because stored order is the whole ordering rule.
 */

/** One tab in the category rail. `id` is what plans point at. */
export interface IPlanCategory {
  id: string;
  label: string;
}

/** One row of a plan card's detail table. */
export interface IPlanRow {
  label: string;
  value: string;
  note?: string;
}

export interface IPlan {
  id: string;
  /** STRING. Never Number()/parseInt/parseFloat — see the header. */
  price: string;
  /** Must match an IPlanCategory.id; a plan pointing nowhere is rehomed on read. */
  categoryId: string;
  validity: string;
  /** "Most Recharged" / "Best Value" — the ribbon on the card. */
  badge?: string;
  rows: IPlanRow[];
  benefits: string[];
  /** A greyed card that cannot be selected. */
  disabled?: boolean;
  /** Why. Rendered in place of the button. */
  disabledReason?: string;
}

/** One row in the payment sheet. */
export interface IPaymentMethod {
  id: string;
  label: string;
  sub?: string;
}

export interface IRechargePage extends Document {
  userId: mongoose.Types.ObjectId;
  shareId: string;

  operator: { name: string; tagline: string };
  subscriber: { name: string; number: string; circle: string };
  /** The strip at the top: what is running out, and the line under it. */
  currentPlan: { expiresIn: string; note: string };
  categories: IPlanCategory[];
  /** Stored order IS render order. Never sorted by price. */
  plans: IPlan[];
  payment: { methods: IPaymentMethod[] };
  /** The payoff, shown once the payment sheet closes. */
  receipt: { message: string[] };

  /** Carried for uniformity with the other templates; recharge has no contributor loop. */
  contributorsEnabled: boolean;

  // Security & meta
  password: string;
  passwordRaw: string;
  viewCount: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const planCategorySchema = new Schema<IPlanCategory>(
  {
    id: { type: String, default: "", maxlength: 48 },
    label: { type: String, default: "", maxlength: 60 },
  },
  { _id: false }
);

const planRowSchema = new Schema<IPlanRow>(
  {
    label: { type: String, default: "", maxlength: 60 },
    value: { type: String, default: "", maxlength: 80 },
    note: { type: String, default: "", maxlength: 200 },
  },
  { _id: false }
);

const planSchema = new Schema<IPlan>(
  {
    id: { type: String, default: "", maxlength: 48 },
    // String on purpose. "∞" is a legal price and must survive a round trip.
    price: { type: String, default: "—", maxlength: 24 },
    categoryId: { type: String, default: "", maxlength: 48 },
    validity: { type: String, default: "", maxlength: 48 },
    badge: { type: String, default: "", maxlength: 32 },
    rows: { type: [planRowSchema], default: [] },
    benefits: { type: [String], default: [] },
    disabled: { type: Boolean, default: false },
    disabledReason: { type: String, default: "", maxlength: 300 },
  },
  { _id: false }
);

const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    id: { type: String, default: "", maxlength: 48 },
    label: { type: String, default: "", maxlength: 60 },
    sub: { type: String, default: "", maxlength: 200 },
  },
  { _id: false }
);

const rechargePageSchema = new Schema<IRechargePage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shareId: { type: String, unique: true, sparse: true, index: true },

    operator: {
      type: new Schema<IRechargePage["operator"]>(
        {
          name: { type: String, default: "", maxlength: 60 },
          tagline: { type: String, default: "", maxlength: 120 },
        },
        { _id: false }
      ),
      default: () => ({ name: "", tagline: "" }),
    },
    subscriber: {
      type: new Schema<IRechargePage["subscriber"]>(
        {
          name: { type: String, default: "", maxlength: 60 },
          number: { type: String, default: "", maxlength: 32 },
          circle: { type: String, default: "", maxlength: 60 },
        },
        { _id: false }
      ),
      default: () => ({ name: "", number: "", circle: "" }),
    },
    currentPlan: {
      type: new Schema<IRechargePage["currentPlan"]>(
        {
          expiresIn: { type: String, default: "", maxlength: 48 },
          note: { type: String, default: "", maxlength: 240 },
        },
        { _id: false }
      ),
      default: () => ({ expiresIn: "", note: "" }),
    },
    categories: { type: [planCategorySchema], default: [] },
    plans: { type: [planSchema], default: [] },
    payment: {
      type: new Schema<IRechargePage["payment"]>(
        {
          methods: { type: [paymentMethodSchema], default: [] },
        },
        { _id: false }
      ),
      default: () => ({ methods: [] }),
    },
    receipt: {
      type: new Schema<IRechargePage["receipt"]>(
        {
          message: { type: [String], default: [] },
        },
        { _id: false }
      ),
      default: () => ({ message: [] }),
    },

    contributorsEnabled: { type: Boolean, default: false },

    // Security & meta
    password: { type: String, default: "" },
    passwordRaw: { type: String, default: "", select: false },
    viewCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

rechargePageSchema.pre("save", async function (next) {
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

rechargePageSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
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

export default mongoose.model<IRechargePage>("RechargePage", rechargePageSchema);
