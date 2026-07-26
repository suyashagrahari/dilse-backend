import { Request, Response } from "express";
import MissYouGfPage from "../models/MissYouGfPage";
import { transformMediaPayload } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

export const createMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { senderName, recipientName, petName, coverLine, letterBody, signature,
            yourCity, theirCity, reunionDate, distanceUnit, memories, secret,
            openWhen, quiz, voiceUrl, backgroundMusic, accentTint, sharePhoto, password } = req.body;

    const payload = await transformMediaPayload(
      {
        senderName:      senderName      || "",
        recipientName:   recipientName   || "",
        petName:         petName         || "",
        coverLine:       coverLine       || "",
        letterBody:      letterBody      || "",
        signature:       signature       || "",
        yourCity:        yourCity        || "",
        theirCity:       theirCity       || "",
        reunionDate:     reunionDate     || "",
        distanceUnit:    distanceUnit === "mi" ? "mi" : "km",
        memories:        Array.isArray(memories) ? memories : [],
        secret:          secret          || "",
        openWhen:        Array.isArray(openWhen) ? openWhen : [],
        quiz:            Array.isArray(quiz) ? quiz : [],
        voiceUrl:        voiceUrl        || "",
        backgroundMusic: backgroundMusic || "",
        accentTint:      accentTint === "pink" ? "pink" : "indigo",
        sharePhoto:      sharePhoto      || "",
        password:        password        || "",
      },
      { template: "missyou-gf", userId: req.userId }
    );

    const page = await MissYouGfPage.create({ userId: req.userId, ...payload });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyMissYouGfPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await MissYouGfPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my miss you gf pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await MissYouGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
      pageObj.shareUrl = shareUrl;
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

type MissYouGfUpdateBody = {
  senderName?: string;
  recipientName?: string;
  petName?: string;
  coverLine?: string;
  letterBody?: string;
  signature?: string;
  yourCity?: string;
  theirCity?: string;
  reunionDate?: string;
  distanceUnit?: string;
  memories?: import("../models/MissYouGfPage").IMemory[];
  secret?: string;
  openWhen?: import("../models/MissYouGfPage").IOpenWhenNote[];
  quiz?: import("../models/MissYouGfPage").IQuizCard[];
  voiceUrl?: string;
  backgroundMusic?: string;
  accentTint?: string;
  sharePhoto?: string;
  password?: string;
};

export const updateMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as MissYouGfUpdateBody;

    const page = await MissYouGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const payload = await transformMediaPayload(
      {
        senderName: b.senderName,
        recipientName: b.recipientName,
        petName: b.petName,
        coverLine: b.coverLine,
        letterBody: b.letterBody,
        signature: b.signature,
        yourCity: b.yourCity,
        theirCity: b.theirCity,
        reunionDate: b.reunionDate,
        distanceUnit: b.distanceUnit,
        memories: Array.isArray(b.memories) ? b.memories : undefined,
        secret: b.secret,
        openWhen: Array.isArray(b.openWhen) ? b.openWhen : undefined,
        quiz: Array.isArray(b.quiz) ? b.quiz : undefined,
        voiceUrl: b.voiceUrl,
        backgroundMusic: b.backgroundMusic,
        accentTint: b.accentTint,
        sharePhoto: b.sharePhoto,
        password: b.password,
      },
      { template: "missyou-gf", userId: req.userId }
    );

    if (payload.senderName      !== undefined) page.senderName      = payload.senderName;
    if (payload.recipientName   !== undefined) page.recipientName   = payload.recipientName;
    if (payload.petName         !== undefined) page.petName         = payload.petName;
    if (payload.coverLine       !== undefined) page.coverLine       = payload.coverLine;
    if (payload.letterBody      !== undefined) page.letterBody      = payload.letterBody;
    if (payload.signature       !== undefined) page.signature       = payload.signature;
    if (payload.yourCity        !== undefined) page.yourCity        = payload.yourCity;
    if (payload.theirCity       !== undefined) page.theirCity       = payload.theirCity;
    if (payload.reunionDate     !== undefined) page.reunionDate     = payload.reunionDate;
    if (payload.distanceUnit    !== undefined) page.distanceUnit    = payload.distanceUnit === "mi" ? "mi" : "km";
    if (payload.memories        !== undefined) page.memories        = payload.memories;
    if (payload.secret          !== undefined) page.secret          = payload.secret;
    if (payload.openWhen        !== undefined) page.openWhen        = payload.openWhen;
    if (payload.quiz            !== undefined) page.quiz            = payload.quiz;
    if (payload.voiceUrl        !== undefined) page.voiceUrl        = payload.voiceUrl;
    if (payload.backgroundMusic !== undefined) page.backgroundMusic = String(payload.backgroundMusic ?? "");
    if (payload.accentTint      !== undefined) page.accentTint      = payload.accentTint === "pink" ? "pink" : "indigo";
    if (payload.sharePhoto      !== undefined) page.sharePhoto      = String(payload.sharePhoto ?? "");
    if (payload.password !== undefined && payload.password !== "") page.password = payload.password;

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await MissYouGfPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "missyou-gf",
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
    console.error("Publish miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await MissYouGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "missyou-gf" });
  } catch (error) {
    console.error("Get shared miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyMissYouGfPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await MissYouGfPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify miss you gf page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteMissYouGfPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await MissYouGfPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete miss you gf page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
