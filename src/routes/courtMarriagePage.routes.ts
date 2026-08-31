import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCourtMarriagePage,
  getMyCourtMarriagePages,
  getCourtMarriagePage,
  updateCourtMarriagePage,
  publishCourtMarriagePage,
  getSharedCourtMarriagePage,
  verifyCourtMarriagePagePassword,
  deleteCourtMarriagePage,
} from "../controllers/courtMarriagePage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("court-marriage");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCourtMarriagePage);
router.post("/share/:shareId/verify", verifyCourtMarriagePagePassword);

router.use(protect);
router.post("/", live, createCourtMarriagePage);
router.get("/my", getMyCourtMarriagePages);
router.get("/:id", getCourtMarriagePage);
router.put("/:id", live, updateCourtMarriagePage);
router.post("/:id/publish", live, publishCourtMarriagePage);
router.delete("/:id", deleteCourtMarriagePage);

export default router;
