import { Request, Response } from "express";
import OpenAI from "openai";
import CourtOfLovePage, { IQuizQuestion } from "../models/CourtOfLovePage";
import { checkPublishAccess } from "../services/publishGate.service";
import {
  AiRefusedError,
  AiUnavailableError,
  MIN_STORY_CHARS,
  generateCaseFromStory,
  sanitizeStory,
} from "../services/courtOfLoveAi.service";
import { sanitizeLoveGifs, sanitizeLovePhotos, sanitizeLock, sanitizeTheme, userPhotoFolder } from "../utils/loveMedia";

/**
 * Ten — the same count the client edits and the AI service writes.
 *
 * This was 5 while the editor, the demo and the generator all produced ten,
 * so every published page silently lost questions 6–10 (including the
 * closing "every answer is right" question) the moment it was saved.
 */
const MAX_QUESTIONS = 10;
const LETTER_MAX = 3000;
const COURT_THEMES = ["supreme", "pink", "night", "parchment"] as const;
const OPTIONS_PER_QUESTION = 4;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Normalise whatever the client sent into exactly the shape the schema expects:
 * at most 10 hearings, exactly 4 pleas each, and a correctIndex that can only ever
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
  language?: unknown;
  password?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
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
      language: str(b.language, 24) || "en",
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("court-of-love", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: str(b.letter, LETTER_MAX),
      theme: sanitizeTheme(b.theme, COURT_THEMES),
      ...sanitizeLock(b),
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
    if (b.language         !== undefined) page.language         = str(b.language, 24) || "en";
    if (b.photos           !== undefined) page.photos           = await sanitizeLovePhotos(b.photos, userPhotoFolder("court-of-love", req.userId));
    if (b.gifs             !== undefined) page.gifs             = sanitizeLoveGifs(b.gifs);
    if (b.letter           !== undefined) page.letter           = str(b.letter, LETTER_MAX);
    if (b.theme            !== undefined) page.theme            = sanitizeTheme(b.theme, COURT_THEMES);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock({ lockQuestion: b.lockQuestion ?? page.lockQuestion, lockAnswer: b.lockAnswer ?? page.lockAnswer });
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
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

/**
 * Turn the sender's own story into a full case file, in whatever language and
 * script they wrote it in.
 *
 * Nothing is persisted here — this only returns generated content for the editor
 * to drop into its form, which the sender can then edit freely before publishing.
 * Deliberately not storing the raw story: it is the most personal thing they
 * type, the recipient never needs it, and the page has no use for it after the
 * questions exist.
 */
export const generateCourtOfLoveContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { story?: unknown; plaintiffName?: unknown; accusedName?: unknown };
    const story = sanitizeStory(body.story);

    if (story.length < MIN_STORY_CHARS) {
      res.status(400).json({
        success: false,
        error: `Tell us a little more about you two — at least ${MIN_STORY_CHARS} characters.`,
      });
      return;
    }

    const result = await generateCaseFromStory({
      story,
      plaintiffName: str(body.plaintiffName, 80),
      accusedName: str(body.accusedName, 80),
    });

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    if (error instanceof AiUnavailableError) {
      // The key is missing/misconfigured. 503 so the client can fall back to the
      // hand-written defaults rather than presenting this as the user's mistake.
      console.error("Court of love AI not configured:", error.message);
      res.status(503).json({
        success: false,
        error: "AI writing isn't available right now. You can still write the hearings yourself.",
      });
      return;
    }

    if (error instanceof AiRefusedError) {
      res.status(422).json({
        success: false,
        error: "The AI couldn't work with that story. Try rephrasing it, or write the hearings yourself.",
      });
      return;
    }

    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        console.error("Court of love AI auth error — check OPENAI_API_KEY");
        res.status(503).json({
          success: false,
          error: "AI writing isn't available right now. You can still write the hearings yourself.",
        });
        return;
      }
      if (error.status === 429) {
        res.status(429).json({
          success: false,
          error: "The AI is busy right now. Please wait a moment and try again.",
        });
        return;
      }
    }

    console.error("Generate court of love content error:", error);
    res.status(500).json({
      success: false,
      error: "Couldn't write the hearings. Please try again.",
    });
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
