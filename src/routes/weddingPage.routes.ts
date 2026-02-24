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

const router = Router();

// Public routes
router.get("/share/:shareId", getSharedWeddingPage);
router.post("/share/:shareId/verify", verifyWeddingPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromShadiCard);
router.post("/", createWeddingPage);
router.get("/my", getMyWeddingPages);
router.get("/:id", getWeddingPage);
router.put("/:id", updateWeddingPage);
router.post("/:id/publish", publishWeddingPage);
router.delete("/:id", deleteWeddingPage);

export default router;
