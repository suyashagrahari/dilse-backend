import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createStreakPage,
  getMyStreakPages,
  getStreakPage,
  updateStreakPage,
  checkInStreakPage,
  coverStreakDay,
  publishStreakPage,
  getSharedStreakPage,
  verifyStreakPagePassword,
  deleteStreakPage,
} from "../controllers/streakPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("streak");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedStreakPage);
router.post("/share/:shareId/verify", verifyStreakPagePassword);

router.use(protect);
router.post("/", live, createStreakPage);
router.get("/my", getMyStreakPages);
router.get("/:id", getStreakPage);
router.put("/:id", live, updateStreakPage);
// The daily write. Idempotent on (pageId, date, side) — see the controller.
router.post("/:id/check-in", checkInStreakPage);
// Spends one cover on the most recent day that got away.
router.post("/:id/cover", coverStreakDay);
router.post("/:id/publish", live, publishStreakPage);
router.delete("/:id", deleteStreakPage);

export default router;
