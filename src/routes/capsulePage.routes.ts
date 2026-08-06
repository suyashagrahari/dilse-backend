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

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
// `getSharedCapsulePage` sends counts and authorship only until server time
// passes `opensOn`. The seal does not depend on this route being authenticated.
router.get("/share/:shareId", getSharedCapsulePage);
router.post("/share/:shareId/verify", verifyCapsulePagePassword);

router.use(protect);
router.post("/", createCapsulePage);
router.get("/my", getMyCapsulePages);
router.get("/:id", getCapsulePage);
// Rejects edits to `predictions` with a 403 once the amend window has closed.
router.put("/:id", updateCapsulePage);
router.post("/:id/publish", publishCapsulePage);
router.delete("/:id", deleteCapsulePage);

export default router;
