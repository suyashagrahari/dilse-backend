import { Router } from "express";
import { protect } from "../middleware/auth";
import {
  createCourtOfLovePage,
  getMyCourtOfLovePages,
  getCourtOfLovePage,
  updateCourtOfLovePage,
  publishCourtOfLovePage,
  getSharedCourtOfLovePage,
  verifyCourtOfLovePagePassword,
  generateCourtOfLoveContent,
  deleteCourtOfLovePage,
} from "../controllers/courtOfLovePage.controller";

const router = Router();

// Public — the recipient's two entry points. Must stay above `protect`.
router.get("/share/:shareId", getSharedCourtOfLovePage);
router.post("/share/:shareId/verify", verifyCourtOfLovePagePassword);

router.use(protect);
// AI writing costs money per call, so it sits behind login like /api/generate
// does, and behind its own rate limiter in app.ts. The editor defers the login
// prompt to the moment Generate is clicked and resumes automatically after.
router.post("/generate", generateCourtOfLoveContent);
router.post("/", createCourtOfLovePage);
router.get("/my", getMyCourtOfLovePages);
router.get("/:id", getCourtOfLovePage);
router.put("/:id", updateCourtOfLovePage);
router.post("/:id/publish", publishCourtOfLovePage);
router.delete("/:id", deleteCourtOfLovePage);

export default router;
