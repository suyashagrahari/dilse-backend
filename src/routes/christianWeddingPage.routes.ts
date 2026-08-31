import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createChristianWeddingPage,
  getMyChristianWeddingPages,
  getChristianWeddingPage,
  updateChristianWeddingPage,
  publishChristianWeddingPage,
  deleteChristianWeddingPage,
  extractFromWeddingInvitationCard,
  getSharedChristianWeddingPage,
  verifyChristianWeddingPagePassword,
  addChristianWeddingBlessing,
} from "../controllers/christianWeddingPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("christian-wedding");

// Public
router.get("/share/:shareId", getSharedChristianWeddingPage);
router.post("/share/:shareId/verify", verifyChristianWeddingPagePassword);
router.post("/share/:shareId/blessings", addChristianWeddingBlessing);

// Authenticated
router.use(protect);
router.post("/extract-card", extractFromWeddingInvitationCard);
router.post("/", live, createChristianWeddingPage);
router.get("/my", getMyChristianWeddingPages);
router.get("/:id", getChristianWeddingPage);
router.put("/:id", live, updateChristianWeddingPage);
router.post("/:id/publish", live, publishChristianWeddingPage);
router.delete("/:id", deleteChristianWeddingPage);

export default router;
