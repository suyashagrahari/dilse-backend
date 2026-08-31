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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("love-gf");

router.get("/share/:shareId", getSharedLoveGfPage);
router.post("/share/:shareId/verify", verifyLoveGfPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/note", saveNote);

router.use(protect);
router.post("/", live, createLoveGfPage);
router.get("/my", getMyLoveGfPages);
router.get("/:id", getLoveGfPage);
router.put("/:id", live, updateLoveGfPage);
router.post("/:id/publish", live, publishLoveGfPage);
router.delete("/:id", deleteLoveGfPage);

export default router;
