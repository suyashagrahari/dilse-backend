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
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("recharge");

router.get("/share/:shareId", getSharedRechargePage);
router.post("/share/:shareId/verify", verifyRechargePagePassword);

router.use(protect);
router.post("/", live, createRechargePage);
router.get("/my", getMyRechargePages);
router.get("/:id", getRechargePage);
router.put("/:id", live, updateRechargePage);
router.post("/:id/publish", live, publishRechargePage);
router.delete("/:id", deleteRechargePage);

export default router;
