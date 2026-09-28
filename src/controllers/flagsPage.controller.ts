import { Request, Response } from "express";
import FlagsPage, {
  CARD_KINDS,
  FLAGS_LIMITS,
  SWIPE_CHOICES,
  type CardKind,
  type IFlagCard,
  type IFlagsSender,
  type SwipeChoice,
} from "../models/FlagsPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import {
  sanitizeLock,
  sanitizeLoveGifs,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  sanitizeTheme,
  userPhotoFolder,
} from "../utils/loveMedia";

/** Mirrors client/app/(templates)/flags/components/themes.ts. */
const FLAGS_THEMES = ["swipe-night", "matcha-cherry", "y2k-bubble", "beige-flag"] as const;

// ── Sanitisers ───────────────────────────────────────────────────────────────
// Every value that reaches the document goes through one of these. The client
// validates the same rules for UX, but the client is not a security boundary:
// the 70-char statement cap and the two enums are re-applied here, and the
// update payload is assembled from an explicit allow-list rather than req.body.

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * The sender's photo arrives either as an already-hosted URL or as an inline
 * `data:` URL straight from the file picker. Base64 must never reach the
 * document: it would bloat the page, count against Mongo's 16MB ceiling, and be
 * re-sent verbatim in every shared-page response. Push it to S3 and keep the
 * link.
 *
 * Failure yields "" rather than a 500 — the photo is optional and the deck
 * falls back to an initial card, so a bad upload must not block publishing.
 */
const resolvePhotoUrl = async (v: unknown, userId?: string): Promise<string> => {
  if (typeof v !== "string" || !v) return "";
  if (!v.startsWith("data:")) return v.slice(0, FLAGS_LIMITS.photoUrl);
  try {
    const uploaded = await uploadImageDataUrl(v, `flags/users/${String(userId || "anonymous")}/sender`);
    return uploaded.url.slice(0, FLAGS_LIMITS.photoUrl);
  } catch (err) {
    console.error("flags: sender photo upload failed", err);
    return "";
  }
};

const clampAge = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return FLAGS_LIMITS.minAge;
  return Math.min(FLAGS_LIMITS.maxAge, Math.max(FLAGS_LIMITS.minAge, Math.round(n)));
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

const sanitizeSender = async (raw: unknown, userId?: string): Promise<IFlagsSender> => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, FLAGS_LIMITS.senderName),
    age: clampAge(s.age),
    photoUrl: await resolvePhotoUrl(s.photoUrl, userId),
    tagline: str(s.tagline, FLAGS_LIMITS.senderTagline),
  };
};

/**
 * A card with no statement renders as a blank white card in the deck, so it is
 * dropped rather than stored — this mirrors `dbToFlagsData` on the client, which
 * returns null for the same case.
 */
const sanitizeCards = (raw: unknown): IFlagCard[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, FLAGS_LIMITS.maxCards)
    .map((c, i): IFlagCard => {
      const src = (c ?? {}) as Record<string, unknown>;
      const r = (src.responses ?? {}) as Record<string, unknown>;
      return {
        id: str(src.id, FLAGS_LIMITS.cardId) || `c${i + 1}`,
        statement: str(src.statement, FLAGS_LIMITS.statement),
        truth: oneOf<SwipeChoice>(src.truth, SWIPE_CHOICES, "red"),
        kind: oneOf<CardKind>(src.kind, CARD_KINDS, "flag"),
        // All three directions always exist. Empty is legal (sincere cards have
        // no comeback); missing is not, because the flip would show nothing.
        responses: {
          red: str(r.red, FLAGS_LIMITS.response),
          green: str(r.green, FLAGS_LIMITS.response),
          complicated: str(r.complicated, FLAGS_LIMITS.response),
        },
      };
    })
    .filter((c) => c.statement.trim().length > 0);
};

/** The explicit allow-list. Nothing outside these keys is ever read. */
type FlagsBody = {
  sender?: unknown;
  recipientName?: unknown;
  cards?: unknown;
  finalCard?: unknown;
  letter?: unknown;
  photos?: unknown;
  gifs?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

// ── Handlers ─────────────────────────────────────────────────────────────────

export const createFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as FlagsBody;

    const page = await FlagsPage.create({
      userId: req.userId,
      sender: await sanitizeSender(b.sender, req.userId),
      recipientName: str(b.recipientName, FLAGS_LIMITS.recipientName),
      cards: sanitizeCards(b.cards),
      finalCard: str(b.finalCard, FLAGS_LIMITS.finalCard),
      letter: sanitizeLoveLetter(b.letter),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("flags", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      theme: sanitizeTheme(b.theme, FLAGS_THEMES),
      ...sanitizeLock(b),
      password: str(b.password, FLAGS_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyFlagsPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await FlagsPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my flags pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await FlagsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as FlagsBody;

    const page = await FlagsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.sender        !== undefined) page.sender        = await sanitizeSender(b.sender, req.userId);
    if (b.recipientName !== undefined) page.recipientName = str(b.recipientName, FLAGS_LIMITS.recipientName);
    if (b.cards         !== undefined) page.cards         = sanitizeCards(b.cards);
    if (b.finalCard     !== undefined) page.finalCard     = str(b.finalCard, FLAGS_LIMITS.finalCard);
    if (b.letter        !== undefined) page.letter        = sanitizeLoveLetter(b.letter);
    if (b.photos        !== undefined) page.photos        = await sanitizeLovePhotos(b.photos, userPhotoFolder("flags", req.userId));
    if (b.gifs          !== undefined) page.gifs          = sanitizeLoveGifs(b.gifs);
    if (b.theme         !== undefined) page.theme         = sanitizeTheme(b.theme, FLAGS_THEMES);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock({ lockQuestion: b.lockQuestion ?? page.lockQuestion, lockAnswer: b.lockAnswer ?? page.lockAnswer });
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined) {
      const next = str(b.password, FLAGS_LIMITS.password);
      if (next !== "") page.password = next;
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await FlagsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "flags",
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
    console.error("Publish flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await FlagsPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "flags" });
  } catch (error) {
    console.error("Get shared flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyFlagsPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await FlagsPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify flags page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteFlagsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await FlagsPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete flags page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
