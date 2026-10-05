import crypto from "crypto";
import { env } from "../config/env";

interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

/**
 * Creates a Razorpay order via REST API (no extra npm package needed).
 * Uses Basic Auth with key_id:key_secret base64-encoded.
 */
export async function createRazorpayOrder(params: {
  amount: number;   // minor units: paise for INR, cents for USD
  currency: "INR" | "USD";
  receipt: string;  // max 40 chars, unique per order
  /** Up to 15 string key/values Razorpay stores on the order — for reconciliation. */
  notes?: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
  if (!Number.isInteger(params.amount) || params.amount < 100) {
    // Razorpay's floor is 100 minor units in both currencies (₹1 / $1); refuse
    // before calling out rather than surfacing their error to a buyer.
    throw new Error(`Refusing to create an order for ${params.amount} ${params.currency}`);
  }
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      ...(params.notes ? { notes: params.notes } : {}),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Razorpay order creation failed (${response.status}): ${errText}`);
  }

  return response.json() as Promise<RazorpayOrderResponse>;
}

/**
 * Verifies the Razorpay payment signature using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Razorpay signature = HMAC_SHA256(key_secret, orderId + "|" + paymentId)
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const { RAZORPAY_KEY_SECRET } = env;

  if (!RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay key secret not configured");
  }

  const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expectedHex = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const received = Buffer.from(params.razorpaySignature, "hex");

    // Buffers must be same length for timingSafeEqual
    if (expected.length !== received.length) return false;

    return crypto.timingSafeEqual(expected, received);
  } catch {
    // Invalid hex or buffer error → treat as invalid signature
    return false;
  }
}


/**
 * Verifies a Razorpay WEBHOOK signature: HMAC-SHA256 of the raw request body,
 * keyed with the webhook secret set in the Razorpay dashboard (a different
 * secret from the API key secret). Must be computed over the exact bytes
 * received — re-serialising parsed JSON changes them and fails the check.
 */
export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret || !rawBody?.length) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
