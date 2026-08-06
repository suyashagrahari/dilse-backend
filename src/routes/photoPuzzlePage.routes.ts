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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedPhotoPuzzlePage);
router.post("/share/:shareId/verify", verifyPhotoPuzzlePagePassword);

router.use(protect);
router.post("/", createPhotoPuzzlePage);
router.get("/my", getMyPhotoPuzzlePages);
router.get("/:id", getPhotoPuzzlePage);
router.put("/:id", updatePhotoPuzzlePage);
router.post("/:id/publish", publishPhotoPuzzlePage);
router.delete("/:id", deletePhotoPuzzlePage);

export default router;
