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

const router = Router();

// Public. Declared BEFORE `protect` — the recipient has no account and the
// password gate is the only thing standing in front of a gated page.
router.get("/share/:shareId", getSharedAppPage);
router.post("/share/:shareId/verify", verifyAppPagePassword);

router.use(protect);
router.post("/", createAppPage);
router.get("/my", getMyAppPages);
router.get("/:id", getAppPage);
router.put("/:id", updateAppPage);
router.post("/:id/publish", publishAppPage);
router.delete("/:id", deleteAppPage);

export default router;
