import { Request, Response } from "express";
import DedicationPage, { DEDICATION_LIMITS, IPhoto, ISegment, IStation } from "../models/DedicationPage";
import { uploadAudioDataUrl, uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";

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
  photos?: unknown;
  letter?: unknown;
  password?: unknown;
  // The editor posts its flat form model; both shapes are accepted.
  stationName?: unknown;
  stationFrequency?: unknown;
  senderName?: unknown;
  senderCity?: unknown;
  recipientName?: unknown;
  recipientCity?: unknown;
};

/**
 * The client editor has always posted FLAT keys (`stationName`, `senderName`…)
 * while this controller read only the nested `station`/`sender`/`recipient` —
 * so every published show silently lost its station name and both names.
 * Nested wins when present; flat fills in otherwise.
 */
const stationOf = (b: DedicationBody): unknown =>
  b.station ?? (b.stationName !== undefined || b.stationFrequency !== undefined
    ? { name: b.stationName, frequency: b.stationFrequency } : undefined);
const senderOf = (b: DedicationBody): unknown =>
  b.sender ?? (b.senderName !== undefined || b.senderCity !== undefined
    ? { name: b.senderName, city: b.senderCity } : undefined);
const recipientOf = (b: DedicationBody): unknown =>
  b.recipient ?? (b.recipientName !== undefined || b.recipientCity !== undefined
    ? { name: b.recipientName, city: b.recipientCity } : undefined);

const httpsUrl = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\//.test(s) ? s.slice(0, DEDICATION_LIMITS.url) : "";
};

/** Photos arrive as CDN URLs or as compressed data URLs from the editor. */
const sanitizePhotos = async (raw: unknown, userId: unknown): Promise<IPhoto[]> => {
  if (!Array.isArray(raw)) return [];
  const out: IPhoto[] = [];
  for (const item of raw.slice(0, DEDICATION_LIMITS.maxRawItems)) {
    if (out.length >= DEDICATION_LIMITS.maxPhotos) break;
    const src = (item ?? {}) as Record<string, unknown>;
    let url = typeof src.url === "string" ? src.url.trim() : "";
    if (url.startsWith("data:")) {
      try {
        url = (await uploadImageDataUrl(url, `dedication/users/${String(userId || "anonymous")}/photos`)).url;
      } catch (error) {
        console.error("Dedication photo upload error:", error);
        continue;
      }
    } else {
      url = httpsUrl(url);
    }
    if (!url) continue;
    const photo: IPhoto = { url };
    const caption = str(src.caption, DEDICATION_LIMITS.photoCaption).trim();
    if (caption) photo.caption = caption;
    out.push(photo);
  }
  return out;
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
 * A song segment with no valid id is dropped, because a dead player mid-show is
 * a stall and a radio that stalls is off. A voice segment is kept if it has
 * EITHER audio or a caption — see the note at the voice branch for why treating
 * missing audio alone as fatal quietly destroyed the mic-denial fallback.
 */
const sanitizeSegments = async (raw: unknown, userId: unknown): Promise<ISegment[]> => {
  if (!Array.isArray(raw)) return [];
  const out: ISegment[] = [];
  let clips = 0;
  for (const item of raw.slice(0, DEDICATION_LIMITS.maxRawItems)) {
    if (out.length >= DEDICATION_LIMITS.maxSegments) break;
    const src = (item ?? {}) as Record<string, unknown>;

    if (src.kind === "voice") {
      const audioUrl = await resolveAudioUrl(src.audioUrl, userId);
      const caption = str(src.caption, DEDICATION_LIMITS.caption).trim();

      // A voice segment survives on EITHER audio or a caption.
      //
      // Dropping it whenever `audioUrl` is empty deleted the mic-denial
      // fallback outright: the sender who cannot record types their dedication
      // as text, is shown "Saved!", publishes, and that segment is simply gone
      // with nothing said. The show is meant to read the caption aloud on
      // screen in exactly that case, so a caption alone is a real segment.
      //
      // It also silently swallowed upload failures, since resolveAudioUrl
      // catches, logs server-side, and returns "". Those are now distinguished:
      // a caption keeps the segment alive as a card, and a segment with neither
      // audio nor caption is the only one still dropped, because that one
      // genuinely has nothing to play or show.
      if (!audioUrl && !caption) continue;

      const segment: ISegment = {
        kind: "voice",
        audioUrl,
        durationMs: num(src.durationMs, 0, DEDICATION_LIMITS.maxDurationMs) ?? 0,
      };
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
      continue;
    }

    if (src.kind === "clip") {
      // Videos are uploaded (and transcoded) through /media/upload-video
      // before the page is saved, so only an https URL is acceptable here.
      if (clips >= DEDICATION_LIMITS.maxClips) continue;
      const videoUrl = httpsUrl(src.videoUrl);
      if (!videoUrl) continue;
      clips++;
      const segment: ISegment = {
        kind: "clip",
        videoUrl,
        title: str(src.title, DEDICATION_LIMITS.songTitle),
        dedication: str(src.dedication, DEDICATION_LIMITS.dedication),
      };
      const posterUrl = httpsUrl(src.posterUrl);
      if (posterUrl) segment.posterUrl = posterUrl;
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
      station: sanitizeStation(stationOf(b)),
      sender: sanitizePerson(senderOf(b)),
      recipient: sanitizePerson(recipientOf(b)),
      segments: await sanitizeSegments(b.segments, req.userId),
      signOff: str(b.signOff, DEDICATION_LIMITS.signOff),
      photos: await sanitizePhotos(b.photos, req.userId),
      letter: str(b.letter, DEDICATION_LIMITS.letter),
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

    const station = stationOf(b);
    const sender = senderOf(b);
    const recipient = recipientOf(b);
    if (station   !== undefined) page.station   = sanitizeStation(station);
    if (sender    !== undefined) page.sender    = sanitizePerson(sender);
    if (recipient !== undefined) page.recipient = sanitizePerson(recipient);
    if (b.photos  !== undefined) page.photos    = await sanitizePhotos(b.photos, req.userId);
    if (b.letter  !== undefined) page.letter    = str(b.letter, DEDICATION_LIMITS.letter);
    if (b.segments  !== undefined) page.segments  = await sanitizeSegments(b.segments, req.userId);
    if (b.signOff   !== undefined) page.signOff   = str(b.signOff, DEDICATION_LIMITS.signOff);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, DEDICATION_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, DEDICATION_LIMITS.password);
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
