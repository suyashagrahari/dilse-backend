import { Request, Response } from "express";
import BirthdayPage from "../models/BirthdayPage";
import ValentinePage from "../models/ValentinePage";
import HoliPage from "../models/HoliPage";
import EidPage from "../models/EidPage";
import WeddingPage from "../models/WeddingPage";
import ReceptionPage from "../models/ReceptionPage";
import SharedAccess from "../models/SharedAccess";
import User from "../models/User";
import mongoose from "mongoose";

interface TemplateLookup {
  model: mongoose.Model<unknown>;
  templateType: string;
  editorRoute: string;
}

const TEMPLATE_LOOKUPS: TemplateLookup[] = [
  { model: BirthdayPage as mongoose.Model<unknown>, templateType: "birthday", editorRoute: "/birthday-gf" },
  { model: ValentinePage as mongoose.Model<unknown>, templateType: "valentine", editorRoute: "/valentine-gf" },
  { model: HoliPage as mongoose.Model<unknown>, templateType: "holi", editorRoute: "/holi" },
  { model: EidPage as mongoose.Model<unknown>, templateType: "eid", editorRoute: "/eid-mubarak" },
  { model: WeddingPage as mongoose.Model<unknown>, templateType: "wedding", editorRoute: "/wedding-shaadi" },
  { model: ReceptionPage as mongoose.Model<unknown>, templateType: "reception", editorRoute: "/reception" },
];

export const getSharedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    for (const { model, templateType, editorRoute } of TEMPLATE_LOOKUPS) {
      const page = await model.findOneAndUpdate(
        { shareId, isPublished: true },
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      if (page) {
        const pageObj = (page as { toObject: () => Record<string, unknown> }).toObject();
        const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj;
        const hasPassword = !!pageObj.password;
        res.json({
          success: true,
          templateType,
          editorRoute,
          hasPassword,
          installCount: (pageObj.installCount as number) || 0,
          viewCount: (pageObj.viewCount as number) || 0,
          senderUserId: String(pageObj.userId),
          data: safeData,
        });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Get shared page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const trackInstall = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;

    for (const { model } of TEMPLATE_LOOKUPS) {
      const page = await model.findOneAndUpdate(
        { shareId, isPublished: true },
        { $inc: { installCount: 1 } },
        { new: true }
      );
      if (page) {
        const count = (page as unknown as { installCount: number }).installCount;
        res.json({ success: true, installCount: count });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Track install error:", error);
    res.status(500).json({ success: false, error: "Failed to track install" });
  }
};

export const recordAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    const recipientUserId = req.userId;
    if (!recipientUserId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    for (const { model, templateType } of TEMPLATE_LOOKUPS) {
      const page = await model.findOne({ shareId, isPublished: true });
      if (page) {
        const pageObj = page as unknown as { userId: mongoose.Types.ObjectId };
        const senderUserId = pageObj.userId;

        if (String(senderUserId) === String(recipientUserId)) {
          res.json({ success: true, message: "Own page, no access record needed" });
          return;
        }

        await SharedAccess.findOneAndUpdate(
          { shareId, recipientUserId },
          {
            shareId,
            templateType,
            senderUserId,
            recipientUserId,
          },
          { upsert: true, new: true }
        );
        res.json({ success: true, message: "Access recorded" });
        return;
      }
    }

    res.status(404).json({ success: false, error: "Page not found" });
  } catch (error) {
    console.error("Record access error:", error);
    res.status(500).json({ success: false, error: "Failed to record access" });
  }
};

export const markPasswordVerified = async (req: Request, res: Response): Promise<void> => {
  try {
    const { shareId } = req.params;
    const recipientUserId = req.userId;
    if (!recipientUserId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const access = await SharedAccess.findOneAndUpdate(
      { shareId, recipientUserId },
      { passwordVerified: true },
      { new: true }
    );
    if (!access) {
      res.status(404).json({ success: false, error: "Access record not found" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Mark pw verified error:", error);
    res.status(500).json({ success: false, error: "Failed to update" });
  }
};

export const getReceivedPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const accesses = await SharedAccess.find({ recipientUserId: userId }).sort({ createdAt: -1 });
    if (!accesses.length) {
      res.json({ success: true, data: [] });
      return;
    }

    const senderIds = [...new Set(accesses.map((a) => String(a.senderUserId)))];
    const senders = await User.find({ _id: { $in: senderIds } }).select("name email avatar");
    const senderMap = new Map(senders.map((s) => [String(s._id), s]));

    const results: Record<string, unknown>[] = [];
    for (const access of accesses) {
      const lookup = TEMPLATE_LOOKUPS.find((t) => t.templateType === access.templateType);
      if (!lookup) continue;

      const query = lookup.model.findOne({ shareId: access.shareId, isPublished: true });
      if (access.passwordVerified) query.select("+passwordRaw");
      const page = await query;
      if (!page) continue;

      const pageObj = (page as { toObject: () => Record<string, unknown> }).toObject();
      const sender = senderMap.get(String(access.senderUserId));

      const entry: Record<string, unknown> = {
        shareId: access.shareId,
        templateType: access.templateType,
        recipientName: pageObj.recipientName,
        senderName: sender?.name || (pageObj.senderName as string) || "Someone",
        senderAvatar: sender?.avatar || null,
        hasPassword: !!pageObj.password,
        passwordVerified: access.passwordVerified,
        viewCount: (pageObj.viewCount as number) || 0,
        createdAt: access.createdAt,
      };

      if (access.passwordVerified && pageObj.passwordRaw) {
        entry.passwordRaw = pageObj.passwordRaw;
      }

      results.push(entry);
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Get received pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch received pages" });
  }
};

export const getMyCreations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    const results: Record<string, unknown>[] = [];

    for (const { model, templateType } of TEMPLATE_LOOKUPS) {
      const pages = await model.find({ userId }).select("+passwordRaw").sort({ updatedAt: -1 });
      for (const page of pages) {
        const obj = (page as { toObject: () => Record<string, unknown> }).toObject();
        results.push({
          _id: obj._id,
          shareId: obj.shareId,
          templateType,
          recipientName: obj.recipientName,
          senderName: obj.senderName,
          isPublished: obj.isPublished,
          hasPassword: !!obj.password,
          passwordRaw: obj.passwordRaw || "",
          viewCount: (obj.viewCount as number) || 0,
          installCount: (obj.installCount as number) || 0,
          updatedAt: obj.updatedAt,
          createdAt: obj.createdAt,
        });
      }
    }

    results.sort((a, b) => new Date(b.updatedAt as string).getTime() - new Date(a.updatedAt as string).getTime());
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Get my creations error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch creations" });
  }
};

export const getInstallStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [bdayResult, valResult] = await Promise.all([
      BirthdayPage.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: null, total: { $sum: "$installCount" } } },
      ]),
      ValentinePage.aggregate([
        { $match: { isPublished: true } },
        { $group: { _id: null, total: { $sum: "$installCount" } } },
      ]),
    ]);
    const total = (bdayResult[0]?.total || 0) + (valResult[0]?.total || 0);
    res.json({ success: true, totalInstalls: total });
  } catch (error) {
    console.error("Get install stats error:", error);
    res.status(500).json({ success: false, error: "Failed to get stats" });
  }
};
