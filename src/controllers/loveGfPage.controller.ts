import { Request, Response } from "express";
import LoveGfPage from "../models/LoveGfPage";
import { transformMediaPayload } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

// Normalize a gallery photo entry — handles both legacy string[] and new PhotoItem format
function normalizePhoto(p: unknown) {
  if (typeof p === "string") return { url: p, letter: "", cropX: 50, cropY: 50 };
  const obj = p as Record<string, unknown>;
  return {
    url:    String(obj.url    ?? ""),
    letter: String(obj.letter ?? ""),
    cropX:  Number(obj.cropX  ?? 50),
    cropY:  Number(obj.cropY  ?? 50),
  };
}

export const createLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, wishMessage, loveDate,
            homePhotos, galleryPhotos, quizQuestions, truthDareQuestions, password } = req.body;

    const payload = await transformMediaPayload(
      {
        recipientName:        recipientName        || "",
        senderName:           senderName           || "",
        personalMessage:      personalMessage      || "",
        wishMessage:          wishMessage          || "",
        loveDate:             loveDate             || "",
        homePhotos:           homePhotos           || [],
        galleryPhotos:        (galleryPhotos       || []).map(normalizePhoto),
        quizQuestions:        quizQuestions        || [],
        truthDareQuestions:   truthDareQuestions   || [],
        password:             password             || "",
      },
      { template: "love-gf", userId: req.userId }
    );

    const page = await LoveGfPage.create({ userId: req.userId, ...payload });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyLoveGfPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await LoveGfPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my love-gf pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
      pageObj.shareUrl = shareUrl;
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipientName, senderName, personalMessage, wishMessage, loveDate,
            homePhotos, galleryPhotos, quizQuestions, truthDareQuestions, password } = req.body;

    const page = await LoveGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const payload = await transformMediaPayload(
      { recipientName, senderName, personalMessage, wishMessage, loveDate,
        homePhotos: homePhotos || [],
        galleryPhotos: (galleryPhotos || []).map(normalizePhoto),
        quizQuestions: quizQuestions || [],
        truthDareQuestions: truthDareQuestions || [],
        password },
      { template: "love-gf", userId: req.userId }
    );

    if (payload.recipientName        !== undefined) page.recipientName        = payload.recipientName;
    if (payload.senderName           !== undefined) page.senderName           = payload.senderName;
    if (payload.personalMessage      !== undefined) page.personalMessage      = payload.personalMessage;
    if (payload.wishMessage          !== undefined) page.wishMessage          = payload.wishMessage;
    if (payload.loveDate             !== undefined) page.loveDate             = payload.loveDate;
    if (payload.homePhotos           !== undefined) page.homePhotos           = payload.homePhotos;
    if (payload.galleryPhotos        !== undefined) page.galleryPhotos        = payload.galleryPhotos;
    if (payload.quizQuestions        !== undefined) page.quizQuestions        = payload.quizQuestions;
    if (payload.truthDareQuestions   !== undefined) page.truthDareQuestions   = payload.truthDareQuestions;
    if (payload.password !== undefined && payload.password !== "") page.password = payload.password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "love-gf",
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
    console.error("Publish love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: { ...safeData, quizAttempts: page.quizAttempts || [] }, hasPassword: !!page.password, templateType: "love-gf" });
  } catch (error) {
    console.error("Get shared love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyLoveGfPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await LoveGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify love-gf page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const saveGameResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, prompt, answer } = req.body;
    if (!type || !prompt || !answer?.trim()) {
      res.status(400).json({ success: false, error: "type, prompt, and answer are required" });
      return;
    }
    const page = await LoveGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    page.gameResponses.push({ type, prompt, answer: answer.trim(), savedAt: new Date() });
    await page.save();
    res.json({ success: true });
  } catch (error) {
    console.error("Save game response error:", error);
    res.status(500).json({ success: false, error: "Failed to save response" });
  }
};

export const saveQuizAttempt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { score, total } = req.body;
    if (typeof score !== "number" || typeof total !== "number") {
      res.status(400).json({ success: false, error: "score and total are required numbers" });
      return;
    }
    const page = await LoveGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    page.quizAttempts.push({ score, total, playedAt: new Date() });
    await page.save();
    res.json({ success: true });
  } catch (error) {
    console.error("Save quiz attempt error:", error);
    res.status(500).json({ success: false, error: "Failed to save attempt" });
  }
};

export const deleteLoveGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveGfPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete love-gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
