import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createLoveGfPage,
  getMyLoveGfPages,
  getLoveGfPage,
  updateLoveGfPage,
  publishLoveGfPage,
  getSharedLoveGfPage,
  verifyLoveGfPagePassword,
  saveGameResponse,
  saveQuizAttempt,
  saveNote,
  deleteLoveGfPage,
} from "../controllers/loveGfPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedLoveGfPage);
router.post("/share/:shareId/verify", verifyLoveGfPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/note", saveNote);

router.use(protect);
router.post("/", createLoveGfPage);
router.get("/my", getMyLoveGfPages);
router.get("/:id", getLoveGfPage);
router.put("/:id", updateLoveGfPage);
router.post("/:id/publish", publishLoveGfPage);
router.delete("/:id", deleteLoveGfPage);

export default router;
