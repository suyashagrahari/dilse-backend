import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createDedicationPage,
  getMyDedicationPages,
  getDedicationPage,
  updateDedicationPage,
  publishDedicationPage,
  getSharedDedicationPage,
  verifyDedicationPagePassword,
  deleteDedicationPage,
} from "../controllers/dedicationPage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedDedicationPage);
router.post("/share/:shareId/verify", verifyDedicationPagePassword);

router.use(protect);
router.post("/", createDedicationPage);
router.get("/my", getMyDedicationPages);
router.get("/:id", getDedicationPage);
router.put("/:id", updateDedicationPage);
router.post("/:id/publish", publishDedicationPage);
router.delete("/:id", deleteDedicationPage);

export default router;
