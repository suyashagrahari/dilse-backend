import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createWeddingPage,
  getMyWeddingPages,
  getWeddingPage,
  updateWeddingPage,
  publishWeddingPage,
  deleteWeddingPage,
  extractFromShadiCard,
  getSharedWeddingPage,
  verifyWeddingPagePassword,
  addBlessing,
} from "../controllers/weddingPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("wedding-shaadi");

// Public routes
router.get("/share/:shareId", getSharedWeddingPage);
router.post("/share/:shareId/verify", verifyWeddingPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromShadiCard);
router.post("/", live, createWeddingPage);
router.get("/my", getMyWeddingPages);
router.get("/:id", getWeddingPage);
router.put("/:id", live, updateWeddingPage);
router.post("/:id/publish", live, publishWeddingPage);
router.delete("/:id", deleteWeddingPage);

export default router;
