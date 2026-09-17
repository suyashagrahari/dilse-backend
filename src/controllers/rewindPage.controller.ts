import { Request, Response } from "express";
import RewindPage, { IStat, REWIND_LIMITS } from "../models/RewindPage";
import { uploadAudioDataUrl, uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Every write goes through an explicit allow-list of the thirteen content
 * fields. `req.body` is never spread into the document, so a caller cannot
 * smuggle in `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: `daysTogether`, `hours`, `winters`. Every time-shaped
 * number on screen is derived on the client from `startDate` alone, so there is
 * nothing here for a caller to lie about.
 */
type RewindBody = {
  senderName?: unknown;
  senderPhotoUrl?: unknown;
  recipientName?: unknown;
  recipientPhotoUrl?: unknown;
  startDate?: unknown;
  songTitle?: unknown;
  songArtist?: unknown;
  audioUrl?: unknown;
  topReasons?: unknown;
  stats?: unknown;
  answers?: unknown;
  photos?: unknown;
  closingLine?: unknown;
  password?: unknown;
};

/**
 * Media arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling.
 *
 * An upload failure is logged and yields an empty string rather than a 500:
 * every media slot in this template is optional, so a bad file must not block
 * the whole page from being saved.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, REWIND_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `rewind/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, REWIND_LIMITS.url);
  } catch (error) {
    console.error("Rewind image upload error:", error);
    return "";
  }
};

/** "" skips the song slide entirely rather than rendering a dead player. */
const resolveAudioUrl = async (raw: unknown, userId: unknown): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, REWIND_LIMITS.url);
  try {
    const uploaded = await uploadAudioDataUrl(
      value,
      `rewind/users/${String(userId || "anonymous")}/audio`
    );
    return uploaded.url.slice(0, REWIND_LIMITS.url);
  } catch (error) {
    console.error("Rewind audio upload error:", error);
    return "";
  }
};

const resolvePhotos = async (raw: unknown, userId: unknown): Promise<string[]> => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, REWIND_LIMITS.maxPhotos)) {
    const url = await resolveImageUrl(entry, userId, "photos");
    if (url) out.push(url);
  }
  return out;
};

/** The ranked list. Blank entries would render as numbered empty rows. */
const sanitizeTopReasons = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, REWIND_LIMITS.maxRawItems)) {
    if (out.length >= REWIND_LIMITS.maxTopReasons) break;
    const reason = str(entry, REWIND_LIMITS.reason).trim();
    if (!reason) continue;
    out.push(reason);
  }
  return out;
};

/**
 * Sender-authored joke stats. One with neither a value nor a label is an empty
 * slide, so it is dropped — the same rule `dbToRewindData` applies on the
 * client.
 */
const sanitizeStats = (raw: unknown): IStat[] => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IStat[] = [];
  for (const entry of raw.slice(0, REWIND_LIMITS.maxRawItems)) {
    if (out.length >= REWIND_LIMITS.maxStats) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const label = str(src.label, REWIND_LIMITS.statLabel).trim();
    const value = str(src.value, REWIND_LIMITS.statValue).trim();
    if (!label && !value) continue;
    // Keys are how the client tracks a slide across a re-render, so a duplicate
    // would make two slides indistinguishable.
    const candidate = str(src.key, REWIND_LIMITS.statKey).trim();
    let key = candidate && !used.has(candidate) ? candidate : `s${out.length + 1}`;
    let n = out.length + 1;
    while (used.has(key)) key = `s${++n}`;
    used.add(key);
    out.push({ key, label, value, sub: str(src.sub, REWIND_LIMITS.statSub) });
  }
  return out;
};

/**
 * Free-form, keyed by question id — the key set is owned by the client's
 * QUESTIONS table, not by this controller, so the keys are accepted as-is and
 * only length-capped. Stored as a Map because the schema cannot enumerate them.
 */
const sanitizeAnswers = (raw: unknown): Map<string, string> => {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (out.size >= REWIND_LIMITS.maxAnswers) break;
    const key = str(k, REWIND_LIMITS.answerKey).trim();
    const value = str(v, REWIND_LIMITS.answerValue).trim();
    if (!key || !value) continue;
    out.set(key, value);
  }
  return out;
};

/**
 * `JSON.stringify` of a Map is `{}`, so a document that has already been run
 * through `toObject()` has to have its answers flattened by hand or the client
 * coercer sees nothing and silently falls back to the demo answers.
 */
const flattenAnswers = (answers: Map<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(answers ?? new Map<string, string>());

export const createRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as RewindBody;

    const page = await RewindPage.create({
      userId: req.userId,
      senderName: str(b.senderName, REWIND_LIMITS.name),
      senderPhotoUrl: await resolveImageUrl(b.senderPhotoUrl, req.userId, "sender"),
      recipientName: str(b.recipientName, REWIND_LIMITS.name),
      recipientPhotoUrl: await resolveImageUrl(b.recipientPhotoUrl, req.userId, "recipient"),
      startDate: str(b.startDate, REWIND_LIMITS.startDate),
      songTitle: str(b.songTitle, REWIND_LIMITS.songTitle),
      songArtist: str(b.songArtist, REWIND_LIMITS.songArtist),
      audioUrl: await resolveAudioUrl(b.audioUrl, req.userId),
      topReasons: sanitizeTopReasons(b.topReasons),
      stats: sanitizeStats(b.stats),
      answers: sanitizeAnswers(b.answers),
      photos: await resolvePhotos(b.photos, req.userId),
      closingLine: str(b.closingLine, REWIND_LIMITS.closingLine),
      password: str(b.password, REWIND_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyRewindPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await RewindPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my rewind pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RewindPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;
    pageObj.answers = flattenAnswers(page.answers);

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as RewindBody;

    const page = await RewindPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName        !== undefined) page.senderName        = str(b.senderName, REWIND_LIMITS.name);
    if (b.senderPhotoUrl    !== undefined) page.senderPhotoUrl    = await resolveImageUrl(b.senderPhotoUrl, req.userId, "sender");
    if (b.recipientName     !== undefined) page.recipientName     = str(b.recipientName, REWIND_LIMITS.name);
    if (b.recipientPhotoUrl !== undefined) page.recipientPhotoUrl = await resolveImageUrl(b.recipientPhotoUrl, req.userId, "recipient");
    if (b.startDate         !== undefined) page.startDate         = str(b.startDate, REWIND_LIMITS.startDate);
    if (b.songTitle         !== undefined) page.songTitle         = str(b.songTitle, REWIND_LIMITS.songTitle);
    if (b.songArtist        !== undefined) page.songArtist        = str(b.songArtist, REWIND_LIMITS.songArtist);
    if (b.audioUrl          !== undefined) page.audioUrl          = await resolveAudioUrl(b.audioUrl, req.userId);
    if (b.topReasons        !== undefined) page.topReasons        = sanitizeTopReasons(b.topReasons);
    if (b.stats             !== undefined) page.stats             = sanitizeStats(b.stats);
    if (b.answers           !== undefined) page.answers           = sanitizeAnswers(b.answers);
    if (b.photos            !== undefined) page.photos            = await resolvePhotos(b.photos, req.userId);
    if (b.closingLine       !== undefined) page.closingLine       = str(b.closingLine, REWIND_LIMITS.closingLine);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, REWIND_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, REWIND_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RewindPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "rewind",
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
    console.error("Publish rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RewindPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    safeData.answers = flattenAnswers(page.answers);
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "rewind" });
  } catch (error) {
    console.error("Get shared rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyRewindPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await RewindPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify rewind page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteRewindPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RewindPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete rewind page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
