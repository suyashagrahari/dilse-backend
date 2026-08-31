import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  getPricingConfig,
  getPublishAccess,
  createOrder,
  verifyPayment,
  spendPoints,
} from "../controllers/payment.controller";

const router = Router();

// Public: client can read pricing to display badges without auth
router.get("/pricing", getPricingConfig);

// Protected: all payment operations require authentication
router.use(protect);
// Asked before publishing, so the paywall can appear with nothing spinning.
router.get("/access", getPublishAccess);
router.post("/create-order", createOrder);
router.post("/verify",       verifyPayment);
router.post("/spend-points", spendPoints);

export default router;
