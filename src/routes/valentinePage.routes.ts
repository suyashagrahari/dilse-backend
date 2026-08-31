import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createValentinePage,
  getMyValentinePages,
  getValentinePage,
  updateValentinePage,
  publishValentinePage,
  getSharedValentinePage,
  deleteValentinePage,
} from "../controllers/valentinePage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("valentine-gf");

router.get("/share/:shareId", getSharedValentinePage);

router.use(protect);
router.post("/", live, createValentinePage);
router.get("/my", getMyValentinePages);
router.get("/:id", getValentinePage);
router.put("/:id", live, updateValentinePage);
router.post("/:id/publish", live, publishValentinePage);
router.delete("/:id", deleteValentinePage);

export default router;
