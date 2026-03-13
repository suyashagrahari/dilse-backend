import { Router } from "express";
import { getReferralInfo, getPointsHistory } from "../controllers/referral.controller";
import { protect } from "../middleware/auth";

const router = Router();

router.get("/info", protect, getReferralInfo);
router.get("/transactions", protect, getPointsHistory);

export default router;
