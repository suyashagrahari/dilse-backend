import { Request, Response } from "express";
import BirthdayPage from "../models/BirthdayPage";
import ValentinePage from "../models/ValentinePage";
import HoliPage from "../models/HoliPage";
import EidPage from "../models/EidPage";
import WeddingPage from "../models/WeddingPage";
import ReceptionPage from "../models/ReceptionPage";
import PlatformAnalytics from "../models/PlatformAnalytics";

const PAGE_MODELS = [BirthdayPage, ValentinePage, HoliPage, EidPage, WeddingPage, ReceptionPage];

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

    res.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error("Get platform overview error:", error);
    res.status(500).json({ success: false, error: "Failed to get platform analytics" });
  }
};
