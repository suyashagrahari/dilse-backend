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
  },
  { timestamps: true }
);

// Composite index for publish-gate lookup (most frequent query)
paymentOrderSchema.index({ userId: 1, pageId: 1, status: 1 });

// Sparse index for Razorpay order lookup during verification
paymentOrderSchema.index({ razorpayOrderId: 1 }, { sparse: true });

export default mongoose.model<IPaymentOrder>("PaymentOrder", paymentOrderSchema);
