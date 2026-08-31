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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("eid-mubarak");

// Public routes (shared viewing)
router.get("/share/:shareId", getSharedEidPage);
router.post("/share/:shareId/verify", verifyEidPagePassword);

// Protected routes
router.use(protect);
router.post("/", live, createEidPage);
router.get("/my", getMyEidPages);
router.get("/:id", getEidPage);
router.put("/:id", live, updateEidPage);
router.post("/:id/publish", live, publishEidPage);
router.delete("/:id", deleteEidPage);

export default router;
