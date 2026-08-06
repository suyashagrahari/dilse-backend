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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedStreakPage);
router.post("/share/:shareId/verify", verifyStreakPagePassword);

router.use(protect);
router.post("/", createStreakPage);
router.get("/my", getMyStreakPages);
router.get("/:id", getStreakPage);
router.put("/:id", updateStreakPage);
// The daily write. Idempotent on (pageId, date, side) — see the controller.
router.post("/:id/check-in", checkInStreakPage);
// Spends one cover on the most recent day that got away.
router.post("/:id/cover", coverStreakDay);
router.post("/:id/publish", publishStreakPage);
router.delete("/:id", deleteStreakPage);

export default router;
