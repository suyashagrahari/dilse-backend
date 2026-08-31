import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createBirthdayGfPage,
  getMyBirthdayGfPages,
  getBirthdayGfPage,
  updateBirthdayGfPage,
  publishBirthdayGfPage,
  getSharedBirthdayGfPage,
  verifyBirthdayGfPagePassword,
  saveGameResponse,
  saveQuizAttempt,
  saveQuizAnswer,
  deleteBirthdayGfPage,
} from "../controllers/birthdayGfPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("birthday-gf");

router.get("/share/:shareId", getSharedBirthdayGfPage);
router.post("/share/:shareId/verify", verifyBirthdayGfPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/quiz-answer", saveQuizAnswer);

router.use(protect);
router.post("/", live, createBirthdayGfPage);
router.get("/my", getMyBirthdayGfPages);
router.get("/:id", getBirthdayGfPage);
router.put("/:id", live, updateBirthdayGfPage);
router.post("/:id/publish", live, publishBirthdayGfPage);
router.delete("/:id", deleteBirthdayGfPage);

export default router;
