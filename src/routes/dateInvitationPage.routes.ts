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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedDateInvitationPage);
router.post("/share/:shareId/verify", verifyDateInvitationPagePassword);

router.use(protect);
router.post("/", createDateInvitationPage);
router.get("/my", getMyDateInvitationPages);
router.get("/:id", getDateInvitationPage);
router.put("/:id", updateDateInvitationPage);
router.post("/:id/publish", publishDateInvitationPage);
router.delete("/:id", deleteDateInvitationPage);

export default router;
