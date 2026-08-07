import { Request, Response } from "express";
import CallPage, {
  CALL_KINDS,
  CALL_LIMITS,
  type CallKind,
  type ICaller,
  type ICallerTag,
  type ICallLogEntry,
} from "../models/CallPage";
import { uploadAudioDataUrl, uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/**
 * Every write goes through an explicit allow-list of the nine content fields
 * plus the contributor switch. `req.body` is never spread into the document, so
 * a caller cannot smuggle in `userId`, `isPublished`, `shareId`, `viewCount`,
 * `passwordRaw` or either of the denormalised dashboard names.
 */
type CallBody = {
  caller?: unknown;
  recipient?: unknown;
  tags?: unknown;
  spamRisk?: unknown;
  verified?: unknown;
  voiceUrl?: unknown;
  message?: unknown;
  callLog?: unknown;
  contributorPrompt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
};

/**
 * The caller's photo arrives either as an ordinary URL or as an inline base64
 * data URL straight out of the file picker. A data URL is uploaded to S3 and
 * only the resulting link is stored — persisting the base64 would bloat the
 * document toward Mongo's 16MB ceiling for a photo that fills the whole screen.
 *
 * Anything that is neither http(s) nor `data:image/` — `javascript:` most of all
 * — becomes the empty string, which the renderer draws as the initial-letter
 * fallback avatar. An upload failure is logged and does the same rather than
 * failing the whole save.
 */
const resolvePhotoUrl = async (raw: unknown, userId: unknown): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.slice(0, CALL_LIMITS.url);
  if (!/^data:image\//i.test(value)) return "";
  try {
    const uploaded = await uploadImageDataUrl(value, `call/users/${String(userId || "anonymous")}/caller`);
    return uploaded.url.slice(0, CALL_LIMITS.url);
  } catch (error) {
    console.error("Call photo upload error:", error);
    return "";
  }
};

/**
 * Same rules for the voice note, except the empty case is `null` rather than
 * "": null is meaningful here — it is "ring normally" — and collapsing it into
 * an empty string would leave the screen with a silent ringtone instead.
 */
const resolveVoiceUrl = async (raw: unknown, userId: unknown): Promise<string | null> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value.slice(0, CALL_LIMITS.url);
  if (!/^data:audio\//i.test(value)) return null;
  try {
    const uploaded = await uploadAudioDataUrl(value, `call/users/${String(userId || "anonymous")}/voice`);
    return uploaded.url.slice(0, CALL_LIMITS.url);
  } catch (error) {
    console.error("Call voice upload error:", error);
    return null;
  }
};

const sanitizeCaller = async (raw: unknown, userId: unknown): Promise<ICaller> => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, CALL_LIMITS.name).trim(),
    photoUrl: await resolvePhotoUrl(src.photoUrl, userId),
    number: str(src.number, CALL_LIMITS.number).trim(),
    location: str(src.location, CALL_LIMITS.location).trim(),
    carrier: str(src.carrier, CALL_LIMITS.carrier).trim(),
  };
};

const sanitizeRecipient = (raw: unknown): { name: string } => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return { name: str(src.name, CALL_LIMITS.name).trim() };
};

/**
 * Sorted descending here, not just on the way out: the contract promises the
 * stored array is in count order, and the one screen that depends on it — the
 * label under the name — is not the place to find out that an editor appended
 * instead of inserting.
 */
const sanitizeTags = (raw: unknown): ICallerTag[] => {
  if (!Array.isArray(raw)) return [];
  const out: ICallerTag[] = [];
  for (const item of raw.slice(0, CALL_LIMITS.maxRawItems)) {
    if (out.length >= CALL_LIMITS.maxTags) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const label = str(src.label, CALL_LIMITS.tag).trim();
    if (!label) continue;
    out.push({ label, count: int(src.count, 0, CALL_LIMITS.maxTagCount, 0) });
  }
  return out.sort((a, b) => b.count - a.count);
};

const sanitizeMessage = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw.slice(0, CALL_LIMITS.maxRawItems)) {
    if (out.length >= CALL_LIMITS.maxMessageLines) break;
    const line = str(entry, CALL_LIMITS.line).trim();
    if (!line) continue;
    out.push(line);
  }
  return out;
};

/**
 * An entry with neither a clock nor a day cannot be placed in the log, so it is
 * dropped. A missed or rejected call with a duration is a contradiction the log
 * would render literally, so that field is dropped instead of shown.
 */
const sanitizeCallLog = (raw: unknown): ICallLogEntry[] => {
  if (!Array.isArray(raw)) return [];
  const out: ICallLogEntry[] = [];
  for (const item of raw.slice(0, CALL_LIMITS.maxRawItems)) {
    if (out.length >= CALL_LIMITS.maxLogEntries) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const time = str(src.time, CALL_LIMITS.time).trim();
    const ago = str(src.ago, CALL_LIMITS.ago).trim();
    if (!time && !ago) continue;

    const candidate = str(src.kind, CALL_LIMITS.tag) as CallKind;
    const kind: CallKind = CALL_KINDS.includes(candidate) ? candidate : "incoming";

    const entry: ICallLogEntry = { kind, time, ago };
    const duration = str(src.duration, CALL_LIMITS.duration).trim();
    if (duration && kind !== "missed" && kind !== "rejected") entry.duration = duration;
    const note = str(src.note, CALL_LIMITS.note).trim();
    if (note) entry.note = note;
    out.push(entry);
  }
  return out;
};

export const createCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CallBody;

    const page = await CallPage.create({
      userId: req.userId,
      caller: await sanitizeCaller(b.caller, req.userId),
      recipient: sanitizeRecipient(b.recipient),
      tags: sanitizeTags(b.tags),
      spamRisk: int(b.spamRisk, 0, 100, 0),
      verified: b.verified === true,
      voiceUrl: await resolveVoiceUrl(b.voiceUrl, req.userId),
      message: sanitizeMessage(b.message),
      callLog: sanitizeCallLog(b.callLog),
      contributorPrompt: str(b.contributorPrompt, CALL_LIMITS.prompt).trim(),
      // Opt-out, not opt-in: the tag box is part of the template, and an absent
      // flag on a create must not silently switch it off.
      contributorsEnabled: b.contributorsEnabled === undefined ? true : b.contributorsEnabled === true,
      password: str(b.password, CALL_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create call page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyCallPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CallPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my call pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CallPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get call page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CallBody;

    const page = await CallPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.caller            !== undefined) page.caller            = await sanitizeCaller(b.caller, req.userId);
    if (b.recipient         !== undefined) page.recipient         = sanitizeRecipient(b.recipient);
    if (b.tags              !== undefined) page.tags              = sanitizeTags(b.tags);
    if (b.spamRisk          !== undefined) page.spamRisk          = int(b.spamRisk, 0, 100, page.spamRisk);
    if (b.verified          !== undefined) page.verified          = b.verified === true;
    if (b.voiceUrl          !== undefined) page.voiceUrl          = await resolveVoiceUrl(b.voiceUrl, req.userId);
    if (b.message           !== undefined) page.message           = sanitizeMessage(b.message);
    if (b.callLog           !== undefined) page.callLog           = sanitizeCallLog(b.callLog);
    if (b.contributorPrompt !== undefined) page.contributorPrompt = str(b.contributorPrompt, CALL_LIMITS.prompt).trim();
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = b.contributorsEnabled === true;
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, CALL_LIMITS.password) !== "") {
      page.password = str(b.password, CALL_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update call page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CallPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "call",
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
    console.error("Publish call page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CallPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject({ flattenMaps: true });
    // contribToken is the friends' WRITE link — never on the recipient's read.
    const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "call" });
  } catch (error) {
    console.error("Get shared call page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyCallPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await CallPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify call page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteCallPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CallPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete call page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
