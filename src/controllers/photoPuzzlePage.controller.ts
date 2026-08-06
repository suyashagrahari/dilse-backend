import { Request, Response } from "express";
import PhotoPuzzlePage, { FinalPieceMode, PUZZLE_LIMITS } from "../models/PhotoPuzzlePage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Every write goes through an explicit allow-list of the eleven content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type PuzzleBody = {
  senderName?: unknown;
  recipientName?: unknown;
  imageUrl?: unknown;
  revealImageUrl?: unknown;
  cols?: unknown;
  rows?: unknown;
  lines?: unknown;
  melody?: unknown;
  finalPieceMode?: unknown;
  finalPieceMessage?: unknown;
  closingLine?: unknown;
  password?: unknown;
};

/**
 * Clamps any requested grid into something playable, mirroring `normaliseGrid`
 * on the client. Sixteen pieces is a hard ceiling: a 24-piece jigsaw on a 380px
 * screen is data entry, not a gift.
 */
const normaliseGrid = (rawCols: unknown, rawRows: unknown): { cols: number; rows: number } => {
  let c = clampNum(rawCols, PUZZLE_LIMITS.defaultCols, PUZZLE_LIMITS.minCols, PUZZLE_LIMITS.maxCols);
  let r = clampNum(rawRows, PUZZLE_LIMITS.defaultRows, PUZZLE_LIMITS.minRows, PUZZLE_LIMITS.maxRows);
  // Shrink the longer axis until we are under the ceiling. Deterministic, and
  // it keeps the aspect roughly intact rather than collapsing to a strip.
  while (c * r > PUZZLE_LIMITS.maxPieces) {
    if (c >= r) c -= 1;
    else r -= 1;
  }
  return { cols: c, rows: r };
};

/** Blank lines would pay a placement with nothing, so they are dropped. */
const sanitizeLines = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, PUZZLE_LIMITS.maxRawItems)) {
    if (out.length >= PUZZLE_LIMITS.maxLines) break;
    const line = str(entry, PUZZLE_LIMITS.line).trim();
    if (!line) continue;
    out.push(line);
  }
  return out;
};

/** Semitone offsets from C4. Anything unparseable becomes the root note. */
const sanitizeMelody = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, PUZZLE_LIMITS.maxMelodyNotes)
    .map((v) => clampNum(v, 0, PUZZLE_LIMITS.semitoneMin, PUZZLE_LIMITS.semitoneMax));
};

/**
 * The photo arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling.
 *
 * An upload failure is logged and yields an empty string rather than a 500: the
 * client falls back to a plain tile, so a bad photo must not block the whole
 * page from being saved.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, PUZZLE_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `photo-puzzle/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, PUZZLE_LIMITS.url);
  } catch (error) {
    console.error("Photo puzzle image upload error:", error);
    return "";
  }
};

export const createPhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as PuzzleBody;
    const grid = normaliseGrid(b.cols, b.rows);

    const page = await PhotoPuzzlePage.create({
      userId: req.userId,
      senderName: str(b.senderName, PUZZLE_LIMITS.name),
      recipientName: str(b.recipientName, PUZZLE_LIMITS.name),
      imageUrl: await resolveImageUrl(b.imageUrl, req.userId, "image"),
      revealImageUrl: await resolveImageUrl(b.revealImageUrl, req.userId, "reveal"),
      cols: grid.cols,
      rows: grid.rows,
      lines: sanitizeLines(b.lines),
      melody: sanitizeMelody(b.melody),
      finalPieceMode: (b.finalPieceMode === "auto" ? "auto" : "sender-release") as FinalPieceMode,
      finalPieceMessage: str(b.finalPieceMessage, PUZZLE_LIMITS.finalPieceMessage),
      closingLine: str(b.closingLine, PUZZLE_LIMITS.closingLine),
      password: str(b.password, PUZZLE_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyPhotoPuzzlePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await PhotoPuzzlePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my photoPuzzle pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getPhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await PhotoPuzzlePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updatePhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as PuzzleBody;

    const page = await PhotoPuzzlePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName        !== undefined) page.senderName        = str(b.senderName, PUZZLE_LIMITS.name);
    if (b.recipientName     !== undefined) page.recipientName     = str(b.recipientName, PUZZLE_LIMITS.name);
    if (b.imageUrl          !== undefined) page.imageUrl          = await resolveImageUrl(b.imageUrl, req.userId, "image");
    if (b.revealImageUrl    !== undefined) page.revealImageUrl    = await resolveImageUrl(b.revealImageUrl, req.userId, "reveal");
    // The grid is normalised as a pair — a lone `cols` still has to be checked
    // against the stored `rows` or the two together can exceed the ceiling.
    if (b.cols !== undefined || b.rows !== undefined) {
      const grid = normaliseGrid(
        b.cols !== undefined ? b.cols : page.cols,
        b.rows !== undefined ? b.rows : page.rows
      );
      page.cols = grid.cols;
      page.rows = grid.rows;
    }
    if (b.lines             !== undefined) page.lines             = sanitizeLines(b.lines);
    if (b.melody            !== undefined) page.melody            = sanitizeMelody(b.melody);
    if (b.finalPieceMode    !== undefined) page.finalPieceMode    = b.finalPieceMode === "auto" ? "auto" : "sender-release";
    if (b.finalPieceMessage !== undefined) page.finalPieceMessage = str(b.finalPieceMessage, PUZZLE_LIMITS.finalPieceMessage);
    if (b.closingLine       !== undefined) page.closingLine       = str(b.closingLine, PUZZLE_LIMITS.closingLine);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, PUZZLE_LIMITS.password) !== "") {
      page.password = str(b.password, PUZZLE_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishPhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await PhotoPuzzlePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "photo-puzzle",
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
    console.error("Publish photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedPhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await PhotoPuzzlePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "photo-puzzle" });
  } catch (error) {
    console.error("Get shared photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyPhotoPuzzlePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await PhotoPuzzlePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify photoPuzzle page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deletePhotoPuzzlePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await PhotoPuzzlePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete photoPuzzle page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
