import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createKundliMilanPage,
  getMyKundliMilanPages,
  getKundliMilanPage,
  updateKundliMilanPage,
  publishKundliMilanPage,
  getSharedKundliMilanPage,
  verifyKundliMilanPagePassword,
  deleteKundliMilanPage,
} from "../controllers/kundliMilanPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("kundli-milan");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedKundliMilanPage);
router.post("/share/:shareId/verify", verifyKundliMilanPagePassword);

router.use(protect);
router.post("/", live, createKundliMilanPage);
router.get("/my", getMyKundliMilanPages);
router.get("/:id", getKundliMilanPage);
router.put("/:id", live, updateKundliMilanPage);
router.post("/:id/publish", live, publishKundliMilanPage);
router.delete("/:id", deleteKundliMilanPage);

export default router;
