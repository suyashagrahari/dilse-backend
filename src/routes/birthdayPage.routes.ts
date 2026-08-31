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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("birthday-gf");

router.get("/share/:shareId", getSharedBirthdayPage);
router.post("/share/:shareId/verify", verifyBirthdayPagePassword);

router.use(protect);
router.post("/", live, createBirthdayPage);
router.get("/my", getMyBirthdayPages);
router.get("/:id", getBirthdayPage);
router.put("/:id", live, updateBirthdayPage);
router.post("/:id/publish", live, publishBirthdayPage);
router.delete("/:id", deleteBirthdayPage);

export default router;
