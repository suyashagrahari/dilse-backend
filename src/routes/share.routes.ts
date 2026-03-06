import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  getSharedPage,
  getSharedPageByUsername,
  getPublicProfile,
  trackInstall,
  getInstallStats,
  recordAccess,
  markPasswordVerified,
  getReceivedPages,
  getMyCreations,
} from "../controllers/share.controller";

const router = Router();

router.get("/stats/installs", getInstallStats);

router.get("/me/received", protect, getReceivedPages);
router.get("/me/creations", protect, getMyCreations);

router.get("/u/:username", getPublicProfile);
router.get("/u/:username/:shareId", getSharedPageByUsername);
router.get("/:shareId", getSharedPage);
router.post("/:shareId/install", trackInstall);
router.post("/:shareId/access", protect, recordAccess);
router.post("/:shareId/pw-verified", protect, markPasswordVerified);

export default router;
