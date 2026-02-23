import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createHoliPage,
  getMyHoliPages,
  getHoliPage,
  updateHoliPage,
  publishHoliPage,
  getSharedHoliPage,
  verifyHoliPagePassword,
  deleteHoliPage,
} from "../controllers/holiPage.controller";

const router = Router();

// Public routes (shared viewing)
router.get("/share/:shareId", getSharedHoliPage);
router.post("/share/:shareId/verify", verifyHoliPagePassword);

// Protected routes
router.use(protect);
router.post("/", createHoliPage);
router.get("/my", getMyHoliPages);
router.get("/:id", getHoliPage);
router.put("/:id", updateHoliPage);
router.post("/:id/publish", publishHoliPage);
router.delete("/:id", deleteHoliPage);

export default router;
