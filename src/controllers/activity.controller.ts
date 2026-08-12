// ─── Homepage activity ───────────────────────────────────────────────────────
//
// Real counts of real published pages, per template, plus when each template was
// last used. That is the entire data set. There is no seeding path, no name
// list, no invented visitor and no synthetic timestamp in this file — if the
// database is empty the response is empty, and the homepage falls back to
// promoting templates rather than to inventing people who used them.
//
// ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
//
// No names, no page ids, no share ids, no location. A creation's author is not
// looked up and could not be returned: the aggregate below never reads a name
// field. Showing "someone" rather than a name is not a placeholder to be filled
// in later — it is the only thing we are entitled to say about a person who
// never agreed to appear on a marketing surface.
//
// Location is absent because there is no real location to report: PageView
// declares a `country` column that nothing has ever written, and there is no
// geo header configured on the proxy. A flag here would be decoration invented
// to look like data.

import { Request, Response } from "express";
import mongoose from "mongoose";
import { TEMPLATE_LOOKUPS } from "./share.controller";

interface Highlight {
  /** Builder route without the leading slash — the client resolves the label. */
  slug: string;
  /** Real count of published pages for this template. */
  count: number;
  /** ISO timestamp of the most recent one, or null if none. */
  lastCreatedAt: string | null;
}

// One pass over ~48 collections is too much to repeat per request, and the
// numbers move slowly. Sixty seconds is short enough that a freshly published
// page shows up while the person who made it is still on the site.
let cache: { at: number; payload: { highlights: Highlight[]; total: number } } | null = null;
const TTL_MS = 60_000;

async function collect(): Promise<{ highlights: Highlight[]; total: number }> {
  const rows = await Promise.all(
    TEMPLATE_LOOKUPS.map(async (t) => {
      const model = t.model as mongoose.Model<unknown>;
      const slug = t.editorRoute.replace(/^\//, "");
      try {
        const [count, latest] = await Promise.all([
          model.countDocuments({ isPublished: true }),
          model
            .findOne({ isPublished: true })
            .sort({ createdAt: -1 })
            // Only the timestamp leaves the database. Not the names, not the
            // message, not the owner.
            .select("createdAt")
            .lean() as Promise<{ createdAt?: Date } | null>,
        ]);
        return {
          slug,
          count,
          lastCreatedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
        };
      } catch {
        // A single unreadable collection must not take the homepage down.
        return { slug, count: 0, lastCreatedAt: null };
      }
    })
  );

  // Two templates share a builder route (birthday and birthday-gf both live at
  // /birthday-gf), so fold them together or the client would show one route
  // twice with two different numbers.
  const merged = new Map<string, Highlight>();
  for (const r of rows) {
    const prev = merged.get(r.slug);
    if (!prev) {
      merged.set(r.slug, { ...r });
      continue;
    }
    prev.count += r.count;
    if (r.lastCreatedAt && (!prev.lastCreatedAt || r.lastCreatedAt > prev.lastCreatedAt)) {
      prev.lastCreatedAt = r.lastCreatedAt;
    }
  }

  // A template nobody has published has nothing true to say about itself, so it
  // is left out rather than shown at zero.
  const highlights = [...merged.values()]
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count);

  return { highlights, total: highlights.reduce((n, h) => n + h.count, 0) };
}

/** GET /api/activity/highlights — public, cached, counted. */
export const getActivityHighlights = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    if (!cache || now - cache.at >= TTL_MS) {
      cache = { at: now, payload: await collect() };
    }
    res.json({ success: true, data: cache.payload });
  } catch (err) {
    console.error("[activity] highlights failed", err);
    // An empty payload, never a fabricated one. The homepage treats this
    // identically to "nothing published yet" and promotes templates instead.
    res.json({ success: true, data: { highlights: [], total: 0 } });
  }
};
