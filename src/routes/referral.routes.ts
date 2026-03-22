import { Router } from "express";
import { getReferralInfo, getPointsHistory, getReferrerByCode } from "../controllers/referral.controller";
import { protect } from "../middleware/auth";

const router = Router();

router.get("/by-code/:code", getReferrerByCode); // public — no auth needed
router.get("/info", protect, getReferralInfo);
router.get("/transactions", protect, getPointsHistory);

export default router;
