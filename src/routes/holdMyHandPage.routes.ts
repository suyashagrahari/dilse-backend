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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedHoldMyHandPage);
router.post("/share/:shareId/verify", verifyHoldMyHandPagePassword);

router.use(protect);
router.post("/", createHoldMyHandPage);
router.get("/my", getMyHoldMyHandPages);
router.get("/:id", getHoldMyHandPage);
router.put("/:id", updateHoldMyHandPage);
router.post("/:id/publish", publishHoldMyHandPage);
router.delete("/:id", deleteHoldMyHandPage);

export default router;
