import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createFlagsPage,
  getMyFlagsPages,
  getFlagsPage,
  updateFlagsPage,
  publishFlagsPage,
  getSharedFlagsPage,
  verifyFlagsPagePassword,
  deleteFlagsPage,
} from "../controllers/flagsPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedFlagsPage);
router.post("/share/:shareId/verify", verifyFlagsPagePassword);

router.use(protect);
router.post("/", createFlagsPage);
router.get("/my", getMyFlagsPages);
router.get("/:id", getFlagsPage);
router.put("/:id", updateFlagsPage);
router.post("/:id/publish", publishFlagsPage);
router.delete("/:id", deleteFlagsPage);

export default router;
