import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createProfileProPage,
  getMyProfileProPages,
  getProfileProPage,
  updateProfileProPage,
  publishProfileProPage,
  getSharedProfileProPage,
  verifyProfileProPagePassword,
  deleteProfileProPage,
} from "../controllers/profileProPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedProfileProPage);
router.post("/share/:shareId/verify", verifyProfileProPagePassword);

router.use(protect);
router.post("/", createProfileProPage);
router.get("/my", getMyProfileProPages);
router.get("/:id", getProfileProPage);
router.put("/:id", updateProfileProPage);
router.post("/:id/publish", publishProfileProPage);
router.delete("/:id", deleteProfileProPage);

export default router;
