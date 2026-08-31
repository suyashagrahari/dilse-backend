import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCapsulePage,
  getMyCapsulePages,
  getCapsulePage,
  updateCapsulePage,
  publishCapsulePage,
  getSharedCapsulePage,
  verifyCapsulePagePassword,
  deleteCapsulePage,
} from "../controllers/capsulePage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";

const router = Router();

/**
 * Create, update and publish only. Reads and the recipient's own routes stay
 * open so a page already sent keeps working — see middleware/templateGate.
 */
const live = requireTemplateAccess("capsule");

// Public — the recipient's two entry points. Must stay above `protect`.
// `getSharedCapsulePage` sends counts and authorship only until server time
// passes `opensOn`. The seal does not depend on this route being authenticated.
router.get("/share/:shareId", getSharedCapsulePage);
router.post("/share/:shareId/verify", verifyCapsulePagePassword);

router.use(protect);
router.post("/", live, createCapsulePage);
router.get("/my", getMyCapsulePages);
router.get("/:id", getCapsulePage);
// Rejects edits to `predictions` with a 403 once the amend window has closed.
router.put("/:id", live, updateCapsulePage);
router.post("/:id/publish", live, publishCapsulePage);
router.delete("/:id", deleteCapsulePage);

export default router;
