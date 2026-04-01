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
  deleteBirthdayGfPage,
} from "../controllers/birthdayGfPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedBirthdayGfPage);
router.post("/share/:shareId/verify-password", verifyBirthdayGfPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);

router.use(protect);
router.post("/", createBirthdayGfPage);
router.get("/my", getMyBirthdayGfPages);
router.get("/:id", getBirthdayGfPage);
router.put("/:id", updateBirthdayGfPage);
router.post("/:id/publish", publishBirthdayGfPage);
router.delete("/:id", deleteBirthdayGfPage);

export default router;
