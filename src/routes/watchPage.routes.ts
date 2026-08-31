import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createWatchPage,
  getMyWatchPages,
  getWatchPage,
  updateWatchPage,
  publishWatchPage,
  getSharedWatchPage,
  verifyWatchPagePassword,
  deleteWatchPage,
} from "../controllers/watchPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("watch");

router.get("/share/:shareId", getSharedWatchPage);
router.post("/share/:shareId/verify", verifyWatchPagePassword);

router.use(protect);
router.post("/", live, createWatchPage);
router.get("/my", getMyWatchPages);
router.get("/:id", getWatchPage);
router.put("/:id", live, updateWatchPage);
router.post("/:id/publish", live, publishWatchPage);
router.delete("/:id", deleteWatchPage);

export default router;
