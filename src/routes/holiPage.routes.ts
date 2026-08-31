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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("holi");

// Public routes (shared viewing)
router.get("/share/:shareId", getSharedHoliPage);
router.post("/share/:shareId/verify", verifyHoliPagePassword);

// Protected routes
router.use(protect);
router.post("/", live, createHoliPage);
router.get("/my", getMyHoliPages);
router.get("/:id", getHoliPage);
router.put("/:id", live, updateHoliPage);
router.post("/:id/publish", live, publishHoliPage);
router.delete("/:id", deleteHoliPage);

export default router;
