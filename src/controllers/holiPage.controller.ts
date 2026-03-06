import { Request, Response } from "express";
import HoliPage from "../models/HoliPage";
import { env } from "../config/env";
import { transformMediaPayload } from "../services/mediaProcessor.service";

export const createHoliPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      senderName, senderFamily, senderMembers, senderPhoto,
      recipientName, homeWishMessage, congratsMessage,
      hindiTitle, hindiSubtitle, englishSubtitle, holiDate, password,
    } = req.body;

    const payload = await transformMediaPayload(
      {
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
      },
      { template: "holi", userId: req.userId }
    );

    const page = await HoliPage.create({
      userId: req.userId,
      ...payload,
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

    const updates = await transformMediaPayload(
      {
        senderName,
        senderFamily,
        senderMembers,
        senderPhoto,
        recipientName,
        homeWishMessage,
        congratsMessage,
        hindiTitle,
        hindiSubtitle,
        englishSubtitle,
        holiDate,
        password,
      },
      { template: "holi", userId: req.userId }
    );

    if (updates.senderName !== undefined) page.senderName = updates.senderName;
    if (updates.senderFamily !== undefined) page.senderFamily = updates.senderFamily;
    if (updates.senderMembers !== undefined) page.senderMembers = updates.senderMembers;
    if (updates.senderPhoto !== undefined) page.senderPhoto = updates.senderPhoto;
    if (updates.recipientName !== undefined) page.recipientName = updates.recipientName;
    if (updates.homeWishMessage !== undefined) page.homeWishMessage = updates.homeWishMessage;
    if (updates.congratsMessage !== undefined) page.congratsMessage = updates.congratsMessage;
    if (updates.hindiTitle !== undefined) page.hindiTitle = updates.hindiTitle;
    if (updates.hindiSubtitle !== undefined) page.hindiSubtitle = updates.hindiSubtitle;
    if (updates.englishSubtitle !== undefined) page.englishSubtitle = updates.englishSubtitle;
    if (updates.holiDate !== undefined) page.holiDate = updates.holiDate;
    if (updates.password !== undefined) page.password = updates.password;

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

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
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
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
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
