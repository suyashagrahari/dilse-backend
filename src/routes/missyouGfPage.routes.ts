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
  hugMissYouGfPage,
  saveLoveMapMissYouGfPage,
  deleteMissYouGfPage,
} from "../controllers/missyouGfPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("missyou-gf");

router.get("/share/:shareId", getSharedMissYouGfPage);
router.post("/share/:shareId/verify", verifyMissYouGfPagePassword);
router.post("/share/:shareId/hug", hugMissYouGfPage);
router.put("/share/:shareId/lovemap", saveLoveMapMissYouGfPage);

router.use(protect);
router.post("/", live, createMissYouGfPage);
router.get("/my", getMyMissYouGfPages);
router.get("/:id", getMissYouGfPage);
router.put("/:id", live, updateMissYouGfPage);
router.post("/:id/publish", live, publishMissYouGfPage);
router.delete("/:id", deleteMissYouGfPage);

export default router;
