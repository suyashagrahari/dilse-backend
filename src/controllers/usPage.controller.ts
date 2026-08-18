import { Request, Response } from "express";
import UsPage, {
  IComment,
  IHighlight,
  IHighlightSlide,
  IPost,
  US_LIMITS,
} from "../models/UsPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/**
 * Every write goes through an explicit allow-list of the eleven content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: "84.7K", the "Followed by … and 2 others" line, and the
 * pinned-first ordering. `formatStat`, `followedByLine` and `orderedPosts`
 * derive all three from the raw numbers, so a profile's follower count and its
 * own label can never disagree.
 */
type UsBody = {
  handle?: unknown;
  displayName?: unknown;
  category?: unknown;
  bio?: unknown;
  link?: unknown;
  avatarUrl?: unknown;
  stats?: unknown;
  followedBy?: unknown;
  highlights?: unknown;
  posts?: unknown;
  pinnedPostIds?: unknown;
  password?: unknown;
};

/**
 * Media arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and a full grid is dozens of photos.
 *
 * An upload failure is logged and yields an empty string rather than a 500. A
 * post whose image failed is dropped by `sanitizePosts`, because a grid cell
 * with no photo is a hole in the highest-fidelity element of the template.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, US_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `us/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, US_LIMITS.url);
  } catch (error) {
    console.error("Us image upload error:", error);
    return "";
  }
};

const sanitizeStrings = (raw: unknown, max: number, cap: number): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, US_LIMITS.maxRawItems)) {
    if (out.length >= max) break;
    const value = str(entry, cap).trim();
    if (!value) continue;
    out.push(value);
  }
  return out;
};

const sanitizeComments = (raw: unknown): IComment[] => {
  if (!Array.isArray(raw)) return [];
  const out: IComment[] = [];
  for (const item of raw.slice(0, US_LIMITS.maxRawItems)) {
    if (out.length >= US_LIMITS.maxComments) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const text = str(src.text, US_LIMITS.commentText).trim();
    if (!text) continue;
    const comment: IComment = { handle: str(src.handle, US_LIMITS.handle), text };
    if (src.likes !== undefined) comment.likes = int(src.likes, 0, US_LIMITS.maxStat, 0);
    out.push(comment);
  }
  return out;
};

/**
 * Optional booleans are written only when true. A stored `isVideo: false` would
 * put the play-glyph decision in the data rather than in the sender's hands,
 * and the contract types both as optional for exactly that reason.
 */
const sanitizePosts = async (raw: unknown, userId: unknown): Promise<IPost[]> => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IPost[] = [];
  for (const item of raw.slice(0, US_LIMITS.maxRawItems)) {
    if (out.length >= US_LIMITS.maxPosts) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const imageUrl = await resolveImageUrl(src.imageUrl, userId, "posts");
    if (!imageUrl) continue;
    // Ids are how `orderedPosts` and `pinnedPostIds` find a post, so a
    // duplicate would pin two cells at once.
    const candidate = str(src.id, US_LIMITS.postId).trim();
    let id = candidate && !used.has(candidate) ? candidate : `p${out.length + 1}`;
    let n = out.length + 1;
    while (used.has(id)) id = `p${++n}`;
    used.add(id);

    const post: IPost = {
      id,
      imageUrl,
      caption: str(src.caption, US_LIMITS.caption),
      likes: int(src.likes, 0, US_LIMITS.maxStat, 0),
      likedByName: str(src.likedByName, US_LIMITS.likedByName),
      postedAgo: str(src.postedAgo, US_LIMITS.postedAgo),
      comments: sanitizeComments(src.comments),
    };
    const location = str(src.location, US_LIMITS.location).trim();
    if (location) post.location = location;
    if (src.isMultiple === true) post.isMultiple = true;
    if (src.isVideo === true) post.isVideo = true;
    out.push(post);
  }
  return out;
};

const sanitizeSlides = async (raw: unknown, userId: unknown): Promise<IHighlightSlide[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IHighlightSlide[] = [];
  for (const item of raw.slice(0, US_LIMITS.maxRawItems)) {
    if (out.length >= US_LIMITS.maxSlides) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const imageUrl = await resolveImageUrl(src.imageUrl, userId, "highlights");
    if (!imageUrl) continue;
    const slide: IHighlightSlide = { imageUrl };
    const caption = str(src.caption, US_LIMITS.slideCaption).trim();
    if (caption) slide.caption = caption;
    out.push(slide);
  }
  return out;
};

/** A highlight with no slides is a bubble that opens onto nothing. */
const sanitizeHighlights = async (raw: unknown, userId: unknown): Promise<IHighlight[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IHighlight[] = [];
  for (const item of raw.slice(0, US_LIMITS.maxRawItems)) {
    if (out.length >= US_LIMITS.maxHighlights) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const slides = await sanitizeSlides(src.slides, userId);
    if (slides.length === 0) continue;
    out.push({
      title: str(src.title, US_LIMITS.highlightTitle),
      coverUrl: (await resolveImageUrl(src.coverUrl, userId, "highlights")) || slides[0].imageUrl,
      slides,
    });
  }
  return out;
};

const sanitizeStats = (raw: unknown): { posts: number; followers: number; following: number } => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    posts: int(src.posts, 0, US_LIMITS.maxStat, 0),
    followers: int(src.followers, 0, US_LIMITS.maxStat, 0),
    following: int(src.following, 0, US_LIMITS.maxStat, 0),
  };
};

/** Optional in the contract. A link with no url is a dead row of blue text. */
const sanitizeLink = (raw: unknown): { label: string; url: string } | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const url = str(src.url, US_LIMITS.url).trim();
  if (!url) return undefined;
  return { label: str(src.label, US_LIMITS.linkLabel), url };
};

export const createUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as UsBody;

    const page = await UsPage.create({
      userId: req.userId,
      handle: str(b.handle, US_LIMITS.handle),
      displayName: str(b.displayName, US_LIMITS.displayName),
      category: str(b.category, US_LIMITS.category),
      bio: sanitizeStrings(b.bio, US_LIMITS.maxBioLines, US_LIMITS.bioLine),
      link: sanitizeLink(b.link),
      avatarUrl: await resolveImageUrl(b.avatarUrl, req.userId, "avatar"),
      stats: sanitizeStats(b.stats),
      followedBy: sanitizeStrings(b.followedBy, US_LIMITS.maxFollowedBy, US_LIMITS.handle),
      highlights: await sanitizeHighlights(b.highlights, req.userId),
      posts: await sanitizePosts(b.posts, req.userId),
      pinnedPostIds: sanitizeStrings(b.pinnedPostIds, US_LIMITS.maxPinned, US_LIMITS.postId),
      password: str(b.password, US_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create us page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyUsPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await UsPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my us pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await UsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get us page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as UsBody;

    const page = await UsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.handle        !== undefined) page.handle        = str(b.handle, US_LIMITS.handle);
    if (b.displayName   !== undefined) page.displayName   = str(b.displayName, US_LIMITS.displayName);
    if (b.category      !== undefined) page.category      = str(b.category, US_LIMITS.category);
    if (b.bio           !== undefined) page.bio           = sanitizeStrings(b.bio, US_LIMITS.maxBioLines, US_LIMITS.bioLine);
    if (b.link          !== undefined) page.link          = sanitizeLink(b.link);
    if (b.avatarUrl     !== undefined) page.avatarUrl     = await resolveImageUrl(b.avatarUrl, req.userId, "avatar");
    if (b.stats         !== undefined) page.stats         = sanitizeStats(b.stats);
    if (b.followedBy    !== undefined) page.followedBy    = sanitizeStrings(b.followedBy, US_LIMITS.maxFollowedBy, US_LIMITS.handle);
    if (b.highlights    !== undefined) page.highlights    = await sanitizeHighlights(b.highlights, req.userId);
    if (b.posts         !== undefined) page.posts         = await sanitizePosts(b.posts, req.userId);
    if (b.pinnedPostIds !== undefined) page.pinnedPostIds = sanitizeStrings(b.pinnedPostIds, US_LIMITS.maxPinned, US_LIMITS.postId);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, US_LIMITS.password) !== "") {
      page.password = str(b.password, US_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update us page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await UsPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "us",
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
    console.error("Publish us page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await UsPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject({ flattenMaps: true });
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "us" });
  } catch (error) {
    console.error("Get shared us page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyUsPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await UsPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify us page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteUsPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await UsPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete us page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
