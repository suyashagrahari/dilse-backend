import { Request, Response } from "express";
import CourtOfLovePage, { IQuizQuestion } from "../models/CourtOfLovePage";
import { checkPublishAccess } from "../services/publishGate.service";

const MAX_QUESTIONS = 5;
const OPTIONS_PER_QUESTION = 4;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Normalise whatever the client sent into exactly the shape the schema expects:
 * at most 5 hearings, exactly 4 pleas each, and a correctIndex that can only ever
 * point at a real option. Anything malformed is coerced rather than rejected so a
 * half-filled form still publishes.
 */
const sanitizeQuestions = (raw: unknown): IQuizQuestion[] => {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_QUESTIONS).map((q) => {
    const src = (q ?? {}) as Record<string, unknown>;
    const options = (Array.isArray(src.options) ? src.options : [])
      .slice(0, OPTIONS_PER_QUESTION)
      .map((o) => str(o, 200));
    while (options.length < OPTIONS_PER_QUESTION) options.push("");

    const idx = Number(src.correctIndex);
    return {
      exhibit: str(src.exhibit, 60),
      question: str(src.question, 300),
      options,
      correctIndex: Number.isFinite(idx) ? Math.min(Math.max(Math.trunc(idx), 0), OPTIONS_PER_QUESTION - 1) : 0,
      correctNote: str(src.correctNote, 200),
      wrongNote: str(src.wrongNote, 200),
      allCorrect: Boolean(src.allCorrect),
    };
  });
};

type CourtOfLoveBody = {
  plaintiffName?: unknown;
  accusedName?: unknown;
  headline?: unknown;
  oathText?: unknown;
  questions?: unknown;
  secretLetter?: unknown;
  signatureName?: unknown;
  certificateTitle?: unknown;
  password?: unknown;
};

export const createCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CourtOfLoveBody;

    const page = await CourtOfLovePage.create({
      userId: req.userId,
      plaintiffName: str(b.plaintiffName, 80),
      accusedName: str(b.accusedName, 80),
      headline: str(b.headline, 200),
      oathText: str(b.oathText, 400),
      questions: sanitizeQuestions(b.questions),
      secretLetter: str(b.secretLetter, 3000),
      signatureName: str(b.signatureName, 80),
      certificateTitle: str(b.certificateTitle, 120),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyCourtOfLovePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CourtOfLovePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my court of love pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtOfLovePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CourtOfLoveBody;

    const page = await CourtOfLovePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.plaintiffName    !== undefined) page.plaintiffName    = str(b.plaintiffName, 80);
    if (b.accusedName      !== undefined) page.accusedName      = str(b.accusedName, 80);
    if (b.headline         !== undefined) page.headline         = str(b.headline, 200);
    if (b.oathText         !== undefined) page.oathText         = str(b.oathText, 400);
    if (b.questions        !== undefined) page.questions        = sanitizeQuestions(b.questions);
    if (b.secretLetter     !== undefined) page.secretLetter     = str(b.secretLetter, 3000);
    if (b.signatureName    !== undefined) page.signatureName    = str(b.signatureName, 80);
    if (b.certificateTitle !== undefined) page.certificateTitle = str(b.certificateTitle, 120);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtOfLovePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "court-of-love",
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
    console.error("Publish court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtOfLovePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "court-of-love" });
  } catch (error) {
    console.error("Get shared court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyCourtOfLovePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await CourtOfLovePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify court of love page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteCourtOfLovePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtOfLovePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete court of love page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
