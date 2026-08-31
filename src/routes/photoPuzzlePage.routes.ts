import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createPhotoPuzzlePage,
  getMyPhotoPuzzlePages,
  getPhotoPuzzlePage,
  updatePhotoPuzzlePage,
  publishPhotoPuzzlePage,
  getSharedPhotoPuzzlePage,
  verifyPhotoPuzzlePagePassword,
  deletePhotoPuzzlePage,
} from "../controllers/photoPuzzlePage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("photo-puzzle");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedPhotoPuzzlePage);
router.post("/share/:shareId/verify", verifyPhotoPuzzlePagePassword);

router.use(protect);
router.post("/", live, createPhotoPuzzlePage);
router.get("/my", getMyPhotoPuzzlePages);
router.get("/:id", getPhotoPuzzlePage);
router.put("/:id", live, updatePhotoPuzzlePage);
router.post("/:id/publish", live, publishPhotoPuzzlePage);
router.delete("/:id", deletePhotoPuzzlePage);

export default router;
