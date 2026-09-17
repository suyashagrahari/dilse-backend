import { Request, Response } from "express";
import LoveflixPage, {
  ICredit,
  IRow,
  IRowItem,
  IScene,
  LOVEFLIX_LIMITS,
} from "../models/LoveflixPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Every write goes through an explicit allow-list of the seventeen content
 * fields. `req.body` is never spread into the document, so a caller cannot
 * smuggle in `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type LoveflixBody = {
  senderName?: unknown;
  senderPhotoUrl?: unknown;
  recipientName?: unknown;
  recipientPhotoUrl?: unknown;
  showTitle?: unknown;
  tagline?: unknown;
  heroImageUrl?: unknown;
  matchPercent?: unknown;
  rating?: unknown;
  seasons?: unknown;
  metYear?: unknown;
  rows?: unknown;
  scenes?: unknown;
  startSceneId?: unknown;
  finaleText?: unknown;
  finaleQuestion?: unknown;
  credits?: unknown;
  password?: unknown;
};

/**
 * Artwork arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and this template has one image per card.
 *
 * An upload failure is logged and yields an empty string rather than a 500:
 * every image in this template has a text fallback, so a bad file must not
 * block the whole page from being saved.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, LOVEFLIX_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `loveflix/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, LOVEFLIX_LIMITS.url);
  } catch (error) {
    console.error("Loveflix image upload error:", error);
    return "";
  }
};

/** A card with no title is an unlabelled rectangle, so it is dropped. */
const sanitizeRowItems = async (raw: unknown, userId: unknown): Promise<IRowItem[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IRowItem[] = [];
  for (const entry of raw.slice(0, LOVEFLIX_LIMITS.maxRawItems)) {
    if (out.length >= LOVEFLIX_LIMITS.maxRowItems) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const title = str(src.title, LOVEFLIX_LIMITS.itemTitle).trim();
    if (!title) continue;
    out.push({
      title,
      imageUrl: await resolveImageUrl(src.imageUrl, userId, "rows"),
      caption: str(src.caption, LOVEFLIX_LIMITS.caption),
      runtime: str(src.runtime, LOVEFLIX_LIMITS.runtime),
      progress: clampNum(src.progress, 0, LOVEFLIX_LIMITS.progressMin, LOVEFLIX_LIMITS.progressMax),
    });
  }
  return out;
};

/** A row with no title has no header to sit under, so it is dropped. */
const sanitizeRows = async (raw: unknown, userId: unknown): Promise<IRow[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IRow[] = [];
  for (const entry of raw.slice(0, LOVEFLIX_LIMITS.maxRawItems)) {
    if (out.length >= LOVEFLIX_LIMITS.maxRows) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const title = str(src.title, LOVEFLIX_LIMITS.rowTitle).trim();
    if (!title) continue;
    out.push({
      title,
      kind: src.kind === "top10" ? "top10" : "cards",
      items: await sanitizeRowItems(src.items, userId),
    });
  }
  return out;
};

/**
 * A choice needs both a label and a destination — half a choice renders as a
 * button that goes nowhere, which is the one failure mode the scene-graph
 * validator on the client exists to catch.
 */
const sanitizeChoices = (raw: unknown): { label: string; nextSceneId: string }[] => {
  if (!Array.isArray(raw)) return [];
  const out: { label: string; nextSceneId: string }[] = [];
  for (const entry of raw.slice(0, LOVEFLIX_LIMITS.maxRawItems)) {
    if (out.length >= LOVEFLIX_LIMITS.maxChoices) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const label = str(src.label, LOVEFLIX_LIMITS.choiceLabel).trim();
    const nextSceneId = str(src.nextSceneId, LOVEFLIX_LIMITS.sceneId).trim();
    if (!label || !nextSceneId) continue;
    out.push({ label, nextSceneId });
  }
  return out;
};

/**
 * Scene ids have to be unique: every choice resolves its destination by id, so
 * a duplicate would make the graph ambiguous. Blank or repeated ids are
 * replaced with a positional fallback.
 */
const uniqueSceneId = (raw: unknown, used: Set<string>, index: number): string => {
  const candidate = str(raw, LOVEFLIX_LIMITS.sceneId).trim();
  const id = candidate && !used.has(candidate) ? candidate : `s${index + 1}`;
  let final = id;
  let n = index + 1;
  while (used.has(final)) final = `s${++n}`;
  used.add(final);
  return final;
};

const sanitizeScenes = async (raw: unknown, userId: unknown): Promise<IScene[]> => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IScene[] = [];
  for (const entry of raw.slice(0, LOVEFLIX_LIMITS.maxRawItems)) {
    if (out.length >= LOVEFLIX_LIMITS.maxScenes) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    // A scene with no id cannot be pointed at, so there is nothing to keep.
    if (str(src.id, LOVEFLIX_LIMITS.sceneId).trim() === "") continue;
    const isFinale = src.isFinale === true;
    out.push({
      id: uniqueSceneId(src.id, used, out.length),
      imageUrl: await resolveImageUrl(src.imageUrl, userId, "scenes"),
      text: str(src.text, LOVEFLIX_LIMITS.sceneText),
      // A finale is terminal by definition; its choices would never render.
      choices: isFinale ? [] : sanitizeChoices(src.choices),
      choiceSeconds: clampNum(
        src.choiceSeconds,
        LOVEFLIX_LIMITS.choiceSecondsDefault,
        LOVEFLIX_LIMITS.choiceSecondsMin,
        LOVEFLIX_LIMITS.choiceSecondsMax
      ),
      defaultChoiceIndex: clampNum(
        src.defaultChoiceIndex,
        LOVEFLIX_LIMITS.defaultChoiceIndexMin,
        LOVEFLIX_LIMITS.defaultChoiceIndexMin,
        LOVEFLIX_LIMITS.defaultChoiceIndexMax
      ),
      isFinale,
    });
  }
  return out;
};

/** A credit with no role is a floating name, so it is dropped. */
const sanitizeCredits = (raw: unknown): ICredit[] => {
  if (!Array.isArray(raw)) return [];
  const out: ICredit[] = [];
  for (const entry of raw.slice(0, LOVEFLIX_LIMITS.maxRawItems)) {
    if (out.length >= LOVEFLIX_LIMITS.maxCredits) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const role = str(src.role, LOVEFLIX_LIMITS.creditRole).trim();
    if (!role) continue;
    out.push({ role, name: str(src.name, LOVEFLIX_LIMITS.creditName) });
  }
  return out;
};

export const createLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as LoveflixBody;
    const scenes = await sanitizeScenes(b.scenes, req.userId);

    const page = await LoveflixPage.create({
      userId: req.userId,
      senderName: str(b.senderName, LOVEFLIX_LIMITS.name),
      senderPhotoUrl: await resolveImageUrl(b.senderPhotoUrl, req.userId, "sender"),
      recipientName: str(b.recipientName, LOVEFLIX_LIMITS.name),
      recipientPhotoUrl: await resolveImageUrl(b.recipientPhotoUrl, req.userId, "recipient"),
      showTitle: str(b.showTitle, LOVEFLIX_LIMITS.showTitle),
      tagline: str(b.tagline, LOVEFLIX_LIMITS.tagline),
      heroImageUrl: await resolveImageUrl(b.heroImageUrl, req.userId, "hero"),
      matchPercent: clampNum(
        b.matchPercent,
        LOVEFLIX_LIMITS.matchPercentDefault,
        LOVEFLIX_LIMITS.matchPercentMin,
        LOVEFLIX_LIMITS.matchPercentMax
      ),
      rating: str(b.rating, LOVEFLIX_LIMITS.rating),
      seasons: str(b.seasons, LOVEFLIX_LIMITS.seasons),
      metYear: str(b.metYear, LOVEFLIX_LIMITS.metYear),
      rows: await sanitizeRows(b.rows, req.userId),
      scenes,
      // Falling back to the first scene keeps the episode playable even if the
      // editor sent a start id that no longer exists.
      startSceneId: str(b.startSceneId, LOVEFLIX_LIMITS.sceneId) || (scenes[0]?.id ?? ""),
      finaleText: str(b.finaleText, LOVEFLIX_LIMITS.finaleText),
      finaleQuestion: str(b.finaleQuestion, LOVEFLIX_LIMITS.finaleQuestion),
      credits: sanitizeCredits(b.credits),
      password: str(b.password, LOVEFLIX_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyLoveflixPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await LoveflixPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my loveflix pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveflixPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as LoveflixBody;

    const page = await LoveflixPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName        !== undefined) page.senderName        = str(b.senderName, LOVEFLIX_LIMITS.name);
    if (b.senderPhotoUrl    !== undefined) page.senderPhotoUrl    = await resolveImageUrl(b.senderPhotoUrl, req.userId, "sender");
    if (b.recipientName     !== undefined) page.recipientName     = str(b.recipientName, LOVEFLIX_LIMITS.name);
    if (b.recipientPhotoUrl !== undefined) page.recipientPhotoUrl = await resolveImageUrl(b.recipientPhotoUrl, req.userId, "recipient");
    if (b.showTitle         !== undefined) page.showTitle         = str(b.showTitle, LOVEFLIX_LIMITS.showTitle);
    if (b.tagline           !== undefined) page.tagline           = str(b.tagline, LOVEFLIX_LIMITS.tagline);
    if (b.heroImageUrl      !== undefined) page.heroImageUrl      = await resolveImageUrl(b.heroImageUrl, req.userId, "hero");
    if (b.matchPercent      !== undefined) page.matchPercent      = clampNum(
      b.matchPercent,
      LOVEFLIX_LIMITS.matchPercentDefault,
      LOVEFLIX_LIMITS.matchPercentMin,
      LOVEFLIX_LIMITS.matchPercentMax
    );
    if (b.rating            !== undefined) page.rating            = str(b.rating, LOVEFLIX_LIMITS.rating);
    if (b.seasons           !== undefined) page.seasons           = str(b.seasons, LOVEFLIX_LIMITS.seasons);
    if (b.metYear           !== undefined) page.metYear           = str(b.metYear, LOVEFLIX_LIMITS.metYear);
    if (b.rows              !== undefined) page.rows              = await sanitizeRows(b.rows, req.userId);
    if (b.scenes            !== undefined) page.scenes            = await sanitizeScenes(b.scenes, req.userId);
    if (b.startSceneId      !== undefined) page.startSceneId      = str(b.startSceneId, LOVEFLIX_LIMITS.sceneId);
    if (b.finaleText        !== undefined) page.finaleText        = str(b.finaleText, LOVEFLIX_LIMITS.finaleText);
    if (b.finaleQuestion    !== undefined) page.finaleQuestion    = str(b.finaleQuestion, LOVEFLIX_LIMITS.finaleQuestion);
    if (b.credits           !== undefined) page.credits           = sanitizeCredits(b.credits);
    // A start id that no longer resolves would render a blank player, so it is
    // repaired against the scene list that actually ended up stored.
    if (page.scenes.length > 0 && !page.scenes.some((s) => s.id === page.startSceneId)) {
      page.startSceneId = page.scenes[0].id;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, LOVEFLIX_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, LOVEFLIX_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveflixPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "loveflix",
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
    console.error("Publish loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveflixPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "loveflix" });
  } catch (error) {
    console.error("Get shared loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyLoveflixPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await LoveflixPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify loveflix page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteLoveflixPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LoveflixPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete loveflix page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
