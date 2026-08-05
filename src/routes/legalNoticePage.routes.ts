import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createLegalNoticePage,
  getMyLegalNoticePages,
  getLegalNoticePage,
  updateLegalNoticePage,
  publishLegalNoticePage,
  getSharedLegalNoticePage,
  verifyLegalNoticePagePassword,
  deleteLegalNoticePage,
} from "../controllers/legalNoticePage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedLegalNoticePage);
router.post("/share/:shareId/verify", verifyLegalNoticePagePassword);

router.use(protect);
router.post("/", createLegalNoticePage);
router.get("/my", getMyLegalNoticePages);
router.get("/:id", getLegalNoticePage);
router.put("/:id", updateLegalNoticePage);
router.post("/:id/publish", publishLegalNoticePage);
router.delete("/:id", deleteLegalNoticePage);

export default router;
