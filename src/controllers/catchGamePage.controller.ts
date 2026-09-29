import { Request, Response } from "express";
import CatchPage, { CATCH_LIMITS, IBadItem, IGoodItem } from "../models/CatchPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { httpsUrl, sanitizeLock, sanitizeLoveLetter, sanitizeLovePhotos, userPhotoFolder } from "../utils/loveMedia";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Every write goes through an explicit allow-list of the content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type CatchBody = {
  recipientName?: unknown;
  senderName?: unknown;
  faceUrl?: unknown;
  goodItems?: unknown;
  badItems?: unknown;
  closingLine?: unknown;
  durationMs?: unknown;
  faceCropX?: unknown;
  faceCropY?: unknown;
  faceScale?: unknown;
  tagline?: unknown;
  photos?: unknown;
  letter?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

/** A crop number clamped into range; anything unreadable is the default. */
const cropNum = (raw: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
};

/**
 * Ids have to be unique: the client reports which lines never arrived by id, so
 * a duplicate would make a missed line indistinguishable from a caught one.
 * Blank or repeated ids are replaced with a positional fallback.
 */
const uniqueId = (raw: unknown, used: Set<string>, prefix: string, index: number): string => {
  const candidate = str(raw, CATCH_LIMITS.itemId).trim();
  const id = candidate && !used.has(candidate) ? candidate : `${prefix}${index + 1}`;
  // Even the fallback can collide if the caller sent literal "g1" out of order.
  let final = id;
  let n = index + 1;
  while (used.has(final)) final = `${prefix}${++n}`;
  used.add(final);
  return final;
};

/**
 * A good item exists to deliver one line. One with no line would spawn as a
 * catchable object that hands over nothing, so it is dropped — the same rule
 * `dbToCatchData` applies on the client.
 */
const sanitizeGoodItems = (raw: unknown): IGoodItem[] => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IGoodItem[] = [];
  for (const entry of raw.slice(0, CATCH_LIMITS.maxRawItems)) {
    if (out.length >= CATCH_LIMITS.maxGoodItems) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const line = str(src.line, CATCH_LIMITS.itemLine).trim();
    if (!line) continue;
    out.push({
      id: uniqueId(src.id, used, "g", out.length),
      emoji: str(src.emoji, CATCH_LIMITS.emoji) || "💛",
      label: str(src.label, CATCH_LIMITS.itemLabel),
      line,
    });
  }
  return out;
};

/** A hazard with neither an emoji nor a label would fall as an invisible blank. */
const sanitizeBadItems = (raw: unknown): IBadItem[] => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IBadItem[] = [];
  for (const entry of raw.slice(0, CATCH_LIMITS.maxRawItems)) {
    if (out.length >= CATCH_LIMITS.maxBadItems) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const emoji = str(src.emoji, CATCH_LIMITS.emoji).trim();
    const label = str(src.label, CATCH_LIMITS.itemLabel).trim();
    if (!emoji && !label) continue;
    out.push({
      id: uniqueId(src.id, used, "b", out.length),
      emoji: emoji || "🚩",
      label,
    });
  }
  return out;
};

/** Clamped here as well as on the client — the client is not a security boundary. */
const clampDuration = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return CATCH_LIMITS.durationDefaultMs;
  return Math.min(
    CATCH_LIMITS.durationMaxMs,
    Math.max(CATCH_LIMITS.durationMinMs, Math.round(n))
  );
};

/**
 * The paddle photo arrives either as an ordinary URL or as an inline base64 data
 * URL straight out of the EditSheet file picker. A data URL is uploaded to S3 and
 * only the resulting link is stored — persisting the base64 would bloat the
 * document toward Mongo's 16MB ceiling.
 *
 * An upload failure is logged and yields an empty string rather than a 500: the
 * face is optional by design (the client falls back to an initial), so a bad
 * photo must not block the whole page from being saved.
 */
const resolveFaceUrl = async (raw: unknown, userId: unknown): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return httpsUrl(value).slice(0, CATCH_LIMITS.faceUrl);
  try {
    const uploaded = await uploadImageDataUrl(value, `catch/users/${String(userId || "anonymous")}/face`);
    return uploaded.url.slice(0, CATCH_LIMITS.faceUrl);
  } catch (error) {
    console.error("Catch face upload error:", error);
    return "";
  }
};

export const createCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CatchBody;

    const page = await CatchPage.create({
      userId: req.userId,
      recipientName: str(b.recipientName, CATCH_LIMITS.name),
      senderName: str(b.senderName, CATCH_LIMITS.name),
      faceUrl: await resolveFaceUrl(b.faceUrl, req.userId),
      goodItems: sanitizeGoodItems(b.goodItems),
      badItems: sanitizeBadItems(b.badItems),
      closingLine: str(b.closingLine, CATCH_LIMITS.closingLine),
      durationMs: clampDuration(b.durationMs),
      faceCropX: cropNum(b.faceCropX, 0, 100, 50),
      faceCropY: cropNum(b.faceCropY, 0, 100, 50),
      faceScale: cropNum(b.faceScale, 100, 300, 100),
      tagline: str(b.tagline, CATCH_LIMITS.tagline),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("catch", req.userId)),
      letter: sanitizeLoveLetter(b.letter),
      ...sanitizeLock(b),
      password: str(b.password, CATCH_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyCatchPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CatchPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my catchGame pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CatchBody;

    const page = await CatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.recipientName !== undefined) page.recipientName = str(b.recipientName, CATCH_LIMITS.name);
    if (b.senderName    !== undefined) page.senderName    = str(b.senderName, CATCH_LIMITS.name);
    if (b.faceUrl       !== undefined) page.faceUrl       = await resolveFaceUrl(b.faceUrl, req.userId);
    if (b.goodItems     !== undefined) page.goodItems     = sanitizeGoodItems(b.goodItems);
    if (b.badItems      !== undefined) page.badItems      = sanitizeBadItems(b.badItems);
    if (b.closingLine   !== undefined) page.closingLine   = str(b.closingLine, CATCH_LIMITS.closingLine);
    if (b.durationMs    !== undefined) page.durationMs    = clampDuration(b.durationMs);
    if (b.faceCropX     !== undefined) page.faceCropX     = cropNum(b.faceCropX, 0, 100, 50);
    if (b.faceCropY     !== undefined) page.faceCropY     = cropNum(b.faceCropY, 0, 100, 50);
    if (b.faceScale     !== undefined) page.faceScale     = cropNum(b.faceScale, 100, 300, 100);
    if (b.tagline       !== undefined) page.tagline       = str(b.tagline, CATCH_LIMITS.tagline);
    if (b.photos        !== undefined) page.photos        = await sanitizeLovePhotos(b.photos, userPhotoFolder("catch", req.userId));
    if (b.letter        !== undefined) page.letter        = sanitizeLoveLetter(b.letter);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, CATCH_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, CATCH_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "catch",
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
    console.error("Publish catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CatchPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "catch" });
  } catch (error) {
    console.error("Get shared catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyCatchPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await CatchPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify catchGame page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteCatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CatchPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete catchGame page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
