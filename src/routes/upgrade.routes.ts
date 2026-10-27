import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth } from "../middleware/auth";
import { convertToPremium, getUpgradeOffer, recordUpgradeEvent } from "../controllers/upgrade.controller";

// Free → premium upgrade offer (controllers/upgrade.controller.ts). Signed-out
// visitors may use all three: the offer can come before the account does.
const router = Router();

// Each convert is a model call: a visitor trying it a few times is normal, a
// loop is not.
const convertLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many tries in an hour. Please wait a little." },
});
const eventLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.get("/:from/offer", optionalAuth, getUpgradeOffer);
router.post("/:from/convert", optionalAuth, convertLimiter, convertToPremium);
router.post("/:from/events", optionalAuth, eventLimiter, recordUpgradeEvent);

export default router;
