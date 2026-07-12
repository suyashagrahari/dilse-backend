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

const router = Router();

router.get("/share/:shareId", getSharedApologyDashboardPage);
router.post("/share/:shareId/verify", verifyApologyDashboardPagePassword);
router.post("/share/:shareId/sign", signApologyAgreement);

router.use(protect);
router.post("/", createApologyDashboardPage);
router.get("/my", getMyApologyDashboardPages);
router.get("/:id", getApologyDashboardPage);
router.put("/:id", updateApologyDashboardPage);
router.post("/:id/publish", publishApologyDashboardPage);
router.delete("/:id", deleteApologyDashboardPage);

export default router;
