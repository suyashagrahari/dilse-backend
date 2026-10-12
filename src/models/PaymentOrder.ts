import mongoose, { Schema, Document } from "mongoose";

export type PaymentOrderStatus = "created" | "paid" | "failed" | "points_used";

export interface IPaymentOrder extends Document {
  userId: mongoose.Types.ObjectId;
  templateType: string;
  pageId: mongoose.Types.ObjectId;
  amount: number;               // minor units of `currency` (paise / cents)
  currency: string;             // "INR" | "USD"
  /** Buyer's country (ISO-2) when the order was created; null if unknown. */
  country?: string | null;
  /** ₹ per unit of `currency` at order time (1 for INR). Frozen for accounting. */
  fxRateToINR?: number;
  /** `amount` in INR paise at `fxRateToINR` — what revenue and commission use. */
  amountInrPaise?: number;
  status: PaymentOrderStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  pointsUsed?: number;

  // ── Pricing snapshot, frozen when the order is created ──────────────────
  //
  // What the buyer was shown, written once and never recomputed: a price,
  // a discount or a season changing later must not rewrite what a past
  // statement says somebody paid. Orders written before these existed have
  // none of them — the revenue service reads `amount` as the list price, a
  // zero discount from source "unknown", and `updatedAt` as the paid time.

  /** The undiscounted price (mrpAmount), minor units of `currency`. */
  listAmount?: number;
  /** listAmount − amount (savingsAmount), minor units of `currency`. */
  discountAmount?: number;
  discountPercent?: number;
  discountSource?: "none" | "admin" | "season_sale";
  /** The season whose sale applied ("dandiya"), only for discountSource "season_sale". */
  seasonMode?: string | null;
  /** The catalogue name at order time ("Dandiya Night"). */
  templateLabel?: string;
  /**
   * When the money (or points) landed: set by whichever of /payment/verify and
   * the Razorpay webhook flips the order to paid, and at creation for a
   * points unlock. The revenue day is this, in IST — not createdAt, which is
   * when checkout opened and can be a different day.
   */
  paidAt?: Date;
  /**
   * `SS-YYYYMM-000123`, assigned the first time the order is put on a billing
   * statement that is actually sent — never at checkout, so the series has no
   * holes for abandoned orders. See services/billingStatement.service.ts.
   */
  invoiceNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderSchema = new Schema<IPaymentOrder>(
  {
    userId:            { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    templateType:      { type: String, required: true },
    pageId:            { type: Schema.Types.ObjectId, required: true, index: true },
    amount:            { type: Number, required: true },
    currency:          { type: String, default: "INR" },
    status:            {
      type: String,
      enum: ["created", "paid", "failed", "points_used"],
      default: "created",
    },
    razorpayOrderId:   { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    pointsUsed:        { type: Number },
    country:           { type: String, default: null },
    fxRateToINR:       { type: Number },
    amountInrPaise:    { type: Number },
    listAmount:        { type: Number },
    discountAmount:    { type: Number },
    discountPercent:   { type: Number },
    discountSource:    { type: String, enum: ["none", "admin", "season_sale"] },
    seasonMode:        { type: String, default: undefined },
    templateLabel:     { type: String },
    paidAt:            { type: Date },
    invoiceNumber:     { type: String },
  },
  { timestamps: true }
);

// Composite index for publish-gate lookup (most frequent query)
paymentOrderSchema.index({ userId: 1, pageId: 1, status: 1 });

// The revenue reports: "paid orders in this window", newest first. paidAt is
// absent on rows from before it existed, which the reports cover with an
// updatedAt fallback (the createdAt index serves the unpaid ledger views).
paymentOrderSchema.index({ status: 1, paidAt: -1 });
paymentOrderSchema.index({ status: 1, createdAt: -1 });

// An invoice number is issued once. Sparse: most orders never get one.
paymentOrderSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });

// Sparse index for Razorpay order lookup during verification
paymentOrderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

export default mongoose.model<IPaymentOrder>("PaymentOrder", paymentOrderSchema);
