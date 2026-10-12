// ─── Billing statements: choosing the orders, numbering them, sending ───────
//
// MANUAL ONLY. Nothing in this file runs on a schedule or in reaction to a
// payment: a statement goes out when a super admin presses Send for one user,
// and only then. The preview endpoint runs the same selection and the same
// builder with nothing written — no invoice numbers taken, no record kept.
//
// ── WHICH ORDERS ────────────────────────────────────────────────────────────
//
// Only settled orders (paid, points_used) of THAT user. Either an IST date
// range, or an explicit list of order ids — every one of which must belong to
// the user, or the request is refused rather than silently trimmed: a statement
// that quietly drops a line the admin ticked is worse than an error.
//
// ── WHERE IT GOES ───────────────────────────────────────────────────────────
//
// To the account's own email address, always. There is deliberately no way to
// pass a recipient: a billing endpoint that mails an arbitrary address is a
// way to send anyone's payment history to anyone.

import mongoose from "mongoose";
import PaymentOrder from "../models/PaymentOrder";
import BillingStatement from "../models/BillingStatement";
import { nextSequence } from "../models/Counter";
import { env } from "../config/env";
import { buildStatementEmail, type BuiltStatement, type StatementLine } from "./billingEmail";
import { shareUrl, settledBetween, toLedgerItems, type LedgerItem } from "./revenue.service";
import {
  MAX_CUSTOM_DAYS,
  daysInclusive,
  dayRange,
  formatInvoiceNumber,
  isYmd,
  istDate,
  orderSetKey,
  type LedgerOrder,
} from "./revenueMath";

export const BILLING_FROM_NAME = "SubhSandesh Billing";
/** An identical statement (same user, same orders) inside this window is a double click. */
export const RESEND_GUARD_MS = 10 * 60 * 1000;
const MAX_ORDER_IDS = 500;
const MAX_NOTE = 1000;

/** A request the caller can fix — the controller answers 400 (or `status`). */
export class StatementError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface StatementRequest {
  from: string | null;
  to: string | null;
  orderIds: string[];
  note: string;
}

/** Validates the preview/send body. Pure. */
export function parseStatementRequest(body: unknown): StatementRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawIds = Array.isArray(b.orderIds) ? b.orderIds : [];
  if (rawIds.length > MAX_ORDER_IDS) throw new StatementError(`At most ${MAX_ORDER_IDS} orders per statement.`);
  const orderIds = [...new Set(rawIds.map((x) => String(x)))];
  for (const id of orderIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new StatementError(`"${id}" is not a valid order id.`);
  }
  const from = b.from === undefined || b.from === null || b.from === "" ? null : b.from;
  const to = b.to === undefined || b.to === null || b.to === "" ? null : b.to;
  if ((from !== null && !isYmd(from)) || (to !== null && !isYmd(to))) {
    throw new StatementError("from and to must be dates as YYYY-MM-DD.");
  }
  if (orderIds.length === 0) {
    if (from === null || to === null) throw new StatementError("Choose a day or a date range, or tick the orders to include.");
  }
  if (from !== null && to !== null) {
    if (from > to) throw new StatementError("from must be on or before to.");
    if (daysInclusive(from, to) > MAX_CUSTOM_DAYS) throw new StatementError(`A statement can cover at most ${MAX_CUSTOM_DAYS} days.`);
  }
  const note = typeof b.note === "string" ? b.note.trim() : "";
  if (note.length > MAX_NOTE) throw new StatementError(`The note can be at most ${MAX_NOTE} characters.`);
  return { from: from as string | null, to: to as string | null, orderIds, note };
}

interface TargetUser {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  status?: string;
}

interface Selection {
  orders: LedgerOrder[];
  period: { from: string; to: string };
}

/** The settled orders a statement covers, oldest first. */
async function selectOrders(user: TargetUser, req: StatementRequest): Promise<Selection> {
  let orders: LedgerOrder[];
  if (req.orderIds.length > 0) {
    const found = await PaymentOrder.find({ _id: { $in: req.orderIds }, userId: user._id }).lean<LedgerOrder[]>();
    if (found.length !== req.orderIds.length) {
      throw new StatementError("Some of those orders do not belong to this user.");
    }
    const unsettled = found.filter((o) => o.status !== "paid" && o.status !== "points_used");
    if (unsettled.length) {
      throw new StatementError("Only paid orders and points unlocks can go on a statement.");
    }
    orders = found;
  } else {
    const r = dayRange(req.from!, req.to!);
    orders = await PaymentOrder.find({ ...settledBetween(r.start, r.end), userId: user._id }).lean<LedgerOrder[]>();
  }
  if (orders.length === 0) {
    throw new StatementError("There are no paid orders or points unlocks for this user in that selection.");
  }

  const at = (o: LedgerOrder) => new Date(String(o.paidAt || o.updatedAt || o.createdAt)).getTime();
  orders.sort((a, b) => at(a) - at(b));
  const days = orders.map((o) => istDate(new Date(at(o))));
  return {
    orders,
    period: {
      from: req.from ?? days[0],
      to: req.to ?? days[days.length - 1],
    },
  };
}

function toLines(items: LedgerItem[]): StatementLine[] {
  return items.map((it) => ({
    orderId: it._id,
    paidAt: it.paidAt ?? new Date(String(it.createdAt)),
    invoiceNumber: it.invoiceNumber,
    templateLabel: it.templateLabel,
    pageUrl: it.pagePublished ? shareUrl(it.pageShareId) : null,
    status: it.status === "points_used" ? "points_used" : "paid",
    currency: it.currency,
    listAmount: it.listAmount,
    discountAmount: it.discountAmount,
    discountLabel: it.discountLabel,
    pointsUsed: it.pointsUsed,
    amount: it.status === "points_used" ? 0 : it.amount,
    amountInrPaise: it.amountInrPaise,
    razorpayPaymentId: it.razorpayPaymentId,
  }));
}

/**
 * Gives every PAID order on the statement that lacks one an invoice number.
 *
 * Points unlocks get none: no money changed hands, so there is nothing to
 * invoice. Numbers are taken oldest order first so they read in payment order.
 * The write is conditional on the order still having no number — if a
 * concurrent send numbered it first, that number stands and the one taken here
 * becomes a gap (never a duplicate; the field is also uniquely indexed).
 */
async function assignInvoiceNumbers(orders: LedgerOrder[]): Promise<void> {
  for (const o of orders) {
    if (o.status !== "paid" || o.invoiceNumber) continue;
    const number = formatInvoiceNumber(new Date(), await nextSequence("invoice"));
    const r = await PaymentOrder.updateOne(
      { _id: o._id, invoiceNumber: { $exists: false } },
      { $set: { invoiceNumber: number } }
    );
    if (r.modifiedCount === 1) {
      o.invoiceNumber = number;
    } else {
      const fresh = await PaymentOrder.findById(o._id).select("invoiceNumber").lean<{ invoiceNumber?: string }>();
      o.invoiceNumber = fresh?.invoiceNumber;
    }
  }
}

export interface PreviewResult extends BuiltStatement {
  to: string;
  period: { from: string; to: string };
  orderIds: string[];
}

async function build(user: TargetUser, req: StatementRequest, sel: Selection, preview: boolean): Promise<PreviewResult> {
  const items = await toLedgerItems(sel.orders);
  // The ledger item names the user from a lookup; the statement is addressed
  // to the account itself, so take it from the loaded user.
  const built = buildStatementEmail({
    billedTo: { name: user.name, email: user.email },
    period: sel.period,
    lines: toLines(items),
    note: req.note,
    preview,
  });
  return { ...built, to: user.email, period: sel.period, orderIds: sel.orders.map((o) => String(o._id)) };
}

function refuseClosed(user: TargetUser) {
  if (user.status === "closed") {
    throw new StatementError("This account is closed — statements cannot be sent to it.", 409);
  }
}

export async function previewStatement(user: TargetUser, body: unknown): Promise<PreviewResult> {
  const req = parseStatementRequest(body);
  return build(user, req, await selectOrders(user, req), true);
}

// One send at a time per (user, order set) in this process — the database guard
// below cannot see a send that has not been recorded yet, and two clicks 200ms
// apart would otherwise both pass it.
const inflight = new Set<string>();

export interface SendResult {
  status: "sent" | "skipped" | "failed";
  message: string;
  error: string | null;
  statement: {
    _id: string;
    sentAt: Date;
    sentByEmail: string;
    period: { from: string; to: string };
    orderCount: number;
    totalInrPaise: number;
    to: string;
    messageId: string | null;
    status: "sent" | "skipped" | "failed";
    error: string | null;
  };
  subject: string;
  orderCount: number;
  totalInrPaise: number;
  to: string;
  invoiceNumbers: string[];
}

export async function sendStatement(
  user: TargetUser,
  body: unknown,
  actor: { id: string; email: string },
  deps: {
    send: (e: { to: string; subject: string; text: string; html: string; from: string; fromName: string; replyTo: string }) => Promise<{ outcome: "sent" | "skipped"; messageId?: string }>;
    configured: () => boolean;
  }
): Promise<SendResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.confirm !== true) throw new StatementError("Sending needs confirm: true.");
  refuseClosed(user);
  const req = parseStatementRequest(body);
  const sel = await selectOrders(user, req);
  const orderKey = orderSetKey(sel.orders.map((o) => String(o._id)));
  const lockKey = `${user._id}|${orderKey}`;

  if (inflight.has(lockKey)) {
    throw new StatementError("This statement is already being sent.", 409);
  }
  inflight.add(lockKey);
  try {
    const recent = await BillingStatement.findOne({
      userId: user._id,
      orderKey,
      status: "sent",
      createdAt: { $gte: new Date(Date.now() - RESEND_GUARD_MS) },
    })
      .select("_id createdAt")
      .lean();
    if (recent) {
      throw new StatementError("This exact statement was sent to this user less than 10 minutes ago.", 409);
    }

    // Numbers are only taken for a send that can actually go out. With SES
    // unconfigured (a laptop, a test) the statement is "skipped" and the
    // series is left untouched.
    const configured = deps.configured();
    if (configured) await assignInvoiceNumbers(sel.orders);
    const email = await build(user, req, sel, !configured);

    let status: "sent" | "skipped" | "failed" = "failed";
    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const r = await deps.send({
        to: user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        from: env.BILLING_FROM_EMAIL,
        fromName: BILLING_FROM_NAME,
        replyTo: env.BILLING_REPLY_TO_EMAIL,
      });
      status = r.outcome;
      messageId = r.messageId ?? null;
    } catch (err) {
      status = "failed";
      error = (err as Error)?.message || "Unknown error";
    }

    const doc = await BillingStatement.create({
      userId: user._id,
      sentBy: new mongoose.Types.ObjectId(actor.id),
      sentByEmail: actor.email,
      to: user.email,
      period: sel.period,
      orderIds: sel.orders.map((o) => o._id),
      orderKey,
      orderCount: email.orderCount,
      totalInrPaise: email.totalInrPaise,
      subject: email.subject,
      note: req.note || undefined,
      messageId,
      status,
      error,
    });

    return {
      status,
      message:
        status === "sent"
          ? `Statement sent to ${user.email}.`
          : status === "skipped"
            ? "SES is not configured on this server — nothing was sent."
            : `The statement could not be sent: ${error}`,
      error,
      statement: {
        _id: String(doc._id),
        sentAt: doc.createdAt,
        sentByEmail: doc.sentByEmail,
        period: sel.period,
        orderCount: doc.orderCount,
        totalInrPaise: doc.totalInrPaise,
        to: doc.to,
        messageId,
        status,
        error,
      },
      subject: email.subject,
      orderCount: email.orderCount,
      totalInrPaise: email.totalInrPaise,
      to: user.email,
      invoiceNumbers: sel.orders.map((o) => o.invoiceNumber).filter((n): n is string => !!n),
    };
  } finally {
    inflight.delete(lockKey);
  }
}
