import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCatchPage,
  getMyCatchPages,
  getCatchPage,
  updateCatchPage,
  publishCatchPage,
  getSharedCatchPage,
  verifyCatchPagePassword,
  deleteCatchPage,
} from "../controllers/catchGamePage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("catch");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCatchPage);
router.post("/share/:shareId/verify", verifyCatchPagePassword);

router.use(protect);
router.post("/", live, createCatchPage);
router.get("/my", getMyCatchPages);
router.get("/:id", getCatchPage);
router.put("/:id", live, updateCatchPage);
router.post("/:id/publish", live, publishCatchPage);
router.delete("/:id", deleteCatchPage);

export default router;
