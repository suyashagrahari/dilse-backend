import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth, protect } from "../middleware/auth";
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
import {
  addMemory,
  answerInvitation,
  checkIn,
  getLiveState,
  removeMemory,
} from "../controllers/dateInvitationLive.controller";
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

// The shared evening: both of them poll `live`; she answers, he checks in,
// either adds photos afterwards. Owner-ness comes from an optional token.
const liveReads = rateLimit({ windowMs: 60_000, max: 90, standardHeaders: true, legacyHeaders: false });
const liveWrites = rateLimit({ windowMs: 60 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
router.get("/share/:shareId/live", liveReads, optionalAuth, getLiveState);
router.post("/share/:shareId/rsvp", liveWrites, optionalAuth, answerInvitation);
router.post("/share/:shareId/arrive", liveWrites, optionalAuth, checkIn);
router.post("/share/:shareId/memories", liveWrites, optionalAuth, addMemory);
router.delete("/share/:shareId/memories/:memoryId", liveWrites, optionalAuth, removeMemory);

router.use(protect);
router.post("/", live, createDateInvitationPage);
router.get("/my", getMyDateInvitationPages);
router.get("/:id", getDateInvitationPage);
router.put("/:id", live, updateDateInvitationPage);
router.post("/:id/publish", live, publishDateInvitationPage);
router.delete("/:id", deleteDateInvitationPage);

export default router;
