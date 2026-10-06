import { Request, Response } from "express";
import BouquetGfPage from "../models/BouquetGfPage";
import type { IStemCount } from "../models/BouquetGfPage";
import { checkPublishAccess } from "../services/publishGate.service";

const MAX_BLOOMS = 10;

/** Coerce arbitrary input into a safe flowers array ({id,count}, clamped). */
function sanitizeFlowers(input: unknown): IStemCount[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((f) => {
      const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
      return { id: Math.floor(Number(o.id) || 0), count: Math.max(0, Math.min(MAX_BLOOMS, Math.floor(Number(o.count) || 0))) };
    })
    .filter((f) => f.id > 0 && f.count > 0)
    .slice(0, 12);
}

function sanitizeClauses(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((c) => String(c).slice(0, 200)).filter((c) => c.trim().length > 0).slice(0, 6);
}

function buildContent(b: Record<string, unknown>) {
  return {
    mode: b.mode === "mono" ? "mono" : "color",
    flowers: sanitizeFlowers(b.flowers),
    arrangementSeed: Math.floor(Number(b.arrangementSeed) || 7),
    greenery: Math.max(0, Math.min(2, Math.floor(Number(b.greenery) || 0))),
    recipientName: typeof b.recipientName === "string" ? b.recipientName.slice(0, 120) : "",
    senderName: typeof b.senderName === "string" ? b.senderName.slice(0, 120) : "",
    message: typeof b.message === "string" ? b.message.slice(0, 4000) : "",
    deedEnabled: b.deedEnabled === undefined ? true : !!b.deedEnabled,
    deedClauses: sanitizeClauses(b.deedClauses),
  };
}

export const createBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const content = buildContent(req.body || {});
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const page = await BouquetGfPage.create({ userId: req.userId, ...content, password });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyBouquetGfPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await BouquetGfPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my bouquet gf pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BouquetGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }
    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BouquetGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const b = (req.body || {}) as Record<string, unknown>;
    const content = buildContent(b);
    page.mode = content.mode as "color" | "mono";
    page.flowers = content.flowers;
    page.arrangementSeed = content.arrangementSeed;
    page.greenery = content.greenery;
    page.recipientName = content.recipientName;
    page.senderName = content.senderName;
    page.message = content.message;
    page.deedEnabled = content.deedEnabled;
    page.deedClauses = content.deedClauses;
    if (typeof b.password === "string" && b.password !== "") page.password = b.password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BouquetGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "bouquet-gf",
      pageId: String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });
    if (!gate.allowed) {
      res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
      return;
    }

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BouquetGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "bouquet-gf" });
  } catch (error) {
    console.error("Get shared bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyBouquetGfPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await BouquetGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) res.json({ success: true, verified: true });
    else res.status(401).json({ success: false, verified: false, error: "Wrong password" });
  } catch (error) {
    console.error("Verify bouquet gf page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteBouquetGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await BouquetGfPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete bouquet gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
