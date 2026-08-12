// ─── Wall controller ─────────────────────────────────────────────────────────
//
// Every number this file returns is counted, never estimated. If a count cannot
// be computed it is omitted from the response rather than approximated, and the
// page drops the line that would have shown it. There is no seeding path, no
// sample data and no synthetic timestamp anywhere in this file: an empty
// database returns an empty list, and the page is built to look right that way.

import { Request, Response } from "express";
import mongoose, { PipelineStage } from "mongoose";
import WallEntry from "../models/WallEntry";
import {
  WALL_TEMPLATES,
  wallTemplateByType,
  wallTypesForSlug,
  wallLabelForSlug,
} from "../config/wallTemplates";
import { deriveNames, removeWallEntryForPage } from "../services/wall.service";

const PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

// ─── Total creations, counted across every eligible collection ───────────────
//
// This is the "342 pages made" number. It is a real count of real documents —
// 30 countDocuments calls — so it is cached briefly rather than run per request.
// The cache is the only reason this is affordable; it is not a source of drift,
// because a Wall headline being 60 seconds stale is invisible and being wrong is
// not.
let totalCache: { value: number; at: number } | null = null;
const TOTAL_TTL_MS = 60_000;

async function countAllCreations(): Promise<number | null> {
  const now = Date.now();
  if (totalCache && now - totalCache.at < TOTAL_TTL_MS) return totalCache.value;
  try {
    const counts = await Promise.all(
      WALL_TEMPLATES.map((t) => t.model.countDocuments({ isPublished: true }))
    );
    const value = counts.reduce((a, b) => a + b, 0);
    totalCache = { value, at: now };
    return value;
  } catch (err) {
    console.error("[wall] failed to count creations", err);
    // Null, never a guess. The page omits the whole line rather than print a
    // number it cannot stand behind.
    return null;
  }
}

/** Approved, non-example entries grouped by slug — the filter chip counts. */
async function facetCounts(): Promise<Map<string, number>> {
  const rows = await WallEntry.aggregate<{ _id: string; count: number }>([
    { $match: { status: "approved", isExample: false } },
    { $group: { _id: "$templateSlug", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.count]));
}

// ─── GET /api/wall ───────────────────────────────────────────────────────────

export const getWall = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    const sort = req.query.sort === "popular" ? "popular" : "recent";
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(String(req.query.limit ?? PAGE_SIZE), 10) || PAGE_SIZE)
    );
    const skip = Math.max(0, parseInt(String(req.query.skip ?? 0), 10) || 0);

    // An unknown slug is an empty filter, not a 404 with a fabricated fallback.
    const slugValid = slug ? wallTypesForSlug(slug).length > 0 : true;
    const match: Record<string, unknown> = { status: "approved" };
    if (slug) match.templateSlug = slug;

    const counts = await facetCounts();

    const pipeline: PipelineStage[] = [{ $match: match }];

    if (sort === "popular") {
      // Rank by how many entries that template has, then by recency. Built from
      // the same real counts the chips show, so "Most made" and the chip numbers
      // can never disagree.
      const branches = [...counts.entries()].map(([s, n]) => ({
        case: { $eq: ["$templateSlug", s] },
        then: n,
      }));
      pipeline.push({
        $addFields: {
          _rank: branches.length ? { $switch: { branches, default: 0 } } : 0,
        },
      });
      pipeline.push({ $sort: { _rank: -1, createdAt: -1, _id: -1 } });
    } else {
      pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
    }

    pipeline.push({ $skip: skip }, { $limit: limit });
    pipeline.push({
      // An explicit allow-list, so a future field added to WallEntry cannot
      // start appearing in a public response by default. userId and pageId in
      // particular must never leave the server.
      $project: {
        _id: 1,
        templateType: 1,
        templateSlug: 1,
        creatorFirstName: 1,
        recipientFirstName: 1,
        pairing: 1,
        isExample: 1,
        createdAt: 1,
      },
    });

    const [rows, totalCreations] = await Promise.all([
      slugValid ? WallEntry.aggregate(pipeline) : Promise.resolve([]),
      countAllCreations(),
    ]);

    // Examples are excluded from every published count. They exist to show what
    // the templates look like, not to inflate a number.
    const shared = [...counts.values()].reduce((a, b) => a + b, 0);

    const facets = [...counts.entries()]
      .map(([s, count]) => ({ slug: s, label: wallLabelForSlug(s) ?? s, count }))
      // A template with nothing on the Wall has no chip at all — a chip reading
      // "Proposal 0" advertises an absence.
      .filter((f) => f.count > 0)
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    res.json({
      success: true,
      data: {
        entries: rows.map((r) => ({
          id: String(r._id),
          templateType: r.templateType,
          templateSlug: r.templateSlug,
          templateName: wallLabelForSlug(r.templateSlug) ?? r.templateSlug,
          creatorFirstName: r.creatorFirstName,
          recipientFirstName: r.recipientFirstName,
          pairing: r.pairing,
          isExample: Boolean(r.isExample),
          createdAt: r.createdAt,
        })),
        facets,
        /** Real count of published creations, or null when it could not be counted. */
        totalCreations,
        /** Real count of approved, non-example Wall entries. */
        sharedCount: shared,
        hasMore: rows.length === limit,
      },
    });
  } catch (err) {
    console.error("[wall] list failed", err);
    res.status(500).json({ success: false, error: "Failed to load the Wall" });
  }
};

// ─── Consent ─────────────────────────────────────────────────────────────────

/**
 * POST /api/wall/consent — opt one creation in.
 *
 * The names are read off the creation document here, server-side. The client
 * sends only which page it means; it cannot choose what the Wall will say.
 */
export const setWallConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const templateType = String((req.body as Record<string, unknown>)?.templateType ?? "");
    const pageId = String((req.body as Record<string, unknown>)?.pageId ?? "");

    const tpl = wallTemplateByType(templateType);
    if (!tpl) {
      res.status(400).json({ success: false, error: "This template cannot be shared on the Wall" });
      return;
    }
    if (!mongoose.isValidObjectId(pageId)) {
      res.status(400).json({ success: false, error: "Invalid page" });
      return;
    }

    const doc = (await tpl.model
      .findOne({ _id: pageId, userId: req.userId })
      .lean()) as Record<string, unknown> | null;
    if (!doc) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    const { creatorFirstName, recipientFirstName, blocked } = deriveNames(doc, tpl);
    if (!creatorFirstName || !recipientFirstName) {
      res.status(400).json({
        success: false,
        error: "Add both names to your page before sharing it on the Wall",
      });
      return;
    }

    await WallEntry.findOneAndUpdate(
      { templateType, pageId },
      {
        $set: {
          templateType,
          templateSlug: tpl.slug,
          pageId,
          userId: req.userId,
          creatorFirstName,
          recipientFirstName,
          pairing: tpl.pairing,
          // A blocked name goes straight to the queue as removed, where a human
          // can reverse it. It is never silently published and never silently
          // discarded.
          status: blocked ? "removed" : "pending",
          consentAt: new Date(),
        },
        $setOnInsert: { isExample: false, reportCount: 0 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      data: { status: blocked ? "removed" : "pending", creatorFirstName, recipientFirstName },
    });
  } catch (err) {
    console.error("[wall] consent failed", err);
    res.status(500).json({ success: false, error: "Could not add this to the Wall" });
  }
};

/**
 * DELETE /api/wall/consent/:templateType/:pageId — take it off, immediately.
 *
 * One call, no confirmation step, no "are you sure", no offer to keep it up for
 * a while. The row is deleted outright rather than flagged, so the two names
 * stop existing on our side the moment the owner says so.
 */
export const revokeWallConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.params;
    if (!mongoose.isValidObjectId(pageId)) {
      res.status(400).json({ success: false, error: "Invalid page" });
      return;
    }
    await WallEntry.deleteOne({ templateType, pageId, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error("[wall] revoke failed", err);
    res.status(500).json({ success: false, error: "Could not remove this from the Wall" });
  }
};

/** GET /api/wall/mine/:templateType/:pageId — what the owner's checkbox should show. */
export const getMyWallEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { templateType, pageId } = req.params;
    if (!mongoose.isValidObjectId(pageId)) {
      res.json({ success: true, data: { consented: false, status: null } });
      return;
    }
    const entry = await WallEntry.findOne({ templateType, pageId, userId: req.userId })
      .select("status")
      .lean();
    res.json({
      success: true,
      data: { consented: Boolean(entry), status: entry?.status ?? null },
    });
  } catch (err) {
    console.error("[wall] mine failed", err);
    res.status(500).json({ success: false, error: "Failed to read Wall status" });
  }
};

/**
 * POST /api/wall/:id/report — hide now, review later.
 *
 * The entry is hidden on the first report, before any human looks at it. An
 * offensive name pairing sitting on a public page for the length of a
 * moderation backlog is a worse outcome than an occasional wrongly-hidden card,
 * and the queue makes the latter reversible.
 */
export const reportWallEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, error: "Invalid entry" });
      return;
    }
    await WallEntry.updateOne(
      { _id: id },
      { $set: { status: "removed" }, $inc: { reportCount: 1 } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[wall] report failed", err);
    res.status(500).json({ success: false, error: "Could not report this" });
  }
};

// ─── Admin moderation ────────────────────────────────────────────────────────

/** GET /api/admin/wall — the queue. Pending first, then anything reported. */
export const getWallQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const valid = ["pending", "approved", "removed"];
    const entries = await WallEntry.find(valid.includes(status) ? { status } : { status: "pending" })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({
      success: true,
      data: entries.map((e) => ({
        id: String(e._id),
        templateType: e.templateType,
        templateSlug: e.templateSlug,
        templateName: wallLabelForSlug(e.templateSlug) ?? e.templateSlug,
        creatorFirstName: e.creatorFirstName,
        recipientFirstName: e.recipientFirstName,
        pairing: e.pairing,
        status: e.status,
        reportCount: e.reportCount,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error("[wall] queue failed", err);
    res.status(500).json({ success: false, error: "Failed to load the queue" });
  }
};

/** PATCH /api/admin/wall/:id — approve or reject one entry. */
export const moderateWallEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const action = String((req.body as Record<string, unknown>)?.action ?? "");
    if (!mongoose.isValidObjectId(id) || !["approve", "reject"].includes(action)) {
      res.status(400).json({ success: false, error: "Invalid moderation action" });
      return;
    }
    const entry = await WallEntry.findByIdAndUpdate(
      id,
      { $set: { status: action === "approve" ? "approved" : "removed" } },
      { new: true }
    ).lean();
    if (!entry) {
      res.status(404).json({ success: false, error: "Entry not found" });
      return;
    }
    res.json({ success: true, data: { id, status: entry.status } });
  } catch (err) {
    console.error("[wall] moderate failed", err);
    res.status(500).json({ success: false, error: "Could not moderate this entry" });
  }
};

export { removeWallEntryForPage };
