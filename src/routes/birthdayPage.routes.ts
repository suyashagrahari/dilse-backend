import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createBirthdayPage,
  getMyBirthdayPages,
  getBirthdayPage,
  updateBirthdayPage,
  publishBirthdayPage,
  getSharedBirthdayPage,
  verifyBirthdayPagePassword,
  deleteBirthdayPage,
} from "../controllers/birthdayPage.controller";

const router = Router();

router.get("/share/:shareId", getSharedBirthdayPage);
router.post("/share/:shareId/verify", verifyBirthdayPagePassword);

router.use(protect);
router.post("/", createBirthdayPage);
router.get("/my", getMyBirthdayPages);
router.get("/:id", getBirthdayPage);
router.put("/:id", updateBirthdayPage);
router.post("/:id/publish", publishBirthdayPage);
router.delete("/:id", deleteBirthdayPage);

export default router;
