import { Request, Response } from "express";
import HoliPage from "../models/HoliPage";
import { env } from "../config/env";

export const createHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      senderName, senderFamily, senderMembers, senderPhoto,
      recipientName, homeWishMessage, congratsMessage,
      hindiTitle, hindiSubtitle, englishSubtitle, holiDate, password,
    } = req.body;

    const page = await HoliPage.create({
      userId: req.userId,
      senderName: senderName || "",
      senderFamily: senderFamily || "Family",
      senderMembers: senderMembers || [],
      senderPhoto: senderPhoto || "",
      recipientName: recipientName || "",
      homeWishMessage: homeWishMessage || "",
      congratsMessage: congratsMessage || "",
      hindiTitle: hindiTitle || "होली है!",
      hindiSubtitle: hindiSubtitle || "आपको और आपके परिवार को होली की हार्दिक शुभकामनाएं",
      englishSubtitle: englishSubtitle || "Wishing you joy, colors, and countless blessings this Holi",
      holiDate: holiDate || "2026-03-14T00:00:00",
      password: password || "",
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to create holi page" });
  }
};

export const getMyHoliPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await HoliPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my holi pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoliPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      senderName, senderFamily, senderMembers, senderPhoto,
      recipientName, homeWishMessage, congratsMessage,
      hindiTitle, hindiSubtitle, englishSubtitle, holiDate, password,
    } = req.body;

    const page = await HoliPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    if (senderName !== undefined) page.senderName = senderName;
    if (senderFamily !== undefined) page.senderFamily = senderFamily;
    if (senderMembers !== undefined) page.senderMembers = senderMembers;
    if (senderPhoto !== undefined) page.senderPhoto = senderPhoto;
    if (recipientName !== undefined) page.recipientName = recipientName;
    if (homeWishMessage !== undefined) page.homeWishMessage = homeWishMessage;
    if (congratsMessage !== undefined) page.congratsMessage = congratsMessage;
    if (hindiTitle !== undefined) page.hindiTitle = hindiTitle;
    if (hindiSubtitle !== undefined) page.hindiSubtitle = hindiSubtitle;
    if (englishSubtitle !== undefined) page.englishSubtitle = englishSubtitle;
    if (holiDate !== undefined) page.holiDate = holiDate;
    if (password !== undefined) page.password = password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoliPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.isPublished = true;
    await page.save();

    const shareUrl = `${env.APP_URL}/${page.shareId}`;
    res.json({
      success: true,
      data: { shareId: page.shareId, shareUrl },
    });
  } catch (error) {
    console.error("Publish holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoliPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "holi" });
  } catch (error) {
    console.error("Get shared holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyHoliPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await HoliPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    if (!page.password) {
      res.json({ success: true, verified: true });
      return;
    }
    const match = await page.comparePassword(password || "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify holi page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoliPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Holi page deleted successfully" });
  } catch (error) {
    console.error("Delete holi page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
