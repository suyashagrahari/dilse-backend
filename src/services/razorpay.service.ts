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
  amount: number;   // paise (INR × 100)
  currency: string;
  receipt: string;  // max 40 chars, unique per order
}): Promise<RazorpayOrderResponse> {
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
