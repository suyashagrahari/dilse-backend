import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  getSharedPage,
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

router.get("/:shareId", getSharedPage);
router.post("/:shareId/install", trackInstall);
router.post("/:shareId/access", protect, recordAccess);
router.post("/:shareId/pw-verified", protect, markPasswordVerified);

export default router;
