import { Request, Response } from "express";
import AppPage, {
  APP_LIMITS,
  AppReviewStatus,
  AppStarRating,
  IAppDescription,
  IAppInfoRow,
  IAppMeta,
  IAppRating,
  IAppReview,
  IAppScreenshot,
  IAppVersion,
  IAppWhatsNew,
} from "../models/AppPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";

/**
 * NOTHING IN THIS FILE PARSES `meta.size`, `meta.price` OR `rating.count`.
 * They go through `str()` and only `str()` — the canonical values are
 * "1 human", "Free (emotionally expensive)" and "8,472", and a Number() on any
 * of those paths renders "NaN" on the header block. `rating.average`,
 * `rating.distribution` and `stars` are the only numbers here, and they are all
 * genuinely numbers.
 */

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** A non-negative integer. Guards every rendered count against floats and negatives. */
const count = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

/** Clamps to 1…5 and rounds, because the histogram buckets on this. */
const starsOf = (v: unknown): AppStarRating =>
  Math.round(
    clampNum(v, APP_LIMITS.starsDefault, APP_LIMITS.starsMin, APP_LIMITS.starsMax)
  ) as AppStarRating;

/**
 * A review the sender has not explicitly marked as published stays pending.
 * The review box on the shared page is open to anybody holding the write link,
 * so an unknown status must never default its way onto the recipient's page.
 */
const statusOf = (v: unknown): AppReviewStatus => (v === "published" ? "published" : "pending");

/**
 * Artwork arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded and only the resulting
 * link is stored — persisting base64 would push the document toward Mongo's 16MB
 * ceiling, and this template carries an icon plus a screenshot rail.
 *
 * Anything that is neither http(s) nor a data URL — `javascript:` most of all —
 * becomes the empty string, which the renderer draws as its text fallback. An
 * upload failure is logged and yields an empty string rather than a 500: every
 * image here has a fallback, so one bad file must not block the save.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.slice(0, APP_LIMITS.url);
  if (!/^data:image\//i.test(value)) return "";
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `app/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, APP_LIMITS.url);
  } catch (error) {
    console.error("App page image upload error:", error);
    return "";
  }
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asArray = (v: unknown): unknown[] =>
  Array.isArray(v) ? v.slice(0, APP_LIMITS.maxRawItems) : [];

const lines = (raw: unknown, max: number, cap: number): string[] =>
  asArray(raw)
    .map((l) => str(l, cap))
    .filter(Boolean)
    .slice(0, max);

/**
 * Every write goes through an explicit allow-list of the eleven content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `contribToken`, `viewCount` or
 * `passwordRaw`.
 */
type AppBody = {
  meta?: unknown;
  rating?: unknown;
  screenshots?: unknown;
  description?: unknown;
  whatsNew?: unknown;
  versionHistory?: unknown;
  info?: unknown;
  reviews?: unknown;
  contributorPrompt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
};

const sanitizeMeta = async (raw: unknown, userId: unknown): Promise<IAppMeta> => {
  const src = asRecord(raw);
  return {
    name: str(src.name, APP_LIMITS.name),
    subtitle: str(src.subtitle, APP_LIMITS.subtitle),
    iconUrl: await resolveImageUrl(src.iconUrl, userId, "icon"),
    developer: str(src.developer, APP_LIMITS.developer),
    ageRating: str(src.ageRating, APP_LIMITS.ageRating),
    category: str(src.category, APP_LIMITS.category),
    // str() keeps the string a string. "1 human" survives.
    size: str(src.size, APP_LIMITS.size),
    languages: str(src.languages, APP_LIMITS.languages),
    // str() likewise. "Free (emotionally expensive)" survives.
    price: str(src.price, APP_LIMITS.price),
  };
};

/**
 * The histogram is always exactly five buckets. A short array leaves holes in
 * the bar chart and a long one silently drops rows, so it is normalised here
 * rather than defended against in every renderer downstream.
 */
const sanitizeRating = (raw: unknown): IAppRating => {
  const src = asRecord(raw);
  const incoming = asArray(src.distribution).slice(0, APP_LIMITS.distributionBuckets);
  const distribution: number[] = [];
  for (let i = 0; i < APP_LIMITS.distributionBuckets; i += 1) {
    distribution.push(count(incoming[i]));
  }
  return {
    average: clampNum(src.average, APP_LIMITS.averageMin, APP_LIMITS.averageMin, APP_LIMITS.averageMax),
    // String. "8,472" is a label, not a quantity.
    count: str(src.count, APP_LIMITS.ratingCount),
    distribution,
  };
};

/** A screenshot with neither artwork nor a caption is an empty grey rectangle. */
const sanitizeScreenshots = async (raw: unknown, userId: unknown): Promise<IAppScreenshot[]> => {
  const out: IAppScreenshot[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= APP_LIMITS.maxScreenshots) break;
    const src = asRecord(entry);
    const caption = str(src.caption, APP_LIMITS.caption);
    const imageUrl = await resolveImageUrl(src.imageUrl, userId, `shot-${out.length}`);
    if (!caption && !imageUrl) continue;
    out.push({ imageUrl, caption });
  }
  return out;
};

const sanitizeDescription = (raw: unknown): IAppDescription => {
  const src = asRecord(raw);
  return {
    short: lines(src.short, APP_LIMITS.maxDescLines, APP_LIMITS.descLine),
    full: lines(src.full, APP_LIMITS.maxDescLines, APP_LIMITS.descLine),
  };
};

const sanitizeWhatsNew = (raw: unknown): IAppWhatsNew => {
  const src = asRecord(raw);
  return {
    version: str(src.version, APP_LIMITS.version),
    date: str(src.date, APP_LIMITS.date),
    notes: lines(src.notes, APP_LIMITS.maxNotes, APP_LIMITS.note),
  };
};

/**
 * Order is preserved exactly as sent. The oldest entry carries the driest note
 * and the whole joke is the contrast against the newer ones, so nothing here
 * sorts, reverses or truncates the list beyond the hard ceiling.
 */
const sanitizeVersions = (raw: unknown): IAppVersion[] => {
  const out: IAppVersion[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= APP_LIMITS.maxVersions) break;
    const src = asRecord(entry);
    const version = str(src.version, APP_LIMITS.version);
    // An entry with no version number is an unlabelled block of text.
    if (!version) continue;
    out.push({
      version,
      date: str(src.date, APP_LIMITS.date),
      size: str(src.size, APP_LIMITS.size),
      notes: lines(src.notes, APP_LIMITS.maxNotes, APP_LIMITS.note),
    });
  }
  return out;
};

/** A row with a blank side renders as a hole in the table. */
const sanitizeInfo = (raw: unknown): IAppInfoRow[] => {
  const out: IAppInfoRow[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= APP_LIMITS.maxInfoRows) break;
    const src = asRecord(entry);
    const label = str(src.label, APP_LIMITS.infoLabel);
    const value = str(src.value, APP_LIMITS.infoValue);
    if (!label || !value) continue;
    out.push({ label, value, link: !!src.link });
  }
  return out;
};

/**
 * Duplicate ids break React keys on the client and make moderation ambiguous
 * here — "publish rv3" has to mean exactly one row — so they are renumbered.
 */
const sanitizeReviews = (raw: unknown): IAppReview[] => {
  const out: IAppReview[] = [];
  const seen = new Set<string>();
  for (const entry of asArray(raw)) {
    if (out.length >= APP_LIMITS.maxReviews) break;
    const src = asRecord(entry);
    const title = str(src.title, APP_LIMITS.reviewTitle);
    const body = str(src.body, APP_LIMITS.reviewBody);
    // A review with neither a headline nor a body is not a review.
    if (!title && !body) continue;

    let id = str(src.id, APP_LIMITS.reviewId) || `rv${out.length + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);

    const response = asRecord(src.developerResponse);
    const responseText = str(response.text, APP_LIMITS.responseText);

    out.push({
      id,
      author: str(src.author, APP_LIMITS.author) || "Anonymous",
      stars: starsOf(src.stars),
      title,
      body,
      ago: str(src.ago, APP_LIMITS.ago),
      version: str(src.version, APP_LIMITS.version),
      developerResponse: {
        text: responseText,
        // An "ago" with no reply is a timestamp on nothing.
        ago: responseText ? str(response.ago, APP_LIMITS.ago) : "",
      },
      status: statusOf(src.status),
    });
  }
  return out;
};

export const createAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as AppBody;

    const page = await AppPage.create({
      userId: req.userId,
      meta: await sanitizeMeta(b.meta, req.userId),
      rating: sanitizeRating(b.rating),
      screenshots: await sanitizeScreenshots(b.screenshots, req.userId),
      description: sanitizeDescription(b.description),
      whatsNew: sanitizeWhatsNew(b.whatsNew),
      versionHistory: sanitizeVersions(b.versionHistory),
      info: sanitizeInfo(b.info),
      reviews: sanitizeReviews(b.reviews),
      contributorPrompt: str(b.contributorPrompt, APP_LIMITS.prompt),
      contributorsEnabled: b.contributorsEnabled === undefined ? true : !!b.contributorsEnabled,
      password: str(b.password, APP_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create app page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyAppPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await AppPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my app pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await AppPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get app page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as AppBody;

    const page = await AppPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.meta               !== undefined) page.meta               = await sanitizeMeta(b.meta, req.userId);
    if (b.rating             !== undefined) page.rating             = sanitizeRating(b.rating);
    if (b.screenshots        !== undefined) page.screenshots        = await sanitizeScreenshots(b.screenshots, req.userId);
    if (b.description        !== undefined) page.description        = sanitizeDescription(b.description);
    if (b.whatsNew           !== undefined) page.whatsNew           = sanitizeWhatsNew(b.whatsNew);
    if (b.versionHistory     !== undefined) page.versionHistory     = sanitizeVersions(b.versionHistory);
    if (b.info               !== undefined) page.info               = sanitizeInfo(b.info);
    if (b.reviews            !== undefined) page.reviews            = sanitizeReviews(b.reviews);
    if (b.contributorPrompt  !== undefined) page.contributorPrompt  = str(b.contributorPrompt, APP_LIMITS.prompt);
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = !!b.contributorsEnabled;
    // Absent or empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, APP_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, APP_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update app page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await AppPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "app",
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
    console.error("Publish app page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await AppPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    // contribToken is the friends' WRITE link — never on the recipient's read.
    const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...safeData } =
      pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "app" });
  } catch (error) {
    console.error("Get shared app page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyAppPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await AppPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify app page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteAppPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await AppPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete app page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
