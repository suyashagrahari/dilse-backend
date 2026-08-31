import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createShaadiCardPage,
  getMyShaadiCardPages,
  getShaadiCardPage,
  updateShaadiCardPage,
  publishShaadiCardPage,
  deleteShaadiCardPage,
  extractFromShadiCard,
  getSharedShaadiCardPage,
  verifyShaadiCardPagePassword,
  addBlessing,
} from "../controllers/shaadiCardPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("shaadi-card");

// Public routes
router.get("/share/:shareId", getSharedShaadiCardPage);
router.post("/share/:shareId/verify", verifyShaadiCardPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromShadiCard);
router.post("/", live, createShaadiCardPage);
router.get("/my", getMyShaadiCardPages);
router.get("/:id", getShaadiCardPage);
router.put("/:id", live, updateShaadiCardPage);
router.post("/:id/publish", live, publishShaadiCardPage);
router.delete("/:id", deleteShaadiCardPage);

export default router;
