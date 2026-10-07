import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth, protect } from "../middleware/auth";
import { makeValentineDayController } from "../controllers/valentineDayPage.controller";
import { requireTemplateAccess } from "../middleware/templateGate";
import type { ValentineDaySlug } from "../config/valentineDays";

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
  router.get("/share/:shareId", c.getShared);
  router.post("/share/:shareId/verify", c.verify);
  router.post("/share/:shareId/react", reactLimit, optionalAuth, c.react);

  router.use(protect);
  router.post("/", live, c.create);
  router.get("/my", c.getMy);
  router.get("/:id", c.get);
  router.put("/:id", live, c.update);
  router.post("/:id/publish", live, c.publish);
  router.delete("/:id", c.delete);

  return router;
}

export default makeValentineDayRouter;
