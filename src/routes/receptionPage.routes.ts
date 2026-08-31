import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createReceptionPage,
  getMyReceptionPages,
  getReceptionPage,
  updateReceptionPage,
  publishReceptionPage,
  deleteReceptionPage,
  extractFromReceptionCard,
  getSharedReceptionPage,
  verifyReceptionPagePassword,
  addBlessing,
} from "../controllers/receptionPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("reception");

// Public routes
router.get("/share/:shareId", getSharedReceptionPage);
router.post("/share/:shareId/verify", verifyReceptionPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromReceptionCard);
router.post("/", live, createReceptionPage);
router.get("/my", getMyReceptionPages);
router.get("/:id", getReceptionPage);
router.put("/:id", live, updateReceptionPage);
router.post("/:id/publish", live, publishReceptionPage);
router.delete("/:id", deleteReceptionPage);

export default router;
