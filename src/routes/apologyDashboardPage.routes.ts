import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createApologyDashboardPage,
  getMyApologyDashboardPages,
  getApologyDashboardPage,
  updateApologyDashboardPage,
  publishApologyDashboardPage,
  getSharedApologyDashboardPage,
  verifyApologyDashboardPagePassword,
  signApologyAgreement,
  deleteApologyDashboardPage,
} from "../controllers/apologyDashboardPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("apology-dashboard");

router.get("/share/:shareId", getSharedApologyDashboardPage);
router.post("/share/:shareId/verify", verifyApologyDashboardPagePassword);
router.post("/share/:shareId/sign", signApologyAgreement);

router.use(protect);
router.post("/", live, createApologyDashboardPage);
router.get("/my", getMyApologyDashboardPages);
router.get("/:id", getApologyDashboardPage);
router.put("/:id", live, updateApologyDashboardPage);
router.post("/:id/publish", live, publishApologyDashboardPage);
router.delete("/:id", deleteApologyDashboardPage);

export default router;
