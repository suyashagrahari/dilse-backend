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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("dedication");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedDedicationPage);
router.post("/share/:shareId/verify", verifyDedicationPagePassword);

router.use(protect);
router.post("/", live, createDedicationPage);
router.get("/my", getMyDedicationPages);
router.get("/:id", getDedicationPage);
router.put("/:id", live, updateDedicationPage);
router.post("/:id/publish", live, publishDedicationPage);
router.delete("/:id", deleteDedicationPage);

export default router;
