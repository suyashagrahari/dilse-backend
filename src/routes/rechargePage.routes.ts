import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createRechargePage,
  getMyRechargePages,
  getRechargePage,
  updateRechargePage,
  publishRechargePage,
  getSharedRechargePage,
  verifyRechargePagePassword,
  deleteRechargePage,
} from "../controllers/rechargePage.controller";

const router = Router();

router.get("/share/:shareId", getSharedRechargePage);
router.post("/share/:shareId/verify", verifyRechargePagePassword);

router.use(protect);
router.post("/", createRechargePage);
router.get("/my", getMyRechargePages);
router.get("/:id", getRechargePage);
router.put("/:id", updateRechargePage);
router.post("/:id/publish", publishRechargePage);
router.delete("/:id", deleteRechargePage);

export default router;
