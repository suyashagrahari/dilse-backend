// ─── Template visibility: one public read, two admin writes ──────────────────
//
// The public read is deliberately anonymous and tiny — the gallery is the first
// thing a stranger loads, and it must not need a session to know what to show.

import { Request, Response } from "express";
import User from "../models/User";
import TemplateVisibility from "../models/TemplateVisibility";
import { isApexDeployment } from "../config/env";
import {
  adminVisibilityView,
  defaultLive,
  hiddenSlugs,
  invalidateVisibilityCache,
} from "../config/templateVisibility";

/** A slug is a URL segment. Anything else is a client bug or an attack. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * GET /api/template-visibility  — public, unauthenticated.
 *
 * `{ hidden: ["happy-rakshabandhan-to-sister"] }`
 */
export const getPublicTemplateVisibility = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const hidden = await hiddenSlugs();
    // 60s at the edge, and stale-while-revalidate so a toggle never costs a
    // visitor a slow gallery. The window is the price of the cache and is the
    // reason the admin screen says the change takes about a minute to appear.
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    res.json({ success: true, data: { hidden } });
  } catch (error) {
    console.error("Public template visibility error:", error);
    // An empty list, not a 500: the gallery asking this question must never be
    // the reason the gallery does not render. Failing open shows everything,
    // which is exactly the behaviour this feature replaced.
    res.json({ success: true, data: { hidden: [] } });
  }
};

/**
 * GET /api/admin/template-visibility — every decision on record, plus the
 * code-level defaults, so the admin screen can show WHY something is hidden.
 */
export const getAdminTemplateVisibility = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const docs = await TemplateVisibility.find({})
      .select("slug live updatedByEmail updatedAt")
      .sort({ slug: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        rows: docs.map((d) => ({
          slug: String(d.slug),
          live: Boolean(d.live),
          updatedByEmail: d.updatedByEmail || "",
          updatedAt: d.updatedAt,
        })),
        // `defaultHidden` is the default IN FORCE here (empty off the apex),
        // so the screen's per-row state equals `hidden`. `isApex` and
        // `apexDefaultHidden` let it say what the live domain would do.
        ...adminVisibilityView(
          new Map(docs.map((d) => [String(d.slug).toLowerCase(), Boolean(d.live)])),
          isApexDeployment()
        ),
      },
    });
  } catch (error) {
    console.error("Admin template visibility error:", error);
    res.status(500).json({ success: false, error: "Failed to read template visibility" });
  }
};

async function writeOne(slug: string, live: boolean, email: string) {
  return TemplateVisibility.findOneAndUpdate(
    { slug },
    { slug, live, updatedByEmail: email },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

/**
 * PATCH /api/admin/template-visibility/:slug  `{ live: boolean }`
 *
 * Upserts, so the first toggle of a template that has never been decided about
 * writes the row that from then on outranks `DEFAULT_HIDDEN`.
 */
export const setTemplateVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: "Invalid template slug" });
      return;
    }
    if (typeof req.body?.live !== "boolean") {
      res.status(400).json({ success: false, error: "`live` must be true or false" });
      return;
    }

    const admin = await User.findById(req.userId).select("email");
    const row = await writeOne(slug, req.body.live, admin?.email || "");
    invalidateVisibilityCache();

    res.json({
      success: true,
      data: { slug: row.slug, live: row.live, updatedByEmail: row.updatedByEmail },
      message: `${slug} is now ${row.live ? "live" : "hidden"}`,
    });
  } catch (error) {
    console.error("Set template visibility error:", error);
    res.status(500).json({ success: false, error: "Failed to update template visibility" });
  }
};

/**
 * PATCH /api/admin/template-visibility  `{ updates: [{ slug, live }, …] }`
 *
 * Exists so "hide everything except these two" is ONE request and one cache
 * invalidation. Doing it as N single writes from the browser meant the gallery
 * could be read halfway through the change — a state the admin never chose.
 */
export const setTemplateVisibilityBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    const updates = req.body?.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ success: false, error: "`updates` must be a non-empty array" });
      return;
    }
    if (updates.length > 200) {
      res.status(400).json({ success: false, error: "Too many updates in one request" });
      return;
    }

    const clean: Array<{ slug: string; live: boolean }> = [];
    for (const u of updates) {
      const slug = String(u?.slug || "").toLowerCase();
      if (!SLUG_RE.test(slug) || typeof u?.live !== "boolean") {
        res.status(400).json({ success: false, error: `Invalid update for "${u?.slug}"` });
        return;
      }
      clean.push({ slug, live: u.live });
    }

    const admin = await User.findById(req.userId).select("email");
    const email = admin?.email || "";

    await TemplateVisibility.bulkWrite(
      clean.map(({ slug, live }) => ({
        updateOne: {
          filter: { slug },
          update: { $set: { slug, live, updatedByEmail: email } },
          upsert: true,
        },
      }))
    );
    invalidateVisibilityCache();

    res.json({
      success: true,
      data: { updated: clean.length, hidden: await hiddenSlugs() },
      message: `${clean.length} template${clean.length === 1 ? "" : "s"} updated`,
    });
  } catch (error) {
    console.error("Bulk template visibility error:", error);
    res.status(500).json({ success: false, error: "Failed to update template visibility" });
  }
};

/**
 * DELETE /api/admin/template-visibility/:slug
 *
 * Drops the decision and lets the code-level default apply again. Worth having
 * as its own verb: "I have no opinion" is a different state from "hidden", and
 * without this there is no way back to it once a row exists.
 */
export const clearTemplateVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: "Invalid template slug" });
      return;
    }
    await TemplateVisibility.deleteOne({ slug });
    invalidateVisibilityCache();
    res.json({
      success: true,
      data: { slug, live: defaultLive(slug) },
      message: `${slug} follows the built-in default again`,
    });
  } catch (error) {
    console.error("Clear template visibility error:", error);
    res.status(500).json({ success: false, error: "Failed to clear template visibility" });
  }
};
