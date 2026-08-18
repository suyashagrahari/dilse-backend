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
  recordLegalNoticeResponse,
  deleteLegalNoticePage,
} from "../controllers/legalNoticePage.controller";

const router = Router();

// Public — the addressee's entry points. Must stay above `protect`.
// `respond` is public by design: the person served records accept / contest /
// comply without an account, and the state persists on the document so it
// survives a hard refresh on another device.
router.get("/share/:shareId", getSharedLegalNoticePage);
router.post("/share/:shareId/verify", verifyLegalNoticePagePassword);
router.post("/share/:shareId/respond", recordLegalNoticeResponse);

router.use(protect);
router.post("/", createLegalNoticePage);
router.get("/my", getMyLegalNoticePages);
router.get("/:id", getLegalNoticePage);
router.put("/:id", updateLegalNoticePage);
router.post("/:id/publish", publishLegalNoticePage);
router.delete("/:id", deleteLegalNoticePage);

export default router;
