import { Request, Response } from "express";
import SearchedPage, {
  IFakePage,
  IKnowledgeFact,
  IKnowledgePanel,
  IPaaItem,
  ISearchImage,
  ISearchPlace,
  ISearchResult,
  ISearchReview,
  ISearchStory,
  ISearchVideo,
  SEARCHED_LIMITS,
} from "../models/SearchedPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import {
  sanitizeLock,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  userPhotoFolder,
} from "../utils/loveMedia";


const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Every write goes through an explicit allow-list of the thirteen content
 * fields. `req.body` is never spread into the document, so a caller cannot
 * smuggle in `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: the current tab, the query text, which PAA rows are
 * open, how many reserve items have been appended. That is session state and
 * `appendReserve`/`matchSuggestions` derive it from the arrays below.
 */
type SearchedBody = {
  sender?: unknown;
  recipient?: unknown;
  autocomplete?: unknown;
  didYouMean?: unknown;
  resultCount?: unknown;
  searchSeconds?: unknown;
  results?: unknown;
  paa?: unknown;
  paaReserve?: unknown;
  knowledgePanel?: unknown;
  relatedSearches?: unknown;
  images?: unknown;
  alternateResults?: unknown;
  senderName?: unknown;
  recipientName?: unknown;
  doodleTitle?: unknown;
  aiOverview?: unknown;
  aiPoints?: unknown;
  reviews?: unknown;
  topStories?: unknown;
  videos?: unknown;
  places?: unknown;
  photos?: unknown;
  letter?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

/** Rows of plain-string fields: every key capped, rows with no `need` key dropped. */
function sanitizeRows<T extends object>(raw: unknown, max: number, spec: Record<string, number>, need: string): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= max) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const [k, cap] of Object.entries(spec)) row[k] = str(src[k], cap).trim();
    if (!row[need]) continue;
    out.push(row as T);
  }
  return out;
}

const L = SEARCHED_LIMITS;
const sanitizeReviews = (raw: unknown): ISearchReview[] =>
  sanitizeRows<ISearchReview>(raw, L.maxReviews, { author: L.reviewAuthor, text: L.reviewText, when: L.reviewWhen }, "text").map((r, i) => {
    const src = Array.isArray(raw) ? ((raw[i] ?? {}) as Record<string, unknown>) : {};
    const n = Math.round(Number(src.stars));
    const out: ISearchReview = { author: r.author || "Anonymous", stars: Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 5, text: r.text };
    if (r.when) out.when = r.when;
    return out;
  });
const sanitizeStories = (raw: unknown) => sanitizeRows<ISearchStory>(raw, L.maxStories, { source: L.storySource, time: L.storyTime, title: L.storyTitle }, "title");
const sanitizeVideos = (raw: unknown) => sanitizeRows<ISearchVideo>(raw, L.maxVideos, { channel: L.videoChannel, duration: L.videoDuration, title: L.videoTitle }, "title");
const sanitizePlaces = (raw: unknown) => sanitizeRows<ISearchPlace>(raw, L.maxPlaces, { name: L.placeName, kind: L.placeKind, rating: L.placeRating, note: L.placeNote }, "name");

/** `sender: {name}` (current client) or flat `senderName` (older clients). */
const nameFrom = (nested: unknown, flat: unknown): string => {
  const n = str(((nested ?? {}) as Record<string, unknown>).name, L.name).trim();
  return n || str(flat, L.name).trim();
};

/**
 * Media arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling.
 *
 * An upload failure is logged and yields an empty string rather than a 500:
 * every image slot in this template is optional, and the joke is in the copy.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, SEARCHED_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `searched/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, SEARCHED_LIMITS.url);
  } catch (error) {
    console.error("Searched image upload error:", error);
    return "";
  }
};

/** Trimmed, non-empty, capped. A blank row renders as a dead line of chrome. */
const sanitizeStrings = (raw: unknown, max: number, cap: number): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= max) break;
    const value = str(entry, cap).trim();
    if (!value) continue;
    out.push(value);
  }
  return out;
};

const sanitizeFakePage = async (raw: unknown, userId: unknown): Promise<IFakePage | undefined> => {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const title = str(src.title, SEARCHED_LIMITS.title).trim();
  const body = sanitizeStrings(src.body, SEARCHED_LIMITS.maxPageBody, SEARCHED_LIMITS.bodyLine);
  // A "page" with neither a title nor a paragraph makes the result clickable
  // and then shows an empty sheet, which is the one way this gag falls flat.
  if (!title && body.length === 0) return undefined;
  const page: IFakePage = {
    title,
    url: str(src.url, SEARCHED_LIMITS.breadcrumb),
    body,
  };
  const imageUrl = await resolveImageUrl(src.imageUrl, userId, "page");
  if (imageUrl) page.imageUrl = imageUrl;
  return page;
};

const sanitizeResults = async (
  raw: unknown,
  userId: unknown,
  max: number
): Promise<ISearchResult[]> => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: ISearchResult[] = [];
  for (const item of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= max) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const title = str(src.title, SEARCHED_LIMITS.title).trim();
    const snippet = str(src.snippet, SEARCHED_LIMITS.snippet).trim();
    if (!title && !snippet) continue;
    // Ids are how the client tracks a result across a re-render, so a duplicate
    // would make two rows indistinguishable.
    const candidate = str(src.id, SEARCHED_LIMITS.resultId).trim();
    let id = candidate && !used.has(candidate) ? candidate : `r${out.length + 1}`;
    let n = out.length + 1;
    while (used.has(id)) id = `r${++n}`;
    used.add(id);

    const result: ISearchResult = {
      id,
      title,
      url: str(src.url, SEARCHED_LIMITS.breadcrumb),
      snippet,
    };
    const site = str(src.site, SEARCHED_LIMITS.site).trim();
    if (site) result.site = site;
    const date = str(src.date, SEARCHED_LIMITS.date).trim();
    if (date) result.date = date;
    const page = await sanitizeFakePage(src.page, userId);
    if (page) result.page = page;
    const badge = str(src.badge, SEARCHED_LIMITS.badge).trim();
    if (badge) result.badge = badge;
    out.push(result);
  }
  return out;
};

const sanitizePaa = (raw: unknown, max: number): IPaaItem[] => {
  if (!Array.isArray(raw)) return [];
  const out: IPaaItem[] = [];
  for (const item of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= max) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const question = str(src.question, SEARCHED_LIMITS.question).trim();
    if (!question) continue;
    const entry: IPaaItem = {
      question,
      answer: str(src.answer, SEARCHED_LIMITS.answer),
    };
    const source = str(src.source, SEARCHED_LIMITS.breadcrumb).trim();
    if (source) entry.source = source;
    out.push(entry);
  }
  return out;
};

const sanitizeFacts = (raw: unknown): IKnowledgeFact[] => {
  if (!Array.isArray(raw)) return [];
  const out: IKnowledgeFact[] = [];
  for (const item of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= SEARCHED_LIMITS.maxFacts) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const label = str(src.label, SEARCHED_LIMITS.factLabel).trim();
    const value = str(src.value, SEARCHED_LIMITS.factValue).trim();
    if (!label && !value) continue;
    out.push({ label, value });
  }
  return out;
};

const sanitizeKnowledgePanel = (raw: unknown): IKnowledgePanel => {
  const src = (raw ?? {}) as Record<string, unknown>;
  const panel: IKnowledgePanel = {
    subtitle: str(src.subtitle, SEARCHED_LIMITS.subtitle),
    description: str(src.description, SEARCHED_LIMITS.description),
    facts: sanitizeFacts(src.facts),
    alsoSearchFor: sanitizeStrings(
      src.alsoSearchFor,
      SEARCHED_LIMITS.maxAlsoSearchFor,
      SEARCHED_LIMITS.name
    ),
  };
  const quote = str(src.quote, SEARCHED_LIMITS.quote).trim();
  if (quote) panel.quote = quote;
  return panel;
};

const sanitizeImages = async (raw: unknown, userId: unknown): Promise<ISearchImage[]> => {
  if (!Array.isArray(raw)) return [];
  const out: ISearchImage[] = [];
  for (const item of raw.slice(0, SEARCHED_LIMITS.maxRawItems)) {
    if (out.length >= SEARCHED_LIMITS.maxImages) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const url = await resolveImageUrl(src.url, userId, "images");
    if (!url) continue;
    const image: ISearchImage = { url };
    const caption = str(src.caption, SEARCHED_LIMITS.caption).trim();
    if (caption) image.caption = caption;
    out.push(image);
  }
  return out;
};

/**
 * Keyed by the related-search string that swaps them in — the key set is the
 * sender's own copy, not something this schema can enumerate, so it is stored
 * as a Map and the keys are accepted as-is and only length-capped.
 */
const sanitizeAlternateResults = async (
  raw: unknown,
  userId: unknown
): Promise<Map<string, ISearchResult[]>> => {
  const out = new Map<string, ISearchResult[]>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (out.size >= SEARCHED_LIMITS.maxAlternateBuckets) break;
    const key = str(k, SEARCHED_LIMITS.alternateKey).trim();
    if (!key) continue;
    const results = await sanitizeResults(v, userId, SEARCHED_LIMITS.maxAlternateResults);
    if (results.length === 0) continue;
    out.set(key, results);
  }
  return out;
};

/**
 * `JSON.stringify` of a Map is `{}`, so a document that has already been run
 * through `toObject()` has to have its alternate results flattened by hand or
 * the client coercer sees nothing and silently falls back to the demo data.
 */
const flattenAlternateResults = (
  alternateResults: Map<string, ISearchResult[]> | undefined
): Record<string, ISearchResult[]> =>
  Object.fromEntries(alternateResults ?? new Map<string, ISearchResult[]>());

export const createSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as SearchedBody;
    const recipientSrc = (b.recipient ?? {}) as Record<string, unknown>;

    const page = await SearchedPage.create({
      userId: req.userId,
      sender: { name: nameFrom(b.sender, b.senderName) },
      recipient: {
        name: nameFrom(b.recipient, b.recipientName),
        photoUrl: await resolveImageUrl(recipientSrc.photoUrl, req.userId, "recipient"),
      },
      doodleTitle: str(b.doodleTitle, L.doodleTitle),
      aiOverview: str(b.aiOverview, L.aiOverview),
      aiPoints: sanitizeStrings(b.aiPoints, L.maxAiPoints, L.aiPoint),
      reviews: sanitizeReviews(b.reviews),
      topStories: sanitizeStories(b.topStories),
      videos: sanitizeVideos(b.videos),
      places: sanitizePlaces(b.places),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("searched", req.userId)),
      letter: sanitizeLoveLetter(b.letter),
      ...sanitizeLock(b),
      autocomplete: sanitizeStrings(
        b.autocomplete,
        SEARCHED_LIMITS.maxAutocomplete,
        SEARCHED_LIMITS.suggestion
      ),
      didYouMean: str(b.didYouMean, SEARCHED_LIMITS.didYouMean),
      resultCount: str(b.resultCount, SEARCHED_LIMITS.resultCount),
      searchSeconds: str(b.searchSeconds, SEARCHED_LIMITS.searchSeconds),
      results: await sanitizeResults(b.results, req.userId, SEARCHED_LIMITS.maxResults),
      paa: sanitizePaa(b.paa, SEARCHED_LIMITS.maxPaa),
      paaReserve: sanitizePaa(b.paaReserve, SEARCHED_LIMITS.maxPaaReserve),
      knowledgePanel: sanitizeKnowledgePanel(b.knowledgePanel),
      relatedSearches: sanitizeStrings(
        b.relatedSearches,
        SEARCHED_LIMITS.maxRelatedSearches,
        SEARCHED_LIMITS.relatedSearch
      ),
      images: await sanitizeImages(b.images, req.userId),
      alternateResults: await sanitizeAlternateResults(b.alternateResults, req.userId),
      password: str(b.password, SEARCHED_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMySearchedPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await SearchedPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my searched pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await SearchedPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;
    pageObj.alternateResults = flattenAlternateResults(page.alternateResults);

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as SearchedBody;

    const page = await SearchedPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.sender !== undefined || b.senderName !== undefined) {
      page.sender = { name: nameFrom(b.sender, b.senderName) };
    }
    if (b.recipient !== undefined || b.recipientName !== undefined) {
      const src = (b.recipient ?? {}) as Record<string, unknown>;
      page.recipient = {
        name: nameFrom(b.recipient, b.recipientName),
        photoUrl: src.photoUrl !== undefined ? await resolveImageUrl(src.photoUrl, req.userId, "recipient") : page.recipient?.photoUrl ?? "",
      };
    }
    if (b.doodleTitle !== undefined) page.doodleTitle = str(b.doodleTitle, L.doodleTitle);
    if (b.aiOverview !== undefined) page.aiOverview = str(b.aiOverview, L.aiOverview);
    if (b.aiPoints !== undefined) page.aiPoints = sanitizeStrings(b.aiPoints, L.maxAiPoints, L.aiPoint);
    if (b.reviews !== undefined) page.reviews = sanitizeReviews(b.reviews);
    if (b.topStories !== undefined) page.topStories = sanitizeStories(b.topStories);
    if (b.videos !== undefined) page.videos = sanitizeVideos(b.videos);
    if (b.places !== undefined) page.places = sanitizePlaces(b.places);
    if (b.photos !== undefined) page.photos = await sanitizeLovePhotos(b.photos, userPhotoFolder("searched", req.userId));
    if (b.letter !== undefined) page.letter = sanitizeLoveLetter(b.letter);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    if (b.autocomplete !== undefined)
      page.autocomplete = sanitizeStrings(b.autocomplete, SEARCHED_LIMITS.maxAutocomplete, SEARCHED_LIMITS.suggestion);
    if (b.didYouMean       !== undefined) page.didYouMean       = str(b.didYouMean, SEARCHED_LIMITS.didYouMean);
    if (b.resultCount      !== undefined) page.resultCount      = str(b.resultCount, SEARCHED_LIMITS.resultCount);
    if (b.searchSeconds    !== undefined) page.searchSeconds    = str(b.searchSeconds, SEARCHED_LIMITS.searchSeconds);
    if (b.results          !== undefined) page.results          = await sanitizeResults(b.results, req.userId, SEARCHED_LIMITS.maxResults);
    if (b.paa              !== undefined) page.paa              = sanitizePaa(b.paa, SEARCHED_LIMITS.maxPaa);
    if (b.paaReserve       !== undefined) page.paaReserve       = sanitizePaa(b.paaReserve, SEARCHED_LIMITS.maxPaaReserve);
    if (b.knowledgePanel   !== undefined) page.knowledgePanel   = sanitizeKnowledgePanel(b.knowledgePanel);
    if (b.relatedSearches  !== undefined) page.relatedSearches  = sanitizeStrings(b.relatedSearches, SEARCHED_LIMITS.maxRelatedSearches, SEARCHED_LIMITS.relatedSearch);
    if (b.images           !== undefined) page.images           = await sanitizeImages(b.images, req.userId);
    if (b.alternateResults !== undefined) page.alternateResults = await sanitizeAlternateResults(b.alternateResults, req.userId);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, SEARCHED_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, SEARCHED_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await SearchedPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "searched",
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
    console.error("Publish searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await SearchedPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject({ flattenMaps: true });
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    safeData.alternateResults = flattenAlternateResults(page.alternateResults);
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "searched" });
  } catch (error) {
    console.error("Get shared searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifySearchedPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await SearchedPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify searched page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteSearchedPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await SearchedPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete searched page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
