import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createRewindPage,
  getMyRewindPages,
  getRewindPage,
  updateRewindPage,
  publishRewindPage,
  getSharedRewindPage,
  verifyRewindPagePassword,
  deleteRewindPage,
} from "../controllers/rewindPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("rewind");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedRewindPage);
router.post("/share/:shareId/verify", verifyRewindPagePassword);

router.use(protect);
router.post("/", live, createRewindPage);
router.get("/my", getMyRewindPages);
router.get("/:id", getRewindPage);
router.put("/:id", live, updateRewindPage);
router.post("/:id/publish", live, publishRewindPage);
router.delete("/:id", deleteRewindPage);

export default router;
