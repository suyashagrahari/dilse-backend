import { Request, Response } from "express";
import HoldMyHandPage, { IHoldLine, HoldMode, IMemoryCard } from "../models/HoldMyHandPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { transformMediaPayload } from "../services/mediaProcessor.service";

const MAX_HOLD_LINES = 24;
const MAX_RELEASE_LINES = 16;
const MAX_GHOSTS = 12;

/** Hold duration bounds. Below 10s the mechanic is pointless; above 5min it is cruel. */
const MIN_DURATION_MS = 10_000;
const MAX_DURATION_MS = 300_000;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** Photo framing: position is 0-100 (object-position %), zoom is 100-300. */
const cropPos = (v: unknown, fallback = 50): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fallback;
};
const cropScale = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(300, Math.max(100, Math.round(n))) : 100;
};

const clampDuration = (raw: unknown): number => {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 60_000;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(n)));
};

const sanitizeMode = (raw: unknown): HoldMode => (raw === "evil" ? "evil" : "kind");

const sanitizeHands = (raw: unknown): number => (Number(raw) === 2 ? 2 : 1);

/**
 * Hold lines are sorted by `atMs` on the way in so the client can walk them
 * linearly, and any line past the configured duration is dropped — it could
 * never fire and would only confuse the sender's own preview.
 */
const sanitizeHoldLines = (raw: unknown, durationMs: number): IHoldLine[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_HOLD_LINES)
    .map((l) => {
      const src = (l ?? {}) as Record<string, unknown>;
      const at = Number(src.atMs);
      return {
        atMs: Number.isFinite(at) ? Math.min(durationMs, Math.max(0, Math.round(at))) : 0,
        text: str(src.text, 160),
      };
    })
    .filter((l) => l.text.trim().length > 0)
    .sort((a, b) => a.atMs - b.atMs);
};

/** Six keepsake cards at most — beyond that the letter stops being the point. */
const MAX_MEMORIES = 6;

/**
 * `imageUrl` is deliberately NOT passed through `str()`: an uploaded photo is
 * still a data URL at this point (the media transform replaces it with a CDN
 * URL on the way in), and a length cap would cut it into a broken image. A card
 * with no picture is dropped rather than stored as an empty frame.
 */
const sanitizeMemories = (raw: unknown): IMemoryCard[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_MEMORIES)
    .map((m) => {
      const o = (m ?? {}) as Record<string, unknown>;
      return {
        imageUrl: typeof o.imageUrl === "string" ? o.imageUrl : "",
        note: str(o.note, 600),
        cropX: cropPos(o.cropX),
        cropY: cropPos(o.cropY),
        scale: cropScale(o.scale),
      };
    })
    .filter((m) => m.imageUrl.trim().length > 0);
};

const sanitizeStrings = (raw: unknown, max: number, len: number): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, max)
    .map((s) => str(s, len))
    .filter((s) => s.trim().length > 0);
};

type HoldMyHandBody = {
  senderName?: unknown;
  recipientName?: unknown;
  photoUrl?: unknown;
  photoCropX?: unknown;
  photoCropY?: unknown;
  photoScale?: unknown;
  durationMs?: unknown;
  mode?: unknown;
  hands?: unknown;
  holdLines?: unknown;
  releaseLines?: unknown;
  ghostFragments?: unknown;
  letter?: unknown;
  memories?: unknown;
  password?: unknown;
};

export const createHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body, { template: "hold-my-hand", userId: req.userId })) as HoldMyHandBody;
    const durationMs = clampDuration(b.durationMs);

    const page = await HoldMyHandPage.create({
      userId: req.userId,
      senderName: str(b.senderName, 80),
      recipientName: str(b.recipientName, 80),
      photoUrl: typeof b.photoUrl === "string" ? b.photoUrl : "",
      photoCropX: cropPos(b.photoCropX),
      photoCropY: cropPos(b.photoCropY),
      photoScale: cropScale(b.photoScale),
      durationMs,
      mode: sanitizeMode(b.mode),
      hands: sanitizeHands(b.hands),
      holdLines: sanitizeHoldLines(b.holdLines, durationMs),
      releaseLines: sanitizeStrings(b.releaseLines, MAX_RELEASE_LINES, 160),
      ghostFragments: sanitizeStrings(b.ghostFragments, MAX_GHOSTS, 200),
      letter: str(b.letter, 4000),
      memories: sanitizeMemories(b.memories),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyHoldMyHandPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await HoldMyHandPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my holdMyHand pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoldMyHandPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body, { template: "hold-my-hand", userId: req.userId })) as HoldMyHandBody;

    const page = await HoldMyHandPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName    !== undefined) page.senderName    = str(b.senderName, 80);
    if (b.recipientName !== undefined) page.recipientName = str(b.recipientName, 80);
    if (b.photoUrl      !== undefined) page.photoUrl      = typeof b.photoUrl === "string" ? b.photoUrl : "";
    if (b.photoCropX    !== undefined) page.photoCropX    = cropPos(b.photoCropX);
    if (b.photoCropY    !== undefined) page.photoCropY    = cropPos(b.photoCropY);
    if (b.photoScale    !== undefined) page.photoScale    = cropScale(b.photoScale);
    if (b.durationMs    !== undefined) page.durationMs    = clampDuration(b.durationMs);
    if (b.mode          !== undefined) page.mode          = sanitizeMode(b.mode);
    if (b.hands         !== undefined) page.hands         = sanitizeHands(b.hands);
    // Clamped against the *effective* duration so shortening the hold also
    // prunes lines that just became unreachable.
    if (b.holdLines     !== undefined) page.holdLines     = sanitizeHoldLines(b.holdLines, page.durationMs);
    if (b.releaseLines  !== undefined) page.releaseLines  = sanitizeStrings(b.releaseLines, MAX_RELEASE_LINES, 160);
    if (b.ghostFragments!== undefined) page.ghostFragments= sanitizeStrings(b.ghostFragments, MAX_GHOSTS, 200);
    if (b.letter        !== undefined) page.letter        = str(b.letter, 4000);
    if (b.memories      !== undefined) page.memories      = sanitizeMemories(b.memories);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoldMyHandPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "hold-my-hand",
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
    console.error("Publish holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoldMyHandPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "hold-my-hand" });
  } catch (error) {
    console.error("Get shared holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyHoldMyHandPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await HoldMyHandPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify holdMyHand page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteHoldMyHandPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await HoldMyHandPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete holdMyHand page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
