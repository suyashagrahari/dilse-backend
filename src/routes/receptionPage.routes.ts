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

const router = Router();

// Public routes
router.get("/share/:shareId", getSharedReceptionPage);
router.post("/share/:shareId/verify", verifyReceptionPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromReceptionCard);
router.post("/", createReceptionPage);
router.get("/my", getMyReceptionPages);
router.get("/:id", getReceptionPage);
router.put("/:id", updateReceptionPage);
router.post("/:id/publish", publishReceptionPage);
router.delete("/:id", deleteReceptionPage);

export default router;
