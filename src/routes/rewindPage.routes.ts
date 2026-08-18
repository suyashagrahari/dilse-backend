import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createRewindPage,
  getMyRewindPages,
  getRewindPage,
  updateRewindPage,
  publishRewindPage,
  getSharedRewindPage,
  verifyRewindPagePassword,
  deleteRewindPage,
} from "../controllers/rewindPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedRewindPage);
router.post("/share/:shareId/verify", verifyRewindPagePassword);

router.use(protect);
router.post("/", createRewindPage);
router.get("/my", getMyRewindPages);
router.get("/:id", getRewindPage);
router.put("/:id", updateRewindPage);
router.post("/:id/publish", publishRewindPage);
router.delete("/:id", deleteRewindPage);

export default router;
