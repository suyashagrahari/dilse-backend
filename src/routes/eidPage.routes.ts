import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createEidPage,
  getMyEidPages,
  getEidPage,
  updateEidPage,
  publishEidPage,
  getSharedEidPage,
  verifyEidPagePassword,
  deleteEidPage,
} from "../controllers/eidPage.controller";

const router = Router();

// Public routes (shared viewing)
router.get("/share/:shareId", getSharedEidPage);
router.post("/share/:shareId/verify", verifyEidPagePassword);

// Protected routes
router.use(protect);
router.post("/", createEidPage);
router.get("/my", getMyEidPages);
router.get("/:id", getEidPage);
router.put("/:id", updateEidPage);
router.post("/:id/publish", publishEidPage);
router.delete("/:id", deleteEidPage);

export default router;
