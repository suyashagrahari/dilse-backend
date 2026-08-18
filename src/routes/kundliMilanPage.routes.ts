import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createKundliMilanPage,
  getMyKundliMilanPages,
  getKundliMilanPage,
  updateKundliMilanPage,
  publishKundliMilanPage,
  getSharedKundliMilanPage,
  verifyKundliMilanPagePassword,
  deleteKundliMilanPage,
} from "../controllers/kundliMilanPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedKundliMilanPage);
router.post("/share/:shareId/verify", verifyKundliMilanPagePassword);

router.use(protect);
router.post("/", createKundliMilanPage);
router.get("/my", getMyKundliMilanPages);
router.get("/:id", getKundliMilanPage);
router.put("/:id", updateKundliMilanPage);
router.post("/:id/publish", publishKundliMilanPage);
router.delete("/:id", deleteKundliMilanPage);

export default router;
