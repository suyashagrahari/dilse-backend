import { Request, Response } from "express";
import ChallanPage, {
  IChallanAuthority,
  IChallanAccused,
  IChallanOfficer,
  IChallanEvidence,
  IChallanOffence,
  IChallanSettlementMethod,
} from "../models/ChallanPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { transformMediaPayload } from "../services/mediaProcessor.service";
import { sanitizeLoveGifs, sanitizeLoveLetter, sanitizeLock, sanitizeLovePhotos, sanitizeTheme, userPhotoFolder } from "../utils/loveMedia";

/** Mirrors client/app/(templates)/challan/components/themes.ts. */
const CHALLAN_THEMES = ["official", "patrol", "pink", "carbon"] as const;

const MAX_OFFENCES = 10;
const MAX_METHODS = 8;
const MAX_MESSAGE_LINES = 10;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** A slug-safe id. Ids reach React keys and settlement lookups, nothing else. */
const idOf = (v: unknown, fallback: string): string => {
  const raw = str(v, 48)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
};

/** Per-offence fine only. Never applied to `totalFine`. */
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const sanitizeAuthority = (raw: unknown): IChallanAuthority => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, 80).trim(),
    department: str(s.department, 80).trim(),
    state: str(s.state, 60).trim(),
    motto: str(s.motto, 80).trim(),
  };
};

const sanitizeAccused = (raw: unknown): IChallanAccused => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, 60).trim(),
    address: str(s.address, 200).trim(),
    vehicleNo: str(s.vehicleNo, 32).trim(),
  };
};

const sanitizeOfficer = (raw: unknown): IChallanOfficer => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, 60).trim(),
    id: str(s.id, 24).trim(),
    post: str(s.post, 80).trim(),
  };
};

const sanitizeEvidence = (raw: unknown): IChallanEvidence => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    imageUrl: str(s.imageUrl, 2000).trim(),
    plateText: str(s.plateText, 32).trim(),
    // Free text burned into the frame's corner. Never parsed as a date.
    timestamp: str(s.timestamp, 48).trim(),
  };
};

const sanitizeOffences = (raw: unknown): IChallanOffence[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_OFFENCES)
    .map((o) => {
      const s = (o ?? {}) as Record<string, unknown>;
      return {
        section: str(s.section, 80).trim(),
        description: str(s.description, 240).trim(),
        fine: num(s.fine, 0),
        note: str(s.note, 240).trim(),
      };
    })
    // A row with no charge on it is a blank line in the offence table.
    .filter((o) => o.description.length > 0 || o.section.length > 0);
};

const sanitizeMethods = (raw: unknown): IChallanSettlementMethod[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_METHODS)
    .map((m, i) => {
      const s = (m ?? {}) as Record<string, unknown>;
      return {
        id: idOf(s.id, `pay-${i + 1}`),
        label: str(s.label, 60).trim(),
        sub: str(s.sub, 200).trim(),
      };
    })
    // An unlabelled method is an unhittable row on the settlement sheet.
    .filter((m) => m.label.length > 0);
};

const sanitizeSettlement = (raw: unknown): { methods: IChallanSettlementMethod[] } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { methods: sanitizeMethods(s.methods) };
};

const sanitizeLines = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_MESSAGE_LINES)
    .map((l) => str(l, 1200).trim())
    .filter((l) => l.length > 0);
};

type ChallanBody = {
  authority?: unknown;
  challanNo?: unknown;
  issuedAt?: unknown;
  dueAt?: unknown;
  accused?: unknown;
  officer?: unknown;
  location?: unknown;
  evidence?: unknown;
  offences?: unknown;
  totalFine?: unknown;
  settlement?: unknown;
  paidMessage?: unknown;
  contestMessage?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

export const createChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "challan", userId: req.userId })) as ChallanBody;

    const page = await ChallanPage.create({
      userId: req.userId,
      authority: sanitizeAuthority(b.authority),
      challanNo: str(b.challanNo, 48).trim(),
      issuedAt: str(b.issuedAt, 40).trim(),
      dueAt: str(b.dueAt, 40).trim(),
      accused: sanitizeAccused(b.accused),
      officer: sanitizeOfficer(b.officer),
      location: str(b.location, 200).trim(),
      evidence: sanitizeEvidence(b.evidence),
      offences: sanitizeOffences(b.offences),
      // String in, string out. "one date" is a legal total and is never parsed.
      totalFine: str(b.totalFine, 80).trim(),
      settlement: sanitizeSettlement(b.settlement),
      paidMessage: sanitizeLines(b.paidMessage),
      contestMessage: sanitizeLines(b.contestMessage),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("challan", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: sanitizeLoveLetter(b.letter),
      theme: sanitizeTheme(b.theme, CHALLAN_THEMES),
      ...sanitizeLock(b),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyChallanPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ChallanPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my challan pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChallanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "challan", userId: req.userId })) as ChallanBody;

    const page = await ChallanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.authority      !== undefined) page.authority      = sanitizeAuthority(b.authority);
    if (b.challanNo      !== undefined) page.challanNo      = str(b.challanNo, 48).trim();
    if (b.issuedAt       !== undefined) page.issuedAt       = str(b.issuedAt, 40).trim();
    if (b.dueAt          !== undefined) page.dueAt          = str(b.dueAt, 40).trim();
    if (b.accused        !== undefined) page.accused        = sanitizeAccused(b.accused);
    if (b.officer        !== undefined) page.officer        = sanitizeOfficer(b.officer);
    if (b.location       !== undefined) page.location       = str(b.location, 200).trim();
    if (b.evidence       !== undefined) page.evidence       = sanitizeEvidence(b.evidence);
    if (b.offences       !== undefined) page.offences       = sanitizeOffences(b.offences);
    // Still a string on update. Never coerced, never recomputed from offences.
    if (b.totalFine      !== undefined) page.totalFine      = str(b.totalFine, 80).trim();
    if (b.settlement     !== undefined) page.settlement     = sanitizeSettlement(b.settlement);
    if (b.paidMessage    !== undefined) page.paidMessage    = sanitizeLines(b.paidMessage);
    if (b.contestMessage !== undefined) page.contestMessage = sanitizeLines(b.contestMessage);
    if (b.photos         !== undefined) page.photos         = await sanitizeLovePhotos(b.photos, userPhotoFolder("challan", req.userId));
    if (b.gifs           !== undefined) page.gifs           = sanitizeLoveGifs(b.gifs);
    if (b.letter         !== undefined) page.letter         = sanitizeLoveLetter(b.letter);
    if (b.theme          !== undefined) page.theme          = sanitizeTheme(b.theme, CHALLAN_THEMES);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      if (b.lockQuestion !== undefined) page.lockQuestion = lock.lockQuestion;
      if (b.lockAnswer   !== undefined) page.lockAnswer   = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChallanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "challan",
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
    console.error("Publish challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChallanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "challan" });
  } catch (error) {
    console.error("Get shared challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyChallanPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ChallanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify challan page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteChallanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ChallanPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete challan page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
