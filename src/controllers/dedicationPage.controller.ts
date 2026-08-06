import { Request, Response } from "express";
import DedicationPage, { DEDICATION_LIMITS, ISegment, IStation } from "../models/DedicationPage";
import { uploadAudioDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
};

/**
 * Every write goes through an explicit allow-list of the five content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: the dial position, the decoys, the VU levels, the phase.
 * The tuner is generated from `station.frequency` by `resolveDecoys` and the
 * meters read a live AnalyserNode — none of it is anyone's to send.
 */
type DedicationBody = {
  station?: unknown;
  sender?: unknown;
  recipient?: unknown;
  segments?: unknown;
  signOff?: unknown;
  password?: unknown;
};

/**
 * The RJ recording arrives either as an ordinary URL or as an inline base64
 * data URL straight out of the booth. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and 90 seconds of opus is not small.
 *
 * An upload failure is logged and yields an empty string rather than a 500. The
 * segment is then dropped by `sanitizeSegments` instead of shipping a show with
 * a dead player in the middle of it.
 */
const resolveAudioUrl = async (raw: unknown, userId: unknown): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, DEDICATION_LIMITS.url);
  try {
    const uploaded = await uploadAudioDataUrl(
      value,
      `dedication/users/${String(userId || "anonymous")}/voice`
    );
    return uploaded.url.slice(0, DEDICATION_LIMITS.url);
  } catch (error) {
    console.error("Dedication audio upload error:", error);
    return "";
  }
};

const sanitizeStation = (raw: unknown): IStation => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, DEDICATION_LIMITS.stationName),
    frequency: str(src.frequency, DEDICATION_LIMITS.frequency),
  };
};

const sanitizePerson = (raw: unknown): { name: string; city: string } => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, DEDICATION_LIMITS.name),
    city: str(src.city, DEDICATION_LIMITS.city),
  };
};

/**
 * The contract's `Segment` is a discriminated union, so each stored segment
 * gets exactly the keys its `kind` calls for and no others — a voice segment
 * with a stray empty `youtubeId` would not narrow cleanly on the client.
 *
 * A voice segment with no playable audio and a song segment with no id are both
 * dropped: a dead segment is a stall, and a radio that stalls is off.
 */
const sanitizeSegments = async (raw: unknown, userId: unknown): Promise<ISegment[]> => {
  if (!Array.isArray(raw)) return [];
  const out: ISegment[] = [];
  for (const item of raw.slice(0, DEDICATION_LIMITS.maxRawItems)) {
    if (out.length >= DEDICATION_LIMITS.maxSegments) break;
    const src = (item ?? {}) as Record<string, unknown>;

    if (src.kind === "voice") {
      const audioUrl = await resolveAudioUrl(src.audioUrl, userId);
      if (!audioUrl) continue;
      const segment: ISegment = {
        kind: "voice",
        audioUrl,
        durationMs: num(src.durationMs, 0, DEDICATION_LIMITS.maxDurationMs) ?? 0,
      };
      const caption = str(src.caption, DEDICATION_LIMITS.caption).trim();
      if (caption) segment.caption = caption;
      out.push(segment);
      continue;
    }

    if (src.kind === "song") {
      // The id is validated by `parseYouTubeId` while the sender is still
      // looking at the form. Here we only shape-check what arrives.
      const youtubeId = str(src.youtubeId, DEDICATION_LIMITS.youtubeId).trim();
      if (!/^[\w-]{11}$/.test(youtubeId)) continue;
      const segment: ISegment = {
        kind: "song",
        youtubeId,
        title: str(src.title, DEDICATION_LIMITS.songTitle),
        artist: str(src.artist, DEDICATION_LIMITS.songArtist),
        dedication: str(src.dedication, DEDICATION_LIMITS.dedication),
      };
      const startSeconds = num(src.startSeconds, 0, 86_400);
      const endSeconds = num(src.endSeconds, 0, 86_400);
      if (startSeconds !== undefined) segment.startSeconds = startSeconds;
      if (endSeconds !== undefined) segment.endSeconds = endSeconds;
      out.push(segment);
    }
  }
  return out;
};

export const createDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as DedicationBody;

    const page = await DedicationPage.create({
      userId: req.userId,
      station: sanitizeStation(b.station),
      sender: sanitizePerson(b.sender),
      recipient: sanitizePerson(b.recipient),
      segments: await sanitizeSegments(b.segments, req.userId),
      signOff: str(b.signOff, DEDICATION_LIMITS.signOff),
      password: str(b.password, DEDICATION_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyDedicationPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await DedicationPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my dedication pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DedicationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as DedicationBody;

    const page = await DedicationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.station   !== undefined) page.station   = sanitizeStation(b.station);
    if (b.sender    !== undefined) page.sender    = sanitizePerson(b.sender);
    if (b.recipient !== undefined) page.recipient = sanitizePerson(b.recipient);
    if (b.segments  !== undefined) page.segments  = await sanitizeSegments(b.segments, req.userId);
    if (b.signOff   !== undefined) page.signOff   = str(b.signOff, DEDICATION_LIMITS.signOff);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, DEDICATION_LIMITS.password) !== "") {
      page.password = str(b.password, DEDICATION_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DedicationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "dedication",
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
    console.error("Publish dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DedicationPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject({ flattenMaps: true });
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "dedication" });
  } catch (error) {
    console.error("Get shared dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyDedicationPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await DedicationPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify dedication page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteDedicationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DedicationPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete dedication page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
