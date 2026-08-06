import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createUsPage,
  getMyUsPages,
  getUsPage,
  updateUsPage,
  publishUsPage,
  getSharedUsPage,
  verifyUsPagePassword,
  deleteUsPage,
} from "../controllers/usPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedUsPage);
router.post("/share/:shareId/verify", verifyUsPagePassword);

router.use(protect);
router.post("/", createUsPage);
router.get("/my", getMyUsPages);
router.get("/:id", getUsPage);
router.put("/:id", updateUsPage);
router.post("/:id/publish", publishUsPage);
router.delete("/:id", deleteUsPage);

export default router;
