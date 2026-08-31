import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createHoldMyHandPage,
  getMyHoldMyHandPages,
  getHoldMyHandPage,
  updateHoldMyHandPage,
  publishHoldMyHandPage,
  getSharedHoldMyHandPage,
  verifyHoldMyHandPagePassword,
  deleteHoldMyHandPage,
} from "../controllers/holdMyHandPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("hold-my-hand");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedHoldMyHandPage);
router.post("/share/:shareId/verify", verifyHoldMyHandPagePassword);

router.use(protect);
router.post("/", live, createHoldMyHandPage);
router.get("/my", getMyHoldMyHandPages);
router.get("/:id", getHoldMyHandPage);
router.put("/:id", live, updateHoldMyHandPage);
router.post("/:id/publish", live, publishHoldMyHandPage);
router.delete("/:id", deleteHoldMyHandPage);

export default router;
