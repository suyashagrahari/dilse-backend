import { Request, Response } from "express";
import User from "../models/User";
import ReferralRecord from "../models/ReferralRecord";
import PointTransaction from "../models/PointTransaction";

export const getReferralInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    const referralCount = await ReferralRecord.countDocuments({ referrer: user._id });

    res.json({
      success: true,
      data: {
        points: user.points,
        totalPointsEarned: user.totalPointsEarned,
        referralCode: user.referralCode,
        referralCount,
      },
    });
  } catch (error) {
    console.error("getReferralInfo error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch referral info" });
  }
};

export const getReferrerByCode = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = String(req.params.code || "");
    if (!code) {
      res.status(400).json({ success: false, error: "Code required" });
      return;
    }
    const user = await User.findOne({ referralCode: code.toUpperCase().trim() }).select("name avatar influencer");
    if (!user) {
      res.status(404).json({ success: false, error: "Invalid referral code" });
      return;
    }
    res.json({
      success: true,
      // Influencer codes pay commission, not points — the client must not
      // show its "you both get 100 points" welcome for them.
      data: { name: user.name, avatar: user.avatar ?? null, isInfluencer: user.influencer?.status === "active" },
    });
  } catch (error) {
    console.error("getReferrerByCode error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch referrer" });
  }
};

export const getPointsHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const transactions = await PointTransaction.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error("getPointsHistory error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch points history" });
  }
};
