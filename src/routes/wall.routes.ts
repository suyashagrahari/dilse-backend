import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth";
import {
  getWall,
  setWallConsent,
  revokeWallConsent,
  getMyWallEntry,
  reportWallEntry,
} from "../controllers/wall.controller";

const router = Router();

/**
 * Reporting hides an entry on the first call, so it is the one public write
 * here that is worth abusing: without a limit, a script could clear the whole
 * Wall. Ten an hour per IP is far more than any honest reader needs.
 */
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many reports. Try again later." },
});

// Public — the Wall itself, and the report link on a card.
router.get("/", getWall);
router.post("/:id/report", reportLimiter, reportWallEntry);

// Everything below belongs to the creator of a page.
router.use(protect);
router.get("/mine/:templateType/:pageId", getMyWallEntry);
router.post("/consent", setWallConsent);
router.delete("/consent/:templateType/:pageId", revokeWallConsent);

export default router;
