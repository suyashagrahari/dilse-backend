import { Request, Response } from "express";
import WatchPage, {
  IChapter,
  IComment,
  IRelatedVideo,
  IReply,
  IWatchChannel,
  IWatchDescription,
  IWatchVideo,
  WATCH_LIMITS,
} from "../models/WatchPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { sanitizeLock, sanitizeLoveLetter, sanitizeLovePhotos, userPhotoFolder } from "../utils/loveMedia";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** A non-negative integer. Guards every rendered count against floats and negatives. */
const count = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * An embed id, reduced to the character set the embed URL accepts.
 *
 * This value is interpolated into an iframe `src` on the client, so it is the
 * one field on this template with a genuine injection surface. Anything outside
 * [A-Za-z0-9_-] is dropped rather than escaped — a real id has never contained
 * another character, and dropping leaves nothing to escape wrongly later.
 */
const embedId = (v: unknown): string =>
  str(v, WATCH_LIMITS.url).trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, WATCH_LIMITS.embedId);

/** A handle with the leading @ removed, whitespace collapsed, then re-prefixed. */
const handleOf = (v: unknown): string => {
  const raw = str(v, WATCH_LIMITS.url).trim().replace(/^@+/, "").replace(/\s+/g, "_");
  const cut = raw.slice(0, WATCH_LIMITS.handle);
  return cut ? `@${cut}` : "";
};

/**
 * Every write goes through an explicit allow-list of the eight content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type WatchBody = {
  herName?: unknown;
  photos?: unknown;
  letter?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  video?: unknown;
  channel?: unknown;
  description?: unknown;
  comments?: unknown;
  pinnedComment?: unknown;
  related?: unknown;
  contributorPrompt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
};

/**
 * Artwork arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and this template has an avatar per comment and
 * a thumbnail per related card.
 *
 * Anything that is neither http(s) nor an image data URL — `javascript:` most of
 * all — becomes the empty string, which the renderer draws as the grey fallback
 * cell. An upload failure is logged and yields the same empty string rather than
 * a 500: every image here has a fallback, so a bad file must not block a save.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.slice(0, WATCH_LIMITS.url);
  if (!/^data:image\//i.test(value)) return "";
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `watch/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, WATCH_LIMITS.url);
  } catch (error) {
    console.error("Watch image upload error:", error);
    return "";
  }
};

/** A reply needs both an author and a body; half of one renders as a stray row. */
const sanitizeReplies = (raw: unknown): IReply[] => {
  if (!Array.isArray(raw)) return [];
  const out: IReply[] = [];
  for (const entry of raw.slice(0, WATCH_LIMITS.maxRawItems)) {
    if (out.length >= WATCH_LIMITS.maxReplies) break;
    const src = obj(entry);
    const author = str(src.author, WATCH_LIMITS.name).trim();
    const text = str(src.text, WATCH_LIMITS.comment).trim();
    if (!author || !text) continue;
    out.push({ author, text, ago: str(src.ago, WATCH_LIMITS.ago).trim() });
  }
  return out;
};

/** A comment with no text is not a comment, so it is dropped rather than stored blank. */
const sanitizeComment = async (
  raw: unknown,
  userId: unknown,
  index: number
): Promise<IComment | null> => {
  const src = obj(raw);
  const text = str(src.text, WATCH_LIMITS.comment).trim();
  if (!text) return null;
  return {
    id: str(src.id, WATCH_LIMITS.id).trim() || `c${index + 1}`,
    author: str(src.author, WATCH_LIMITS.name).trim() || "Anonymous",
    avatarUrl: await resolveImageUrl(src.avatarUrl, userId, "comments"),
    text,
    ago: str(src.ago, WATCH_LIMITS.ago).trim(),
    likes: count(src.likes, 0),
    isCreator: src.isCreator === true,
    hearted: src.hearted === true,
    replies: sanitizeReplies(src.replies),
    // Unknown values fail closed to "pending" — the comment box is open to
    // anybody with the link, so an unmoderated comment must never default its
    // way onto the recipient's page.
    status: src.status === "published" ? "published" : "pending",
  };
};

/**
 * Duplicate ids break React keys and make moderation ambiguous — a moderator
 * publishing "c3" would be publishing two comments — so they are renumbered
 * here rather than anywhere downstream.
 */
const sanitizeComments = async (raw: unknown, userId: unknown): Promise<IComment[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IComment[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, WATCH_LIMITS.maxRawItems)) {
    if (out.length >= WATCH_LIMITS.maxComments) break;
    const comment = await sanitizeComment(entry, userId, out.length);
    if (!comment) continue;
    let id = comment.id;
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    out.push({ ...comment, id });
  }
  return out;
};

/**
 * A chapter that cannot be seeked to is worse than no chapter: it renders as a
 * live-looking timestamp that jumps the player somewhere arbitrary. Timestamps
 * are stored as whole seconds and nothing else.
 */
const sanitizeChapters = (raw: unknown): IChapter[] => {
  if (!Array.isArray(raw)) return [];
  const out: IChapter[] = [];
  for (const entry of raw.slice(0, WATCH_LIMITS.maxRawItems)) {
    if (out.length >= WATCH_LIMITS.maxChapters) break;
    const src = obj(entry);
    const label = str(src.label, WATCH_LIMITS.label).trim();
    const cc = str(src.cc, WATCH_LIMITS.cc).trim();
    if (!label && !cc) continue;
    const seconds = typeof src.seconds === "number" ? src.seconds : Number(src.seconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > WATCH_LIMITS.maxSeconds) continue;
    out.push({ seconds: Math.trunc(seconds), label, cc });
  }
  // Ascending, so the chapter list cannot render out of order regardless of how
  // it was authored.
  return out.sort((a, b) => a.seconds - b.seconds);
};

const sanitizeParagraphs = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, WATCH_LIMITS.maxRawItems)
    .map((p) => str(p, WATCH_LIMITS.paragraph).trim())
    .filter(Boolean)
    .slice(0, WATCH_LIMITS.maxParagraphs);
};

const sanitizeDescription = (raw: unknown): IWatchDescription => {
  const src = obj(raw);
  return {
    intro: sanitizeParagraphs(src.intro),
    chapters: sanitizeChapters(src.chapters),
    outro: sanitizeParagraphs(src.outro),
  };
};

/** A card with no title is an unlabelled rectangle, so it is dropped. */
const sanitizeRelated = async (raw: unknown, userId: unknown): Promise<IRelatedVideo[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IRelatedVideo[] = [];
  for (const entry of raw.slice(0, WATCH_LIMITS.maxRawItems)) {
    if (out.length >= WATCH_LIMITS.maxRelated) break;
    const src = obj(entry);
    const title = str(src.title, WATCH_LIMITS.title).trim();
    if (!title) continue;
    out.push({
      id: str(src.id, WATCH_LIMITS.id).trim() || `r${out.length + 1}`,
      // Empty is meaningful here: a card without an embed id is decorative.
      youtubeId: embedId(src.youtubeId),
      title,
      channel: str(src.channel, WATCH_LIMITS.name).trim(),
      views: str(src.views, WATCH_LIMITS.stat).trim(),
      ago: str(src.ago, WATCH_LIMITS.ago).trim(),
      duration: str(src.duration, WATCH_LIMITS.duration).trim(),
      thumbnailUrl: await resolveImageUrl(src.thumbnailUrl, userId, "related"),
      note: str(src.note, WATCH_LIMITS.note).trim(),
    });
  }
  return out;
};

const sanitizeVideo = (raw: unknown): IWatchVideo => {
  const src = obj(raw);
  return {
    youtubeId: embedId(src.youtubeId),
    title: str(src.title, WATCH_LIMITS.title).trim(),
    // Stats are strings and they stay strings. "∞" survives.
    views: str(src.views, WATCH_LIMITS.stat).trim(),
    postedAgo: str(src.postedAgo, WATCH_LIMITS.ago).trim(),
    likes: str(src.likes, WATCH_LIMITS.stat).trim(),
  };
};

const sanitizeChannel = async (raw: unknown, userId: unknown): Promise<IWatchChannel> => {
  const src = obj(raw);
  return {
    name: str(src.name, WATCH_LIMITS.name).trim(),
    handle: handleOf(src.handle),
    avatarUrl: await resolveImageUrl(src.avatarUrl, userId, "channel"),
    subscribers: str(src.subscribers, WATCH_LIMITS.stat).trim(),
  };
};

/**
 * The pin is optional, and a malformed one is dropped rather than defaulted — a
 * blank pinned card sitting above the comment list would read as a bug and would
 * be one.
 */
const sanitizePinned = async (raw: unknown, userId: unknown): Promise<IComment | undefined> => {
  if (raw === undefined || raw === null) return undefined;
  return (await sanitizeComment(raw, userId, 0)) ?? undefined;
};

export const createWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as WatchBody;

    const page = await WatchPage.create({
      userId: req.userId,
      herName: str(b.herName, WATCH_LIMITS.name).trim(),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("watch", req.userId)),
      letter: sanitizeLoveLetter(b.letter),
      ...sanitizeLock(b),
      video: sanitizeVideo(b.video),
      channel: await sanitizeChannel(b.channel, req.userId),
      description: sanitizeDescription(b.description),
      comments: await sanitizeComments(b.comments, req.userId),
      pinnedComment: await sanitizePinned(b.pinnedComment, req.userId),
      related: await sanitizeRelated(b.related, req.userId),
      contributorPrompt: str(b.contributorPrompt, WATCH_LIMITS.prompt),
      contributorsEnabled: b.contributorsEnabled === undefined ? true : b.contributorsEnabled === true,
      password: str(b.password, WATCH_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyWatchPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await WatchPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my watch pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as WatchBody;

    const page = await WatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.herName             !== undefined) page.herName             = str(b.herName, WATCH_LIMITS.name).trim();
    if (b.photos              !== undefined) page.photos              = await sanitizeLovePhotos(b.photos, userPhotoFolder("watch", req.userId));
    if (b.letter              !== undefined) page.letter              = sanitizeLoveLetter(b.letter);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      if (b.lockQuestion !== undefined) page.lockQuestion = lock.lockQuestion;
      if (b.lockAnswer   !== undefined) page.lockAnswer   = lock.lockAnswer;
    }
    if (b.video               !== undefined) page.video               = sanitizeVideo(b.video);
    if (b.channel             !== undefined) page.channel             = await sanitizeChannel(b.channel, req.userId);
    if (b.description         !== undefined) page.description         = sanitizeDescription(b.description);
    if (b.comments            !== undefined) page.comments            = await sanitizeComments(b.comments, req.userId);
    if (b.pinnedComment       !== undefined) page.pinnedComment       = await sanitizePinned(b.pinnedComment, req.userId);
    if (b.related             !== undefined) page.related             = await sanitizeRelated(b.related, req.userId);
    if (b.contributorPrompt   !== undefined) page.contributorPrompt   = str(b.contributorPrompt, WATCH_LIMITS.prompt);
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = b.contributorsEnabled === true;
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, WATCH_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, WATCH_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WatchPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "watch",
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
    console.error("Publish watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WatchPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    // contribToken is the friends' WRITE link — never on the recipient's read.
    const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "watch" });
  } catch (error) {
    console.error("Get shared watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyWatchPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await WatchPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify watch page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteWatchPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await WatchPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete watch page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
