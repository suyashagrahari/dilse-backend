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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("legal-notice");

// Public — the addressee's entry points. Must stay above `protect`.
// `respond` is public by design: the person served records accept / contest /
// comply without an account, and the state persists on the document so it
// survives a hard refresh on another device.
router.get("/share/:shareId", getSharedLegalNoticePage);
router.post("/share/:shareId/verify", verifyLegalNoticePagePassword);
router.post("/share/:shareId/respond", recordLegalNoticeResponse);

router.use(protect);
router.post("/", live, createLegalNoticePage);
router.get("/my", getMyLegalNoticePages);
router.get("/:id", getLegalNoticePage);
router.put("/:id", live, updateLegalNoticePage);
router.post("/:id/publish", live, publishLegalNoticePage);
router.delete("/:id", deleteLegalNoticePage);

export default router;
