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

const router = Router();

// Public
router.get("/share/:shareId", getSharedChristianWeddingPage);
router.post("/share/:shareId/verify", verifyChristianWeddingPagePassword);
router.post("/share/:shareId/blessings", addChristianWeddingBlessing);

// Authenticated
router.use(protect);
router.post("/extract-card", extractFromWeddingInvitationCard);
router.post("/", createChristianWeddingPage);
router.get("/my", getMyChristianWeddingPages);
router.get("/:id", getChristianWeddingPage);
router.put("/:id", updateChristianWeddingPage);
router.post("/:id/publish", publishChristianWeddingPage);
router.delete("/:id", deleteChristianWeddingPage);

export default router;
