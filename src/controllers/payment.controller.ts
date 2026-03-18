import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import PointTransaction from "../models/PointTransaction";
import PaymentOrder from "../models/PaymentOrder";
import HoliPage from "../models/HoliPage";
import EidPage from "../models/EidPage";
import WeddingPage from "../models/WeddingPage";
import ReceptionPage from "../models/ReceptionPage";
import BirthdayPage from "../models/BirthdayPage";
import ValentinePage from "../models/ValentinePage";
import { getPricing, TEMPLATE_PRICING } from "../config/templatePricing";
import { createRazorpayOrder, verifyRazorpaySignature } from "../services/razorpay.service";
import { env } from "../config/env";

// ── Page ownership map ──────────────────────────────────────────────────────
// Maps templateType → mongoose model for ownership verification
const PAGE_MODELS: Record<string, mongoose.Model<unknown>> = {
  holi:      HoliPage      as unknown as mongoose.Model<unknown>,
  eid:       EidPage       as unknown as mongoose.Model<unknown>,
  wedding:   WeddingPage   as unknown as mongoose.Model<unknown>,
  reception: ReceptionPage as unknown as mongoose.Model<unknown>,
  birthday:  BirthdayPage  as unknown as mongoose.Model<unknown>,
  valentine: ValentinePage as unknown as mongoose.Model<unknown>,
};

/** Returns true if the page exists and belongs to the given userId */
async function verifyPageOwnership(
  templateType: string,
  pageId: string,
  userId: string
): Promise<boolean> {
  const Model = PAGE_MODELS[templateType];
  if (!Model) return false;
  try {
    const page = await Model.findOne({
      _id: new mongoose.Types.ObjectId(pageId),
      userId: new mongoose.Types.ObjectId(userId),
    });
    return !!page;
  } catch {
    return false;
  }
}

// ── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /payment/pricing  — PUBLIC
 * Returns the full pricing config so the client can display prices without an extra call.
 */
export const getPricingConfig = (_req: Request, res: Response): void => {
  res.json({ success: true, data: TEMPLATE_PRICING });
};

/**
 * POST /payment/create-order  — PROTECTED
 * Creates a Razorpay order for a given template page.
 * Returns the orderId and public key so the client can open the Razorpay checkout.
 */
export const createOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.body as { templateType?: string; pageId?: string };

    if (!templateType || !pageId) {
      res.status(400).json({ success: false, error: "templateType and pageId are required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }

    const pricing = getPricing(templateType);

    if (pricing.isFree) {
      res.status(400).json({ success: false, error: "This template is free — no payment required" });
      return;
    }

    // Verify the requesting user actually owns the page
    const owns = await verifyPageOwnership(templateType, pageId, String(req.userId));
    if (!owns) {
      res.status(403).json({ success: false, error: "Page not found or access denied" });
      return;
    }

    // Idempotency: don't create a duplicate order if already unlocked
    const existing = await PaymentOrder.findOne({
      userId: req.userId,
      pageId: new mongoose.Types.ObjectId(pageId),
      status: { $in: ["paid", "points_used"] },
    });
    if (existing) {
      res.status(400).json({ success: false, error: "Page is already unlocked for publishing" });
      return;
    }

    // Razorpay receipt: max 40 chars, must be unique
    const receipt = `pay_${pageId}_${Date.now()}`.slice(0, 40);

    const razorpayOrder = await createRazorpayOrder({
      amount: pricing.finalPricePaise,
      currency: "INR",
      receipt,
    });

    // Persist the order so we can verify it later
    const paymentOrder = await PaymentOrder.create({
      userId:          req.userId,
      templateType,
      pageId:          new mongoose.Types.ObjectId(pageId),
      amount:          pricing.finalPricePaise,
      currency:        "INR",
      status:          "created",
      razorpayOrderId: razorpayOrder.id,
    });

    res.status(201).json({
      success: true,
      data: {
        orderId:        razorpayOrder.id,
        paymentOrderId: String(paymentOrder._id),
        amount:         pricing.finalPricePaise,
        currency:       "INR",
        keyId:          env.RAZORPAY_KEY_ID,
        name:           pricing.name,
        description:    `Unlock ${pricing.name} — ${pricing.discountPercent}% off`,
      },
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ success: false, error: "Failed to create payment order" });
  }
};

/**
 * POST /payment/verify  — PROTECTED
 * Verifies the Razorpay payment signature server-side (HMAC-SHA256).
 * Marks the PaymentOrder as "paid" on success so the publish gate clears.
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpaySignature?: string;
    };

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({
        success: false,
        error: "razorpayOrderId, razorpayPaymentId, and razorpaySignature are required",
      });
      return;
    }

    // Find the order — MUST belong to the requesting user (prevents cross-user verification)
    const paymentOrder = await PaymentOrder.findOne({
      razorpayOrderId,
      userId: req.userId,
    });

    if (!paymentOrder) {
      res.status(404).json({ success: false, error: "Payment order not found" });
      return;
    }

    // Idempotency: already verified successfully
    if (paymentOrder.status === "paid") {
      res.json({ success: true, message: "Payment already verified" });
      return;
    }

    if (paymentOrder.status !== "created") {
      res.status(400).json({ success: false, error: "Payment order is in an invalid state" });
      return;
    }

    // Cryptographic signature verification (constant-time)
    const isValid = verifyRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      paymentOrder.status = "failed";
      await paymentOrder.save();
      res.status(400).json({ success: false, error: "Payment verification failed: invalid signature" });
      return;
    }

    // Mark as paid
    paymentOrder.status            = "paid";
    paymentOrder.razorpayPaymentId = razorpayPaymentId;
    paymentOrder.razorpaySignature = razorpaySignature;
    await paymentOrder.save();

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    console.error("Verify payment error:", error);
    res.status(500).json({ success: false, error: "Payment verification failed" });
  }
};

/**
 * POST /payment/spend-points  — PROTECTED
 * Atomically deducts points from the user as an alternative to paying.
 * Uses MongoDB findOneAndUpdate with a balance guard to prevent race conditions.
 */
export const spendPoints = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.body as { templateType?: string; pageId?: string };

    if (!templateType || !pageId) {
      res.status(400).json({ success: false, error: "templateType and pageId are required" });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid pageId" });
      return;
    }

    const pricing = getPricing(templateType);

    if (pricing.isFree || pricing.pointsCost === 0) {
      res.status(400).json({ success: false, error: "This template does not support points payment" });
      return;
    }

    // Verify the requesting user actually owns the page
    const owns = await verifyPageOwnership(templateType, pageId, String(req.userId));
    if (!owns) {
      res.status(403).json({ success: false, error: "Page not found or access denied" });
      return;
    }

    // Idempotency: already unlocked
    const existing = await PaymentOrder.findOne({
      userId: req.userId,
      pageId: new mongoose.Types.ObjectId(pageId),
      status: { $in: ["paid", "points_used"] },
    });
    if (existing) {
      res.status(400).json({ success: false, error: "Page is already unlocked for publishing" });
      return;
    }

    // Atomic deduction — only succeeds if user.points >= pointsCost
    // This prevents over-spending in concurrent requests (no race condition)
    const updatedUser = await User.findOneAndUpdate(
      { _id: req.userId, points: { $gte: pricing.pointsCost } },
      { $inc: { points: -pricing.pointsCost } },
      { new: true, select: "points" }
    );

    if (!updatedUser) {
      res.status(400).json({ success: false, error: "Insufficient points" });
      return;
    }

    // Create the payment record (so publish gate clears)
    await PaymentOrder.create({
      userId:     req.userId,
      templateType,
      pageId:     new mongoose.Types.ObjectId(pageId),
      amount:     0,             // no money charged
      currency:   "INR",
      status:     "points_used",
      pointsUsed: pricing.pointsCost,
    });

    // Audit log for the point deduction
    await PointTransaction.create({
      user:    req.userId,
      type:    "template_publish",
      delta:   -pricing.pointsCost,
      balance: updatedUser.points,
      meta:    { templateType, pageId },
    });

    res.json({
      success: true,
      message: "Points spent successfully",
      data: { remainingPoints: updatedUser.points },
    });
  } catch (error) {
    console.error("Spend points error:", error);
    res.status(500).json({ success: false, error: "Failed to spend points" });
  }
};
