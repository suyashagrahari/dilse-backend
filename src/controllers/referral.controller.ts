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
