import { Router } from "express";
import {
  registerInfluencer,
  getMyInfluencerDashboard,
  updateMyInfluencerProfile,
  getPublicInfluencer,
  getProgramTerms,
  trackInfluencerClick,
} from "../controllers/influencer.controller";
import { protect, blockImpersonation } from "../middleware/auth";

/** Mounted at /api/influencer. Public landing reads sit above the protected routes. */
const router = Router();

router.get("/program", getProgramTerms);
router.get("/public/:code", getPublicInfluencer);
router.post("/click/:code", trackInfluencerClick);

router.post("/register", protect, blockImpersonation, registerInfluencer);
router.get("/dashboard", protect, getMyInfluencerDashboard);
router.put("/profile", protect, blockImpersonation, updateMyInfluencerProfile);

export default router;
