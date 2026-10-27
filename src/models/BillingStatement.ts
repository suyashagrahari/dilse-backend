import mongoose, { Schema, Document } from "mongoose";

/**
 * One billing statement a super admin sent (or tried to send) to one user.
 *
 * Statements are manual only — a super admin presses Send for one particular
 * user; nothing here is ever sent on a schedule. This row is the record of that
 * press: who sent it, to which address, covering which orders and what total,
 * and what SES said. It is an accounting record and is KEPT when an account is
 * closed and its data deleted (see services/accountClosure.service.ts).
 *
 * `orderKey` is the sorted order ids joined with commas — "the same statement"
 * for the double-click guard (an identical statement sent in the last ten
 * minutes is refused with 409).
 */
export type BillingStatementStatus = "sent" | "skipped" | "failed";

export interface IBillingStatement extends Document {
  userId: mongoose.Types.ObjectId;
  sentBy: mongoose.Types.ObjectId;
  sentByEmail: string;
  to: string;
  period: { from: string; to: string };
  orderIds: mongoose.Types.ObjectId[];
  orderKey: string;
  orderCount: number;
  totalInrPaise: number;
  subject: string;
  note?: string;
  /** The thank-you message the email opened with, as sent. */
  message?: string;
  messageId?: string | null;
  status: BillingStatementStatus;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const billingStatementSchema = new Schema<IBillingStatement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sentByEmail: { type: String, required: true },
    to: { type: String, required: true },
    period: {
      from: { type: String, required: true },
      to: { type: String, required: true },
    },
    orderIds: [{ type: Schema.Types.ObjectId, ref: "PaymentOrder" }],
    orderKey: { type: String, required: true },
    orderCount: { type: Number, required: true },
    totalInrPaise: { type: Number, required: true },
    subject: { type: String, required: true },
    note: { type: String, maxlength: 1000 },
    message: { type: String, maxlength: 1500 },
    messageId: { type: String, default: null },
    status: { type: String, enum: ["sent", "skipped", "failed"], required: true },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

billingStatementSchema.index({ userId: 1, createdAt: -1 });
billingStatementSchema.index({ userId: 1, orderKey: 1, createdAt: -1 });

export default mongoose.model<IBillingStatement>("BillingStatement", billingStatementSchema);
