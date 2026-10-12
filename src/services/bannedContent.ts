import { Request, Response, NextFunction } from "express";
import User from "../models/User";
import { TEMPLATE_REGISTRY } from "./templateRegistry";
import { HIDDEN_CONTENT_STATUSES } from "./accountStatus";

/**
 * Hides the published pages of banned users — and of closed accounts.
 *
 * "Closed" (the owner asked us to close the account; see accountClosure) hides
 * pages exactly as a ban does, through this same set, which is what makes a
 * "hide" closure reversible: nothing on the pages is touched, and reinstating
 * the account rebuilds the set without them. The names below still say
 * "banned" because that is what the module was first written for.
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 *
 * A share link is served from two places: the central `getSharedPage` resolver
 * AND each template's own `/share/:shareId` endpoint — 44 handlers in total.
 * Adding an owner-status check to each one means 44 chances to forget, and a
 * template added later starts out unguarded. Doing it as a middleware keeps it
 * in one place and covers templates that do not exist yet.
 *
 * ── WHY A SET AND NOT A QUERY ───────────────────────────────────────────────
 *
 * The obvious middleware — resolve the shareId, look up the owner, check their
 * status — costs a lookup on every share view in the product, forever, to catch
 * a case that is almost always empty. Instead the set of blocked shareIds is
 * computed when someone is banned and consulted with an O(1) `has`.
 *
 * When no user is banned the set is empty and the middleware does nothing at
 * all. Banned users cannot sign in, so they cannot publish new pages, which is
 * what makes the set safe to hold rather than re-derive per request.
 *
 * Rebuilt at boot and on every ban or reinstatement. Per-process, so with
 * multiple instances a ban reaches the others at their next restart — the
 * replacement at that point is a shared cache, not a different call site.
 */

let blocked = new Set<string>();
let building: Promise<void> | null = null;

export async function rebuildBannedContent(): Promise<void> {
  if (building) return building;
  building = (async () => {
    try {
      const banned = await User.find({ status: { $in: HIDDEN_CONTENT_STATUSES } }).select("_id").lean();
      if (banned.length === 0) {
        blocked = new Set();
        return;
      }
      const ids = banned.map((u) => u._id);
      const groups = await Promise.all(
        TEMPLATE_REGISTRY.map((t) =>
          t.model.find({ userId: { $in: ids } }).select("shareId").lean()
        )
      );
      const next = new Set<string>();
      for (const g of groups) {
        for (const d of g as { shareId?: string }[]) {
          if (d.shareId) next.add(d.shareId);
        }
      }
      blocked = next;
      console.log(`[bannedContent] ${next.size} share link(s) hidden across ${banned.length} banned/closed account(s)`);
    } catch (err) {
      // Keep the previous set rather than failing open to "nothing is hidden".
      console.error("[bannedContent] rebuild failed, keeping previous set", err);
    } finally {
      building = null;
    }
  })();
  return building;
}

export function isShareBlocked(shareId: string): boolean {
  return blocked.size > 0 && blocked.has(shareId);
}

/**
 * Mount ahead of the share routes. A hidden page answers exactly as a deleted
 * one does — the recipient learns nothing about why, which is the right amount
 * to tell a third party about someone else's moderation.
 */
export const guardBannedContent = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const shareId = req.params.shareId || (req.path.match(/\/share\/([^/]+)/) || [])[1];
  if (shareId && isShareBlocked(String(shareId))) {
    res.status(404).json({ success: false, error: "Page not found" });
    return;
  }
  next();
};
