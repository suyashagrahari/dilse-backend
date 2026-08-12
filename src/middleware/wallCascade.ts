// ─── Wall cascade ────────────────────────────────────────────────────────────
//
// When a creation is deleted, its Wall entry goes with it.
//
// ── WHY A MIDDLEWARE AND NOT 30 CONTROLLER EDITS ────────────────────────────
//
// Every template has its own `deleteXxxPage` controller. Adding a cleanup line
// to each of them would work today and rot immediately: the 31st template gets
// written by copying the 30th, and if that copy predates this feature its
// deletes silently leave orphans behind. The failure is invisible — no error,
// no log, just a name on a public page belonging to a creation that no longer
// exists.
//
// One middleware keyed on the URL segment cannot be forgotten, because nobody
// has to remember it. It is the same trade this codebase already made for the
// share sheet: one bus instead of forty wirings.
//
// ── ORDERING ────────────────────────────────────────────────────────────────
//
// This fires on response finish, so it is a post-commit hook rather than part
// of the same transaction — nothing else in this codebase uses Mongo
// transactions, and introducing a session here would mean rewriting 30 delete
// paths, which is precisely what this avoids. The window is milliseconds, and
// what sits in it is a card showing two first names and a template name. A Wall
// card links to the template builder, never to the creation, so an entry that
// outlives its page by a moment is stale, not broken — there is no dead link to
// land on.

import { Request, Response, NextFunction } from "express";
import { wallTemplateBySegment } from "../config/wallTemplates";
import { removeWallEntryForPage } from "../services/wall.service";

/** Matches `/api/<segment>/<id>` and nothing deeper. */
const DELETE_PATH = /^\/api\/([a-z0-9-]+)\/([a-f0-9]{24})$/i;

export function wallCascade(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "DELETE") {
    next();
    return;
  }

  const match = DELETE_PATH.exec(req.path);
  if (!match) {
    next();
    return;
  }

  const tpl = wallTemplateBySegment(match[1]);
  if (!tpl) {
    next();
    return;
  }
  const pageId = match[2];

  res.on("finish", () => {
    // Only when the delete actually succeeded. A 403 or 404 must not clear a
    // Wall entry — that would let a failed delete attempt take someone's card
    // down.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void removeWallEntryForPage(tpl.templateType, pageId);
    }
  });

  next();
}
