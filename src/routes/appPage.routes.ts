import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createAppPage,
  getMyAppPages,
  getAppPage,
  updateAppPage,
  publishAppPage,
  getSharedAppPage,
  verifyAppPagePassword,
  deleteAppPage,
} from "../controllers/appPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("app");

// Public. Declared BEFORE `protect` — the recipient has no account and the
// password gate is the only thing standing in front of a gated page.
router.get("/share/:shareId", getSharedAppPage);
router.post("/share/:shareId/verify", verifyAppPagePassword);

router.use(protect);
router.post("/", live, createAppPage);
router.get("/my", getMyAppPages);
router.get("/:id", getAppPage);
router.put("/:id", live, updateAppPage);
router.post("/:id/publish", live, publishAppPage);
router.delete("/:id", deleteAppPage);

export default router;
