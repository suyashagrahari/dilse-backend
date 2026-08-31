// ─── Server-side enforcement of a hidden template ────────────────────────────
//
// Hiding a template takes it out of the gallery and closes its builder, both of
// which the client does. This is the half the client cannot be trusted with: a
// URL somebody kept from last week, a bookmarked builder, a replayed request.
//
// ── WHY THIS GUARDS ONLY WRITES ─────────────────────────────────────────────
//
// Reads must keep working, and that is not a compromise — it is the point.
// Pages already published from a template stay published when the template is
// hidden; the recipient of a rakhi page opened it from a link, not from the
// gallery, and switching the template off must not break a page somebody has
// already sent. So `GET /:id`, `GET /share/:shareId` and the reply/contribution
// endpoints are all untouched.
//
// What is blocked is bringing NEW pages into existence: create, update, publish.
//
// ── IT IS PER USER NOW ──────────────────────────────────────────────────────
//
// A super admin can grant one person early access to a hidden template — see
// `config/templateAccess.ts`. So "is this template live" is no longer the whole
// question; the gate has to know who is asking.
//
// That is why this reads `req.userId`, and why every route file applies it AFTER
// `router.use(protect)`. Applied above `protect` it would see no user, find no
// grant, and refuse the very person the grant was created for.
//
// The previous export was `requireTemplateLive`, which took no request and could
// not do this. It is gone rather than kept as an alias: two names for one gate is
// how half the call sites end up on the one that ignores grants, and a call site
// that ignores grants fails silently in the direction of locking out a paying
// client.

import { Request, Response, NextFunction } from "express";
import { canUseTemplate } from "../config/templateAccess";

/**
 * Guard the create/update/publish routes of one template.
 *
 * Applied per route file rather than from a table in `routes/index.ts`, because
 * the mount path and the template slug are not the same string — the brother
 * page is mounted at `/raksha-bandhan-pages` and its slug is
 * `happy-rakshabandhan-to-brother`. A central table of forty-odd pairs is a
 * table of forty-odd chances to write the wrong slug, and a wrong slug here
 * fails open and silently. The route file already knows which template it is.
 *
 *   router.use(protect);
 *   router.post("/", live, createXPage);
 *
 * `publishGate.coverage.test.ts` asserts every write route has it, so the
 * forty-fourth template cannot quietly ship without one.
 */
export const requireTemplateAccess =
  (slug: string) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await canUseTemplate(req.userId, slug)) {
        next();
        return;
      }
      // 403 and not 404: the route exists and the caller is allowed to be here —
      // the template is switched off. A 404 would send the client into its
      // "this page was deleted" path, which is a different and wrong story.
      //
      // Deliberately the same message and code whether the template is hidden or
      // the user simply has no grant. A response that distinguished them would
      // tell any caller which unreleased templates exist.
      res.status(403).json({
        success: false,
        error: "This template isn't available right now.",
        code: "TEMPLATE_NOT_LIVE",
      });
    } catch (error) {
      console.error(`Template gate failed for ${slug}:`, error);
      // Fail OPEN. This check is a release control, not a security boundary, and
      // a database hiccup must not stop people finishing pages they are halfway
      // through building.
      //
      // Note the asymmetry with `templateAccess.ts`, which fails CLOSED on the
      // grant read. That is not a contradiction: there, failing open would admit
      // EVERYBODY to an unreleased template. Here, we have already failed to
      // answer the whole question, and the population being let through is the
      // one that was mid-build when the database blinked.
      next();
    }
  };
