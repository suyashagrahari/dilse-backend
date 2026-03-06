import { Request, Response } from "express";
import EidPage from "../models/EidPage";
import { env } from "../config/env";
import { transformMediaPayload } from "../services/mediaProcessor.service";

export const createEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      senderName, senderFamily, senderMembers, senderPhoto,
      recipientName, homeWishMessage, congratsMessage, urduTitle, urduSubtitle,
      englishSubtitle, eidDate, password,
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
        urduTitle: urduTitle || "عید مبارک",
        urduSubtitle: urduSubtitle || "آپ کو اور آپ کے خاندان کو عید الفطر مبارک ہو",
        englishSubtitle: englishSubtitle || "Wishing you joy, peace, and countless blessings this Eid",
        eidDate: eidDate || "2026-03-20T00:00:00",
        password: password || "",
      },
      { template: "eid", userId: req.userId }
    );

    const page = await EidPage.create({
      userId: req.userId,
      ...payload,
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to create eid page" });
  }
};

export const getMyEidPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await EidPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my eid pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await EidPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      senderName, senderFamily, senderMembers, senderPhoto,
      recipientName, homeWishMessage, congratsMessage, urduTitle, urduSubtitle,
      englishSubtitle, eidDate, password,
    } = req.body;

    const page = await EidPage.findOne({ _id: req.params.id, userId: req.userId });
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
        urduTitle,
        urduSubtitle,
        englishSubtitle,
        eidDate,
        password,
      },
      { template: "eid", userId: req.userId }
    );

    if (updates.senderName !== undefined) page.senderName = updates.senderName;
    if (updates.senderFamily !== undefined) page.senderFamily = updates.senderFamily;
    if (updates.senderMembers !== undefined) page.senderMembers = updates.senderMembers;
    if (updates.senderPhoto !== undefined) page.senderPhoto = updates.senderPhoto;
    if (updates.recipientName !== undefined) page.recipientName = updates.recipientName;
    if (updates.homeWishMessage !== undefined) page.homeWishMessage = updates.homeWishMessage;
    if (updates.congratsMessage !== undefined) page.congratsMessage = updates.congratsMessage;
    if (updates.urduTitle !== undefined) page.urduTitle = updates.urduTitle;
    if (updates.urduSubtitle !== undefined) page.urduSubtitle = updates.urduSubtitle;
    if (updates.englishSubtitle !== undefined) page.englishSubtitle = updates.englishSubtitle;
    if (updates.eidDate !== undefined) page.eidDate = updates.eidDate;
    if (updates.password !== undefined) page.password = updates.password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await EidPage.findOne({ _id: req.params.id, userId: req.userId });
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
    console.error("Publish eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await EidPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "eid" });
  } catch (error) {
    console.error("Get shared eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyEidPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await EidPage.findOne({ shareId: req.params.shareId, isPublished: true });
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
    console.error("Verify eid page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteEidPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await EidPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Eid page deleted successfully" });
  } catch (error) {
    console.error("Delete eid page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
