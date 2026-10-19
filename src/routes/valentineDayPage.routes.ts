import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth, protect } from "../middleware/auth";
import { makeValentineDayController } from "../controllers/valentineDayPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";
import type { ValentineDaySlug } from "../config/valentineDays";
import { isWeddingSlug } from "../config/weddingShared";
import { VALENTINE_DAY_MODELS } from "../models/ValentineDayPage";
import { mountWeddingGuestOwner, mountWeddingGuestPublic } from "./weddingGuest.routes";

/**
 * One router per Valentine's-week day, mounted at `/<slug>-pages` (the
 * `templateApiBase` convention). Same layout as every template route file:
 * the recipient's public routes first, then `protect`, then owner CRUD with
 * the release gate on create, update and publish.
 */
export function makeValentineDayRouter(slug: ValentineDaySlug): Router {
  const router = Router();
  const c = makeValentineDayController(slug);

  /** Create, update and publish only — see middleware/templateGate. */
  const live = requireTemplateAccess(slug);

  // The beacon is cheap and first-wins, so a generous per-IP ceiling is plenty:
  // it only has to stop a script hammering one row.
  const reactLimit = rateLimit({ windowMs: 60 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

  // Public — the recipient's entry points. Must stay above `protect`.
  // optionalAuth on the read: a signed-in owner sees a premium page before its unlock time.
  router.get("/share/:shareId", optionalAuth, c.getShared);
  router.post("/share/:shareId/verify", c.verify);
  router.post("/share/:shareId/react", reactLimit, optionalAuth, c.react);
  if (c.reply) {
    // Premium only: one reply per page (first write wins), so 10 an hour per IP is plenty.
    const replyLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
    router.post("/share/:shareId/reply", replyLimit, optionalAuth, c.reply);
  } else {
    // A $2 day takes no replies: a plain 404 here, rather than falling through to `protect` (401).
    router.post("/share/:shareId/reply", (_req, res) => {
      res.status(404).json({ success: false, error: "Not found" });
    });
  }

  // Wedding tiers: many guests' RSVPs + a blessings wall (config/weddingShared).
  const wedding = isWeddingSlug(slug);
  if (wedding) mountWeddingGuestPublic(router, slug, VALENTINE_DAY_MODELS[slug]);

  router.use(protect);
  // Above "/:id" routes only matter for GET "/:id"; these have more segments, order is safe either way.
  if (wedding) mountWeddingGuestOwner(router, slug, VALENTINE_DAY_MODELS[slug]);
  router.post("/", live, c.create);
  router.get("/my", c.getMy);
  router.get("/:id", c.get);
  router.put("/:id", live, c.update);
  router.post("/:id/publish", live, c.publish);
  router.delete("/:id", c.delete);

  return router;
}

export default makeValentineDayRouter;
