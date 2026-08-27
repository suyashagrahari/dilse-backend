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

const router = Router();

router.get("/share/:shareId", getSharedBirthdayGfPage);
router.post("/share/:shareId/verify", verifyBirthdayGfPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/quiz-answer", saveQuizAnswer);

router.use(protect);
router.post("/", createBirthdayGfPage);
router.get("/my", getMyBirthdayGfPages);
router.get("/:id", getBirthdayGfPage);
router.put("/:id", updateBirthdayGfPage);
router.post("/:id/publish", publishBirthdayGfPage);
router.delete("/:id", deleteBirthdayGfPage);

export default router;
