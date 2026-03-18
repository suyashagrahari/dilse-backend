import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  getPricingConfig,
  createOrder,
  verifyPayment,
  spendPoints,
} from "../controllers/payment.controller";

const router = Router();

// Public: client can read pricing to display badges without auth
router.get("/pricing", getPricingConfig);

// Protected: all payment operations require authentication
router.use(protect);
router.post("/create-order", createOrder);
router.post("/verify",       verifyPayment);
router.post("/spend-points", spendPoints);

export default router;
