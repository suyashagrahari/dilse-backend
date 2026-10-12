// ─── Razorpay webhook ────────────────────────────────────────────────────────
//
// POST /api/webhooks/razorpay — called by Razorpay, not by a browser.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
//
// Until now an order became "paid" only when the buyer's browser called
// /payment/verify after checkout. A buyer who closes the tab, loses network, or
// pays through PayPal (whose confirmation can arrive after the popup closes)
// would have been charged with nothing unlocked. Razorpay's server-to-server
// event is the backstop: it marks the same order paid, idempotently.
//
// ── TRUST ───────────────────────────────────────────────────────────────────
//
//   1. HMAC-SHA256 over the RAW body with RAZORPAY_WEBHOOK_SECRET, compared in
//      constant time. No secret configured → 503, never "trust anyway".
//   2. The order must be one WE created (looked up by razorpayOrderId).
//   3. The captured amount AND currency must equal what we stored on the order.
//      A signed event for a different amount is logged loudly and NOT applied.
//   4. The transition is conditional (status created|failed → paid), so the
//      webhook and /payment/verify racing each other mark it once.
//
// Always answers 2xx for events it has handled or chosen to ignore, so
// Razorpay does not retry them forever; 4xx only for a bad signature.

import type { Request, Response } from "express";
import PaymentOrder from "../models/PaymentOrder";
import { env } from "../config/env";
import { verifyRazorpayWebhookSignature } from "../services/razorpay.service";
import { recordEarningForOrder } from "../services/influencer.service";

interface RzpPayment {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  method?: string;
}

interface RzpEvent {
  event?: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    order?: { entity?: { id?: string; amount_paid?: number; currency?: string; status?: string } };
  };
}

const PAID_EVENTS = new Set(["payment.captured", "order.paid"]);

export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[rzp-webhook] RAZORPAY_WEBHOOK_SECRET is not set — refusing event");
    res.status(503).json({ ok: false });
    return;
  }

  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  const signature = req.get("x-razorpay-signature");
  if (!raw || !verifyRazorpayWebhookSignature(raw, signature, secret)) {
    console.warn("[rzp-webhook] bad or missing signature from", req.ip);
    res.status(400).json({ ok: false });
    return;
  }

  let evt: RzpEvent;
  try {
    evt = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ ok: false });
    return;
  }

  const eventName = String(evt.event || "");
  try {
    if (!PAID_EVENTS.has(eventName)) {
      // payment.failed etc.: a failed ATTEMPT does not fail the order — the
      // buyer can retry inside the same checkout. Acknowledge and move on.
      res.json({ ok: true, ignored: eventName });
      return;
    }

    const payment = evt.payload?.payment?.entity;
    const orderId = payment?.order_id || evt.payload?.order?.entity?.id;
    if (!payment?.id || !orderId) {
      res.json({ ok: true, ignored: "no payment/order id" });
      return;
    }

    const order = await PaymentOrder.findOne({ razorpayOrderId: orderId });
    if (!order) {
      // Not ours (same Razorpay account, another product), or a test event.
      res.json({ ok: true, ignored: "unknown order" });
      return;
    }

    if (payment.amount !== order.amount || String(payment.currency || "").toUpperCase() !== order.currency) {
      console.error(
        `[rzp-webhook] AMOUNT MISMATCH on ${orderId}: paid ${payment.amount} ${payment.currency}, ` +
          `order is ${order.amount} ${order.currency}. Not marking paid — investigate.`
      );
      res.json({ ok: true, ignored: "amount mismatch" });
      return;
    }

    const updated = await PaymentOrder.findOneAndUpdate(
      { _id: order._id, status: { $in: ["created", "failed"] } },
      { $set: { status: "paid", razorpayPaymentId: payment.id, paidAt: new Date() } },
      { new: true }
    );
    if (updated) {
      console.log(`[rzp-webhook] ${eventName}: order ${orderId} marked paid (${payment.method || "?"})`);
      await recordEarningForOrder(updated);
    }
    res.json({ ok: true });
  } catch (err) {
    // 500 makes Razorpay retry later — right for a transient DB failure.
    console.error("[rzp-webhook] handler error:", err);
    res.status(500).json({ ok: false });
  }
};
