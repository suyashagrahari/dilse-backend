import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createFlagsPage,
  getMyFlagsPages,
  getFlagsPage,
  updateFlagsPage,
  publishFlagsPage,
  getSharedFlagsPage,
  verifyFlagsPagePassword,
  deleteFlagsPage,
} from "../controllers/flagsPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("flags");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedFlagsPage);
router.post("/share/:shareId/verify", verifyFlagsPagePassword);

router.use(protect);
router.post("/", live, createFlagsPage);
router.get("/my", getMyFlagsPages);
router.get("/:id", getFlagsPage);
router.put("/:id", live, updateFlagsPage);
router.post("/:id/publish", live, publishFlagsPage);
router.delete("/:id", deleteFlagsPage);

export default router;
