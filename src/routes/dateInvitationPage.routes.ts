import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createDateInvitationPage,
  getMyDateInvitationPages,
  getDateInvitationPage,
  updateDateInvitationPage,
  publishDateInvitationPage,
  getSharedDateInvitationPage,
  verifyDateInvitationPagePassword,
  deleteDateInvitationPage,
} from "../controllers/dateInvitationPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("date-invitation");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedDateInvitationPage);
router.post("/share/:shareId/verify", verifyDateInvitationPagePassword);

router.use(protect);
router.post("/", live, createDateInvitationPage);
router.get("/my", getMyDateInvitationPages);
router.get("/:id", getDateInvitationPage);
router.put("/:id", live, updateDateInvitationPage);
router.post("/:id/publish", live, publishDateInvitationPage);
router.delete("/:id", deleteDateInvitationPage);

export default router;
