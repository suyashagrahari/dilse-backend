import { Request, Response } from "express";
import DateInvitationPage, {
  DATE_INVITE_LIMITS,
  IGeoPoint,
  IStop,
  RsvpState,
  WalkingLevel,
} from "../models/DateInvitationPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { pageToken } from "./dateInvitationLive.controller";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Every write goes through an explicit allow-list of the fifteen content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type DateInviteBody = {
  senderName?: unknown;
  recipientName?: unknown;
  startsAt?: unknown;
  durationMins?: unknown;
  dressCode?: unknown;
  walkingLevel?: unknown;
  note?: unknown;
  meetingPoint?: unknown;
  stops?: unknown;
  rsvp?: unknown;
  proposedDate?: unknown;
  currentStopIndex?: unknown;
  arrivedAt?: unknown;
  photos?: unknown;
  closingLine?: unknown;
  songId?: unknown;
  songTitle?: unknown;
  password?: unknown;
};

/** A YouTube video id is exactly eleven url-safe characters. Anything else is no song. */
const songIdOf = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
};

/**
 * Ids have to be unique: the client keys the arrival log and the itinerary off
 * them, so a duplicate would make two stops indistinguishable. Blank or repeated
 * ids are replaced with a positional fallback.
 */
const uniqueId = (raw: unknown, used: Set<string>, prefix: string, index: number): string => {
  const candidate = str(raw, DATE_INVITE_LIMITS.stopId).trim();
  const id = candidate && !used.has(candidate) ? candidate : `${prefix}${index + 1}`;
  let final = id;
  let n = index + 1;
  while (used.has(final)) final = `${prefix}${++n}`;
  used.add(final);
  return final;
};

/** 0/0 is the sentinel for "not supplied" — anything out of range collapses to it. */
const sanitizeGeoPoint = (raw: unknown): IGeoPoint => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, DATE_INVITE_LIMITS.placeName),
    address: str(src.address, DATE_INVITE_LIMITS.address),
    lat: clampNum(src.lat, 0, DATE_INVITE_LIMITS.latMin, DATE_INVITE_LIMITS.latMax),
    lng: clampNum(src.lng, 0, DATE_INVITE_LIMITS.lngMin, DATE_INVITE_LIMITS.lngMax),
  };
};

/**
 * A stop with no name is not a place — it would render as an empty row on the
 * itinerary, so it is dropped. The same rule `dbToDateInviteData` applies on
 * the client.
 */
const sanitizeStops = (raw: unknown): IStop[] => {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: IStop[] = [];
  for (const entry of raw.slice(0, DATE_INVITE_LIMITS.maxRawItems)) {
    if (out.length >= DATE_INVITE_LIMITS.maxStops) break;
    const src = (entry ?? {}) as Record<string, unknown>;
    const name = str(src.name, DATE_INVITE_LIMITS.placeName).trim();
    if (!name) continue;
    out.push({
      id: uniqueId(src.id, used, "s", out.length),
      order: clampNum(src.order, out.length + 1, DATE_INVITE_LIMITS.orderMin, DATE_INVITE_LIMITS.maxStops),
      name,
      address: str(src.address, DATE_INVITE_LIMITS.address),
      lat: clampNum(src.lat, 0, DATE_INVITE_LIMITS.latMin, DATE_INVITE_LIMITS.latMax),
      lng: clampNum(src.lng, 0, DATE_INVITE_LIMITS.lngMin, DATE_INVITE_LIMITS.lngMax),
      arriveAt: str(src.arriveAt, DATE_INVITE_LIMITS.iso),
      durationMins: clampNum(
        src.durationMins,
        DATE_INVITE_LIMITS.stopDurationDefault,
        DATE_INVITE_LIMITS.stopDurationMin,
        DATE_INVITE_LIMITS.stopDurationMax
      ),
      why: str(src.why, DATE_INVITE_LIMITS.why),
      dressNote: str(src.dressNote, DATE_INVITE_LIMITS.dressNote),
      // Surprise is the default: forgetting to set it must not leak a name.
      surprise: src.surprise === false ? false : true,
    });
  }
  return out;
};

/** ISO timestamps, one slot per stop. "" means not yet arrived. */
const sanitizeArrivedAt = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, DATE_INVITE_LIMITS.maxStops)
    .map((v) => str(v, DATE_INVITE_LIMITS.iso));
};

/**
 * Photos arrive either as ordinary URLs or as inline base64 data URLs straight
 * out of the file picker. A data URL is uploaded to S3 and only the resulting
 * link is stored — persisting the base64 would bloat the document toward
 * Mongo's 16MB ceiling.
 *
 * An upload failure is logged and drops that one photo rather than 500ing: the
 * photos are an afterword, so a bad file must not block the page from saving.
 */
const resolveMediaUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, DATE_INVITE_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `date-invitation/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, DATE_INVITE_LIMITS.url);
  } catch (error) {
    console.error("Date invitation media upload error:", error);
    return "";
  }
};

const resolvePhotos = async (raw: unknown, userId: unknown): Promise<string[]> => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, DATE_INVITE_LIMITS.maxPhotos)) {
    const url = await resolveMediaUrl(entry, userId, "photos");
    if (url) out.push(url);
  }
  return out;
};

export const createDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as DateInviteBody;
    const stops = sanitizeStops(b.stops);

    const page = await DateInvitationPage.create({
      userId: req.userId,
      senderName: str(b.senderName, DATE_INVITE_LIMITS.name),
      recipientName: str(b.recipientName, DATE_INVITE_LIMITS.name),
      startsAt: str(b.startsAt, DATE_INVITE_LIMITS.iso),
      durationMins: clampNum(
        b.durationMins,
        DATE_INVITE_LIMITS.durationMinsDefault,
        DATE_INVITE_LIMITS.durationMinsMin,
        DATE_INVITE_LIMITS.durationMinsMax
      ),
      dressCode: str(b.dressCode, DATE_INVITE_LIMITS.dressCode),
      walkingLevel: oneOf<WalkingLevel>(b.walkingLevel, ["minimal", "some", "a lot"], "some"),
      note: str(b.note, DATE_INVITE_LIMITS.note),
      meetingPoint: sanitizeGeoPoint(b.meetingPoint),
      stops,
      rsvp: oneOf<RsvpState>(b.rsvp, ["pending", "accepted", "declined", "reschedule"], "pending"),
      proposedDate: str(b.proposedDate, DATE_INVITE_LIMITS.iso),
      currentStopIndex: clampNum(
        b.currentStopIndex,
        DATE_INVITE_LIMITS.currentStopIndexMin,
        DATE_INVITE_LIMITS.currentStopIndexMin,
        stops.length
      ),
      arrivedAt: sanitizeArrivedAt(b.arrivedAt),
      photos: await resolvePhotos(b.photos, req.userId),
      closingLine: str(b.closingLine, DATE_INVITE_LIMITS.closingLine),
      songId: songIdOf(b.songId),
      songTitle: str(b.songTitle, DATE_INVITE_LIMITS.songTitle),
      password: str(b.password, DATE_INVITE_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyDateInvitationPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await DateInvitationPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my dateInvitation pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DateInvitationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as DateInviteBody;

    const page = await DateInvitationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName    !== undefined) page.senderName    = str(b.senderName, DATE_INVITE_LIMITS.name);
    if (b.recipientName !== undefined) page.recipientName = str(b.recipientName, DATE_INVITE_LIMITS.name);
    if (b.startsAt      !== undefined) page.startsAt      = str(b.startsAt, DATE_INVITE_LIMITS.iso);
    if (b.durationMins  !== undefined) page.durationMins  = clampNum(
      b.durationMins,
      DATE_INVITE_LIMITS.durationMinsDefault,
      DATE_INVITE_LIMITS.durationMinsMin,
      DATE_INVITE_LIMITS.durationMinsMax
    );
    if (b.dressCode     !== undefined) page.dressCode     = str(b.dressCode, DATE_INVITE_LIMITS.dressCode);
    if (b.walkingLevel  !== undefined) page.walkingLevel  = oneOf<WalkingLevel>(b.walkingLevel, ["minimal", "some", "a lot"], "some");
    if (b.note          !== undefined) page.note          = str(b.note, DATE_INVITE_LIMITS.note);
    if (b.meetingPoint  !== undefined) page.meetingPoint  = sanitizeGeoPoint(b.meetingPoint);
    if (b.stops         !== undefined) page.stops         = sanitizeStops(b.stops);
    // rsvp, proposedDate, currentStopIndex, arrivedAt and the photos are LIVE
    // state owned by the evening itself (see dateInvitationLive.controller).
    // The editor always sends its defaults for them, so honouring them here
    // would wipe her answer and every check-in the moment he fixes a typo.
    if (b.closingLine   !== undefined) page.closingLine   = str(b.closingLine, DATE_INVITE_LIMITS.closingLine);
    if (b.songId        !== undefined) page.songId        = songIdOf(b.songId);
    if (b.songTitle     !== undefined) page.songTitle     = str(b.songTitle, DATE_INVITE_LIMITS.songTitle);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, DATE_INVITE_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, DATE_INVITE_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DateInvitationPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "date-invitation",
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
    console.error("Publish dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DateInvitationPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "date-invitation" });
  } catch (error) {
    console.error("Get shared dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyDateInvitationPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await DateInvitationPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      // The recipient's key for the live endpoints (RSVP, photos).
      res.json({ success: true, verified: true, token: pageToken(page) });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify dateInvitation page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteDateInvitationPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await DateInvitationPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete dateInvitation page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
