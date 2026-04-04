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

const router = Router();

// Public routes
router.get("/share/:shareId", getSharedShaadiCardPage);
router.post("/share/:shareId/verify", verifyShaadiCardPagePassword);
router.post("/share/:shareId/blessings", addBlessing);

// Protected routes
router.use(protect);
router.post("/extract-card", extractFromShadiCard);
router.post("/", createShaadiCardPage);
router.get("/my", getMyShaadiCardPages);
router.get("/:id", getShaadiCardPage);
router.put("/:id", updateShaadiCardPage);
router.post("/:id/publish", publishShaadiCardPage);
router.delete("/:id", deleteShaadiCardPage);

export default router;
