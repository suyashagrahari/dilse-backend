import { Request, Response } from "express";
import BirthdayPage from "../models/BirthdayPage";
import { env } from "../config/env";
import { checkPublishAccess } from "../services/publishGate.service";

export const createBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, wishes, photos, musicTrack, theme, password } = req.body;
    if (!recipientName) {
      res.status(400).json({ success: false, error: "Recipient name is required" });
      return;
    }

    const page = await BirthdayPage.create({
      userId: req.userId,
      recipientName,
      senderName,
      personalMessage,
      wishes,
      photos,
      musicTrack,
      theme,
      password: password || "",
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create birthday page error:", error);
    res.status(500).json({ success: false, error: "Failed to create birthday page" });
  }
};

export const getMyBirthdayPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await BirthdayPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BirthdayPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, wishes, photos, musicTrack, theme, password } = req.body;
    const page = await BirthdayPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    if (recipientName !== undefined) page.recipientName = recipientName;
    if (senderName !== undefined) page.senderName = senderName;
    if (personalMessage !== undefined) page.personalMessage = personalMessage;
    if (wishes !== undefined) page.wishes = wishes;
    if (photos !== undefined) page.photos = photos;
    if (musicTrack !== undefined) page.musicTrack = musicTrack;
    if (theme !== undefined) page.theme = theme;
    if (password !== undefined) page.password = password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BirthdayPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    // ── Payment gate ─────────────────────────────────────────────────────────
    const gate = await checkPublishAccess({
      userId:             String(req.userId),
      templateType:       "birthday",
      pageId:             String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });

    if (!gate.allowed) {
      res.status(gate.httpStatus).json({
        success:  false,
        error:    gate.error,
        pricing:  gate.pricing,
      });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({
      success: true,
      data: { shareId: page.shareId, shareUrl },
    });
  } catch (error) {
    console.error("Publish page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BirthdayPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "birthday" });
  } catch (error) {
    console.error("Get shared page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyBirthdayPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await BirthdayPage.findOne({ shareId: req.params.shareId, isPublished: true });
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
    console.error("Verify password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteBirthdayPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BirthdayPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
