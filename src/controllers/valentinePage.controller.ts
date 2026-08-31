import { Request, Response } from "express";
import ValentinePage from "../models/ValentinePage";
import { env } from "../config/env";
import { checkPublishAccess } from "../services/publishGate.service";

export const createValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, promises, photos, theme } = req.body;
    if (!recipientName) {
      res.status(400).json({ success: false, error: "Recipient name is required" });
      return;
    }
    const page = await ValentinePage.create({
      userId: req.userId,
      recipientName, senderName, personalMessage, promises, photos, theme,
    });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to create valentine page" });
  }
};

export const getMyValentinePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ValentinePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my valentine pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ValentinePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Get valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, promises, photos, theme } = req.body;
    const page = await ValentinePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (recipientName !== undefined) page.recipientName = recipientName;
    if (senderName !== undefined) page.senderName = senderName;
    if (personalMessage !== undefined) page.personalMessage = personalMessage;
    if (promises !== undefined) page.promises = promises;
    if (photos !== undefined) page.photos = photos;
    if (theme !== undefined) page.theme = theme;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ValentinePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    // ── Payment gate ─────────────────────────────────────────────────────────
    const gate = await checkPublishAccess({
      userId:             String(req.userId),
      templateType:       "valentine",
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
    console.error("Publish valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ValentinePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, data: page, templateType: "valentine" });
  } catch (error) {
    console.error("Get shared valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const deleteValentinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ValentinePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete valentine page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
