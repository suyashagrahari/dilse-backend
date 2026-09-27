import { Request, Response } from "express";
import KundliMilanPage, {
  ICustomReadings,
  IKundliPhoto,
  IPerson,
  KOOTA_NAMES,
  KUNDLI_LIMITS,
} from "../models/KundliMilanPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { sanitizeTheme } from "../utils/loveMedia";

/** Mirrors client/app/(templates)/kundli-milan/components/themes.ts. */
const KUNDLI_THEMES = ["cosmic", "golden", "mehendi", "bubblegum"] as const;

/** The client renders at most four upayas; anything beyond that is dropped. */
const MAX_REMEDIES = 4;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Birth dates/times stay strings end to end. Only the *shape* is enforced here —
 * a malformed value is kept verbatim rather than coerced, because the client's
 * engine already falls back to noon for an unparseable `tob` and the report must
 * stay deterministic for whatever the sender actually typed.
 */
const sanitizePerson = (raw: unknown): IPerson => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, 80),
    dob: str(src.dob, 24),
    tob: str(src.tob, 8),
    pob: str(src.pob, 120),
  };
};

/**
 * Only the eight known koota keys survive. An unknown key in the payload would
 * otherwise become a stray path on the sub-document.
 */
const sanitizeCustomReadings = (raw: unknown): ICustomReadings => {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: ICustomReadings = {};
  for (const k of KOOTA_NAMES) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 240);
  }
  return out;
};

const sanitizeRemedies = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => str(r, 200).trim())
    .filter((r) => r.length > 0)
    .slice(0, MAX_REMEDIES);
};

const httpsUrl = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().slice(0, KUNDLI_LIMITS.url) : "";
  return /^https:\/\/\S+$/i.test(s) ? s : "";
};

const clampNum = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/**
 * Photos arrive as compressed data URLs straight from the editor (uploaded to
 * S3 here, only the link is stored) or as links already uploaded. A failed
 * upload drops that one photo rather than failing the save.
 */
const sanitizePhotos = async (raw: unknown, userId: unknown): Promise<IKundliPhoto[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IKundliPhoto[] = [];
  for (const item of raw.slice(0, 40)) {
    if (out.length >= KUNDLI_LIMITS.maxPhotos) break;
    const src = (item ?? {}) as Record<string, unknown>;
    let url = typeof src.url === "string" ? src.url.trim() : "";
    if (url.startsWith("data:")) {
      try {
        url = (await uploadImageDataUrl(url, `kundli-milan/users/${String(userId || "anonymous")}/photos`)).url;
      } catch (error) {
        console.error("Kundli photo upload error:", error);
        continue;
      }
    } else {
      url = httpsUrl(url);
    }
    if (!url) continue;
    const photo: IKundliPhoto = { url };
    const caption = str(src.caption, KUNDLI_LIMITS.photoCaption).trim();
    if (caption) photo.caption = caption;
    const note = str(src.note, KUNDLI_LIMITS.photoNote).trim();
    if (note) photo.note = note;
    const cropX = clampNum(src.cropX, 0, 100);
    const cropY = clampNum(src.cropY, 0, 100);
    const scale = clampNum(src.scale, 100, 300);
    if (cropX !== undefined) photo.cropX = cropX;
    if (cropY !== undefined) photo.cropY = cropY;
    if (scale !== undefined) photo.scale = scale;
    out.push(photo);
  }
  return out;
};

/** https links only, deduplicated, at most three. */
const sanitizeGifs = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const g of raw.slice(0, 20)) {
    const url = httpsUrl(g);
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= KUNDLI_LIMITS.maxGifs) break;
  }
  return out;
};

/**
 * The explicit allow-list. Nothing outside these keys is ever read off
 * `req.body`, so `isPublished`, `viewCount`, `userId`, `shareId` and
 * `passwordRaw` cannot be mass-assigned.
 */
type KundliMilanBody = {
  groom?: unknown;
  bride?: unknown;
  issuedOn?: unknown;
  customReadings?: unknown;
  remedies?: unknown;
  astrologerName?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  password?: unknown;
};

export const createKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as KundliMilanBody;

    const page = await KundliMilanPage.create({
      userId: req.userId,
      groom: sanitizePerson(b.groom),
      bride: sanitizePerson(b.bride),
      issuedOn: str(b.issuedOn, 24),
      customReadings: sanitizeCustomReadings(b.customReadings),
      remedies: sanitizeRemedies(b.remedies),
      astrologerName: str(b.astrologerName, 80),
      photos: await sanitizePhotos(b.photos, req.userId),
      gifs: sanitizeGifs(b.gifs),
      letter: str(b.letter, KUNDLI_LIMITS.letter),
      theme: sanitizeTheme(b.theme, KUNDLI_THEMES),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyKundliMilanPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await KundliMilanPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my kundliMilan pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await KundliMilanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as KundliMilanBody;

    const page = await KundliMilanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.groom          !== undefined) page.groom          = sanitizePerson(b.groom);
    if (b.bride          !== undefined) page.bride          = sanitizePerson(b.bride);
    if (b.issuedOn       !== undefined) page.issuedOn       = str(b.issuedOn, 24);
    if (b.customReadings !== undefined) page.customReadings = sanitizeCustomReadings(b.customReadings);
    if (b.remedies       !== undefined) page.remedies       = sanitizeRemedies(b.remedies);
    if (b.astrologerName !== undefined) page.astrologerName = str(b.astrologerName, 80);
    if (b.photos         !== undefined) page.photos         = await sanitizePhotos(b.photos, req.userId);
    if (b.gifs           !== undefined) page.gifs           = sanitizeGifs(b.gifs);
    if (b.letter         !== undefined) page.letter         = str(b.letter, KUNDLI_LIMITS.letter);
    if (b.theme          !== undefined) page.theme          = sanitizeTheme(b.theme, KUNDLI_THEMES);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await KundliMilanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "kundli-milan",
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
    console.error("Publish kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await KundliMilanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "kundli-milan" });
  } catch (error) {
    console.error("Get shared kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyKundliMilanPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await KundliMilanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify kundliMilan page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteKundliMilanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await KundliMilanPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete kundliMilan page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
