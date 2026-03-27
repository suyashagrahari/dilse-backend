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

const router = Router();

router.get("/share/:shareId", getSharedDarlingPage);
router.post("/share/:shareId/verify", verifyDarlingPagePassword);
router.post("/share/:shareId/game-response", saveGameResponse);
router.post("/share/:shareId/quiz-attempt", saveQuizAttempt);
router.post("/share/:shareId/note", saveNote);

router.use(protect);
router.post("/", createDarlingPage);
router.get("/my", getMyDarlingPages);
router.get("/:id", getDarlingPage);
router.put("/:id", updateDarlingPage);
router.post("/:id/publish", publishDarlingPage);
router.delete("/:id", deleteDarlingPage);

export default router;
