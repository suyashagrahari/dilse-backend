import { Router } from "express";
import { optionalAuth, protect } from "../middleware/auth";
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
  discardMyDraft,
} from "../controllers/share.controller";

const router = Router();

router.get("/stats/installs", getInstallStats);

router.get("/me/received", protect, getReceivedPages);
router.get("/me/creations", protect, getMyCreations);
// Before the `/:shareId` routes below, which would otherwise swallow "me".
router.delete("/me/drafts/:templateType/:pageId", protect, discardMyDraft);

router.get("/u/:username", getPublicProfile);
// optionalAuth: a premium Valentine-engine page that is still sealed is shown in
// full only to its signed-in owner (see projectValentineShared).
router.get("/u/:username/:shareId", optionalAuth, getSharedPageByUsername);
router.get("/:shareId", optionalAuth, getSharedPage);
router.post("/:shareId/install", trackInstall);
router.post("/:shareId/access", protect, recordAccess);
router.post("/:shareId/pw-verified", protect, markPasswordVerified);

export default router;
