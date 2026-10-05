import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth";
import {
  getPricingConfig,
  getPublishAccess,
  createOrder,
  verifyPayment,
  spendPoints,
  getQuote,
} from "../controllers/payment.controller";

/**
 * Per-ACCOUNT limit on the endpoints that create Razorpay orders or flip an
 * order to paid. The global limiter is per IP, so one account behind many
 * addresses — or many accounts behind one — slips past it. 30 attempts in 10
 * minutes is far beyond a real buyer retrying a declined card.
 */
const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // Mounted after `protect`, so userId is always set; the IP is a fallback only.
  keyGenerator: (req) => (req.userId ? `user:${req.userId}` : `ip:${req.ip || "unknown"}`),
  message: { success: false, error: "Too many payment attempts. Please wait a few minutes and try again." },
});

const router = Router();

// Public: client can read pricing to display badges without auth
router.get("/pricing", getPricingConfig);

// Protected: all payment operations require authentication
router.use(protect);
// Asked before publishing, so the paywall can appear with nothing spinning.
router.get("/access", getPublishAccess);
router.get("/quote", getQuote);
router.post("/create-order", paymentLimiter, createOrder);
router.post("/verify",       paymentLimiter, verifyPayment);
router.post("/spend-points", spendPoints);

export default router;
