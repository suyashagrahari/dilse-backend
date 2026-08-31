import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createUsPage,
  getMyUsPages,
  getUsPage,
  updateUsPage,
  publishUsPage,
  getSharedUsPage,
  verifyUsPagePassword,
  deleteUsPage,
} from "../controllers/usPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("us");

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedUsPage);
router.post("/share/:shareId/verify", verifyUsPagePassword);

router.use(protect);
router.post("/", live, createUsPage);
router.get("/my", getMyUsPages);
router.get("/:id", getUsPage);
router.put("/:id", live, updateUsPage);
router.post("/:id/publish", live, publishUsPage);
router.delete("/:id", deleteUsPage);

export default router;
