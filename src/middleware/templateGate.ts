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

import { Request, Response, NextFunction } from "express";
import { isTemplateLive } from "../config/templateVisibility";

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
 *   router.post("/", requireTemplateLive("happy-rakshabandhan-to-sister"), create);
 */
export const requireTemplateLive =
  (slug: string) =>
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (await isTemplateLive(slug)) {
        next();
        return;
      }
      // 403 and not 404: the route exists and the caller is allowed to be here —
      // the template is switched off. A 404 would send the client into its
      // "this page was deleted" path, which is a different and wrong story.
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
      next();
    }
  };
