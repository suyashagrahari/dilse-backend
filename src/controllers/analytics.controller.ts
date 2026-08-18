import { Request, Response } from "express";
import PlatformAnalytics from "../models/PlatformAnalytics";
import { TEMPLATE_LOOKUPS } from "./share.controller";

// Every template, not a hand-picked six.
//
// This list was BirthdayPage, ValentinePage, HoliPage, EidPage, WeddingPage and
// ReceptionPage — six of the forty-three that exist — so the public totals
// counted a seventh of the site and reported it as the whole. Deriving from
// TEMPLATE_LOOKUPS (the one list of which templates exist) means a new template
// is counted the day it ships.
const PAGE_MODELS = TEMPLATE_LOOKUPS.map((t) => t.model);

// Forty-three collections, two queries each, for numbers that move slowly and
// are read from a public page. Cached for a minute, like the activity feed —
// the alternative is 86 round trips per visitor.
const TTL_MS = 60_000;
let overviewCache: { at: number; payload: Record<string, unknown> } | null = null;

const getBaseAnalytics = async () => {
  const baseDoc = await PlatformAnalytics.findOneAndUpdate(
    { key: "global" },
    {
      $setOnInsert: {
        key: "global",
        baseSharedLinks: 10000,
        baseVisitors: 15000,
        baseInstalls: 3000,
      },
    },
    { upsert: true, new: true }
  ).lean();

  return {
    sharedLinks: baseDoc?.baseSharedLinks ?? 10000,
    visitors: baseDoc?.baseVisitors ?? 15000,
    installs: baseDoc?.baseInstalls ?? 3000,
  };
};

export const getPlatformOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    if (overviewCache && now - overviewCache.at < TTL_MS) {
      res.json({ success: true, data: overviewCache.payload });
      return;
    }

    const base = await getBaseAnalytics();
    const stats = await Promise.all(
      PAGE_MODELS.map(async (model) => {
        const [links, totals] = await Promise.all([
          model.countDocuments({ shareId: { $exists: true, $ne: "" } }),
          model.aggregate([
            { $group: { _id: null, views: { $sum: "$viewCount" }, installs: { $sum: "$installCount" } } },
          ]),
        ]);

        return {
          links,
          views: totals[0]?.views || 0,
          installs: totals[0]?.installs || 0,
        };
      })
    );

    const dynamicSharedLinks = stats.reduce((sum, s) => sum + s.links, 0);
    const dynamicVisitors = stats.reduce((sum, s) => sum + s.views, 0);
    const dynamicInstalls = stats.reduce((sum, s) => sum + s.installs, 0);

    const payload = {
      totals: {
        totalSharedLinks: base.sharedLinks + dynamicSharedLinks,
        totalVisitors: base.visitors + dynamicVisitors,
        totalInstalls: base.installs + dynamicInstalls,
      },
      base,
      dynamic: {
        sharedLinks: dynamicSharedLinks,
        visitors: dynamicVisitors,
        installs: dynamicInstalls,
      },
    };

    overviewCache = { at: now, payload };
    res.json({ success: true, data: payload });
  } catch (error) {
    console.error("Get platform overview error:", error);
    res.status(500).json({ success: false, error: "Failed to get platform analytics" });
  }
};
