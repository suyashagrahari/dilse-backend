import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createMissYouGfPage,
  getMyMissYouGfPages,
  getMissYouGfPage,
  updateMissYouGfPage,
  publishMissYouGfPage,
  getSharedMissYouGfPage,
  verifyMissYouGfPagePassword,
  deleteMissYouGfPage,
} from "../controllers/missyouGfPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedMissYouGfPage);
router.post("/share/:shareId/verify", verifyMissYouGfPagePassword);

router.use(protect);
router.post("/", createMissYouGfPage);
router.get("/my", getMyMissYouGfPages);
router.get("/:id", getMissYouGfPage);
router.put("/:id", updateMissYouGfPage);
router.post("/:id/publish", publishMissYouGfPage);
router.delete("/:id", deleteMissYouGfPage);

export default router;
