import { Request, Response } from "express";
import CourtMarriagePage, {
  ICertField,
  IParty,
  IWitness,
  CertificateState,
} from "../models/CourtMarriagePage";
import { checkPublishAccess } from "../services/publishGate.service";
import { uploadMediaField } from "../services/mediaProcessor.service";
import {
  sanitizeLoveGifs,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  sanitizeTheme,
  userPhotoFolder,
  sanitizeLock,
} from "../utils/loveMedia";

/** Mirrors client/app/(templates)/court-marriage/components/themes.ts. */
const THEME_IDS = ["midnight", "rose", "mogra", "vegas"] as const;

/** The certificate has exactly three witness columns; unsigned ones stay blank. */
const WITNESS_SLOTS = 3;
/** 4–6 dot-leader rows read as a form; more and the block runs into the footer. */
const MAX_FIELDS = 6;
const STATES: CertificateState[] = ["draft", "awaiting_witnesses", "registered"];

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const int = (v: unknown, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const sanitizeParty = (raw: unknown): IParty => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(src.name, 40),
    age: int(src.age, 0, 120),
    city: str(src.city, 40),
  };
};

const sanitizeFields = (raw: unknown): ICertField[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_FIELDS)
    .map((f) => {
      const src = (f ?? {}) as Record<string, unknown>;
      return { label: str(src.label, 40), value: str(src.value, 24) };
    })
    // A row with no label would print as a naked dot leader — drop it.
    .filter((f) => f.label.trim().length > 0);
};

/**
 * SVG path data only: the drawing commands, digits, separators and signs. This
 * is a strict allowlist, so nothing that is not a path can ride in on the `d`
 * attribute of a rendered `<path>`.
 */
const sanitizePath = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  const trimmed = raw.slice(0, 1200).trim();
  if (!trimmed) return "";
  return /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\-+\s]+$/.test(trimmed) ? trimmed : "";
};

/**
 * Always returns exactly three slots, padded with blanks. The template relies on
 * that, and it is also what the (later) witness-signing flow will index into.
 */
const sanitizeWitnesses = (raw: unknown): IWitness[] => {
  const list = Array.isArray(raw) ? raw.slice(0, WITNESS_SLOTS) : [];
  const out: IWitness[] = list.map((w) => {
    const src = (w ?? {}) as Record<string, unknown>;
    return { name: str(src.name, 30), signaturePath: sanitizePath(src.signaturePath) };
  });
  while (out.length < WITNESS_SLOTS) out.push({ name: "", signaturePath: "" });
  return out;
};

const sanitizeState = (raw: unknown): CertificateState =>
  typeof raw === "string" && STATES.includes(raw as CertificateState)
    ? (raw as CertificateState)
    : "registered";

/** "2026-03-14" only. Anything else is dropped rather than half-parsed. */
const sanitizeDate = (raw: unknown): string => {
  const s = str(raw, 24);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

type CourtMarriageBody = {
  partyA?: unknown;
  partyB?: unknown;
  photoUrl?: unknown;
  certificateNo?: unknown;
  registeredOn?: unknown;
  knownSinceDays?: unknown;
  fields?: unknown;
  witnesses?: unknown;
  registrarSignaturePath?: unknown;
  objectionCount?: unknown;
  certificateState?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

export const createCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CourtMarriageBody;

    // To S3 first, so what is stored is a short CDN URL. Keeping the data URL
    // would put the whole image inside every share response the recipient has
    // to download before the page can render.
    const photoUrl = await uploadMediaField(b.photoUrl, "court-marriage", req.userId);

    const page = await CourtMarriagePage.create({
      userId: req.userId,
      partyA: sanitizeParty(b.partyA),
      partyB: sanitizeParty(b.partyB),
      photoUrl,
      certificateNo: str(b.certificateNo, 24),
      registeredOn: sanitizeDate(b.registeredOn),
      knownSinceDays: int(b.knownSinceDays, 0, 100000),
      fields: sanitizeFields(b.fields),
      witnesses: sanitizeWitnesses(b.witnesses),
      registrarSignaturePath: sanitizePath(b.registrarSignaturePath),
      objectionCount: int(b.objectionCount, 0, 9999),
      certificateState: sanitizeState(b.certificateState),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("court-marriage", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: sanitizeLoveLetter(b.letter),
      theme: sanitizeTheme(b.theme, THEME_IDS),
      ...sanitizeLock(b),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyCourtMarriagePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CourtMarriagePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my courtMarriage pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtMarriagePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CourtMarriageBody;

    const page = await CourtMarriagePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.partyA                 !== undefined) page.partyA                 = sanitizeParty(b.partyA);
    if (b.partyB                 !== undefined) page.partyB                 = sanitizeParty(b.partyB);
    if (b.photoUrl               !== undefined) page.photoUrl               = await uploadMediaField(b.photoUrl, "court-marriage", req.userId);
    if (b.certificateNo          !== undefined) page.certificateNo          = str(b.certificateNo, 24);
    if (b.registeredOn           !== undefined) page.registeredOn           = sanitizeDate(b.registeredOn);
    if (b.knownSinceDays         !== undefined) page.knownSinceDays         = int(b.knownSinceDays, 0, 100000);
    if (b.fields                 !== undefined) page.fields                 = sanitizeFields(b.fields);
    if (b.witnesses              !== undefined) page.witnesses              = sanitizeWitnesses(b.witnesses);
    if (b.registrarSignaturePath !== undefined) page.registrarSignaturePath = sanitizePath(b.registrarSignaturePath);
    if (b.objectionCount         !== undefined) page.objectionCount         = int(b.objectionCount, 0, 9999);
    if (b.certificateState       !== undefined) page.certificateState       = sanitizeState(b.certificateState);
    if (b.photos                 !== undefined) page.photos                 = await sanitizeLovePhotos(b.photos, userPhotoFolder("court-marriage", req.userId));
    if (b.gifs                   !== undefined) page.gifs                   = sanitizeLoveGifs(b.gifs);
    if (b.letter                 !== undefined) page.letter                 = sanitizeLoveLetter(b.letter);
    if (b.theme                  !== undefined) page.theme                  = sanitizeTheme(b.theme, THEME_IDS);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock({ lockQuestion: b.lockQuestion ?? page.lockQuestion, lockAnswer: b.lockAnswer ?? page.lockAnswer });
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtMarriagePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "court-marriage",
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
    console.error("Publish courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtMarriagePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "court-marriage" });
  } catch (error) {
    console.error("Get shared courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyCourtMarriagePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await CourtMarriagePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify courtMarriage page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteCourtMarriagePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CourtMarriagePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete courtMarriage page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
