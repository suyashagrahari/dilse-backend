import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createDarlingPage,
  getMyDarlingPages,
  getDarlingPage,
  updateDarlingPage,
  publishDarlingPage,
  getSharedDarlingPage,
  verifyDarlingPagePassword,
  saveGameResponse,
  saveQuizAttempt,
  saveNote,
  deleteDarlingPage,
} from "../controllers/darlingPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("darling");

router.get("/share/:shareId", getSharedDarlingPage);
router.post("/share/:shareId/verify", verifyDarlingPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/note", saveNote);

router.use(protect);
router.post("/", live, createDarlingPage);
router.get("/my", getMyDarlingPages);
router.get("/:id", getDarlingPage);
router.put("/:id", live, updateDarlingPage);
router.post("/:id/publish", live, publishDarlingPage);
router.delete("/:id", deleteDarlingPage);

export default router;
