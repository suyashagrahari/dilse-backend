import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createProfileProPage,
  getMyProfileProPages,
  getProfileProPage,
  updateProfileProPage,
  publishProfileProPage,
  getSharedProfileProPage,
  verifyProfileProPagePassword,
  deleteProfileProPage,
} from "../controllers/profileProPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("profile-pro");

router.get("/share/:shareId", getSharedProfileProPage);
router.post("/share/:shareId/verify", verifyProfileProPagePassword);

router.use(protect);
router.post("/", live, createProfileProPage);
router.get("/my", getMyProfileProPages);
router.get("/:id", getProfileProPage);
router.put("/:id", live, updateProfileProPage);
router.post("/:id/publish", live, publishProfileProPage);
router.delete("/:id", deleteProfileProPage);

export default router;
