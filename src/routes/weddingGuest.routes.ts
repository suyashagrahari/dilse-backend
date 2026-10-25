import type { Router, Request } from "express";
import rateLimit from "express-rate-limit";
import type mongoose from "mongoose";
import { optionalAuth } from "../middleware/auth";
import { makeWeddingGuestController, type WeddingGuestDeps } from "../controllers/weddingGuest.controller";

/**
 * Per IP + page: a family sharing one phone can answer for several households,
 * a script cannot flood one invitation. `windowMs` is injectable for tests.
 */
export function weddingGuestLimiter(max: number, windowMs = 60 * 60_000) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${req.ip}|${String(req.params.shareId || "")}`,
    message: { success: false, error: "Too many responses from this device — please try again later" },
  });
}

/** Public guest routes. Must be mounted BEFORE `protect`. */
export function mountWeddingGuestPublic(router: Router, slug: string, model: mongoose.Model<any> | null, deps: Partial<WeddingGuestDeps> = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = makeWeddingGuestController(slug, model, deps);
  router.post("/share/:shareId/rsvp", weddingGuestLimiter(12), optionalAuth, c.createRsvp);
  router.put("/share/:shareId/rsvp/:rsvpId", weddingGuestLimiter(30), optionalAuth, c.updateRsvp);
  router.post("/share/:shareId/blessing", weddingGuestLimiter(6), c.createBlessing);
  router.get("/share/:shareId/blessings", weddingGuestLimiter(240), c.listBlessings);
  return c;
}

/** Owner routes. Must be mounted AFTER `protect` (req.userId is the owner). */
export function mountWeddingGuestOwner(router: Router, slug: string, model: mongoose.Model<any> | null, deps: Partial<WeddingGuestDeps> = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = makeWeddingGuestController(slug, model, deps);
  router.get("/:id/guests", c.ownerGuests);
  router.get("/:id/guests.csv", c.ownerCsv);
  router.patch("/:id/blessings/:blessingId", c.ownerModerate);
  return c;
}
