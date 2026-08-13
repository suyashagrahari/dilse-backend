import { Request, Response } from "express";
import RakshaBandhanPage from "../models/RakshaBandhanPage";
import type {
  IMemory,
  ILedgerRow,
  IRakhiDesign,
  IShagun,
  RakhiCharm,
} from "../models/RakshaBandhanPage";
import { checkPublishAccess } from "../services/publishGate.service";

const CHARMS: RakhiCharm[] = ["om", "swastik", "evil-eye", "heart", "star"];
const MAX_MEMORIES = 12;
const MAX_LEDGER = 8;
const MAX_GREETING_LINES = 6;
const MAX_VACHAN = 120;

/** Hex only. Anything else falls back, so a colour can never carry a payload. */
function hex(input: unknown, fallback: string): string {
  const s = String(input || "");
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

function str(input: unknown, max: number): string {
  return typeof input === "string" ? input.slice(0, max) : "";
}

function sanitizeGreeting(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => str(l, 200))
    .filter((l) => l.trim().length > 0)
    .slice(0, MAX_GREETING_LINES);
}

function sanitizeRakhi(input: unknown): IRakhiDesign {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const charm = CHARMS.includes(o.charm as RakhiCharm) ? (o.charm as RakhiCharm) : "om";
  return {
    threadColorA: hex(o.threadColorA, "#9B2226"),
    threadColorB: hex(o.threadColorB, "#E8913A"),
    beadColor: hex(o.beadColor, "#B08D57"),
    charm,
    // The charm is small; anything longer than this cannot be read on it and
    // the client shrinks to fit rather than overflowing.
    pendantText: str(o.pendantText, 16),
  };
}

function sanitizeMemories(input: unknown): IMemory[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((m) => {
      const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      return {
        imageUrl: str(o.imageUrl, 600),
        caption: str(o.caption, 200),
        year: str(o.year, 8),
      };
    })
    .filter((m) => m.imageUrl.trim().length > 0)
    .slice(0, MAX_MEMORIES);
}

function sanitizeLedger(input: unknown): ILedgerRow[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { label: str(o.label, 60), value: str(o.value, 40) };
    })
    .filter((r) => r.label.trim().length > 0)
    .slice(0, MAX_LEDGER);
}

function sanitizeShagun(input: unknown): IShagun {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    upiId: str(o.upiId, 120).trim(),
    qrImageUrl: str(o.qrImageUrl, 600),
    note: str(o.note, 200),
  };
}

function buildContent(b: Record<string, unknown>) {
  return {
    brotherName: str(b.brotherName, 120),
    sisterName: str(b.sisterName, 120),
    city: str(b.city, 120),
    photoUrl: str(b.photoUrl, 600),
    greeting: sanitizeGreeting(b.greeting),
    rakhi: sanitizeRakhi(b.rakhi),
    memories: sanitizeMemories(b.memories),
    ledger: sanitizeLedger(b.ledger),
    shagun: sanitizeShagun(b.shagun),
    distanceKm: Math.max(0, Math.min(30000, Math.floor(Number(b.distanceKm) || 0))),
    festivalDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.festivalDate || ""))
      ? String(b.festivalDate)
      : "2026-08-28",
  };
}

export const createRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const content = buildContent(req.body || {});
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const page = await RakshaBandhanPage.create({ userId: req.userId, ...content, password });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyRakshaBandhanPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await RakshaBandhanPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my raksha bandhan pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }
    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const b = (req.body || {}) as Record<string, unknown>;
    const content = buildContent(b);
    page.brotherName = content.brotherName;
    page.sisterName = content.sisterName;
    page.city = content.city;
    page.photoUrl = content.photoUrl;
    page.greeting = content.greeting;
    page.rakhi = content.rakhi;
    page.memories = content.memories;
    page.ledger = content.ledger;
    page.shagun = content.shagun;
    page.distanceKm = content.distanceKm;
    page.festivalDate = content.festivalDate;
    if (typeof b.password === "string" && b.password !== "") page.password = b.password;

    // `vachan` is intentionally NOT settable here. It belongs to her brother,
    // and an owner-side edit that could rewrite it would make the promise
    // worthless — the whole point is that she receives his words, not hers.

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "raksha-bandhan",
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
    console.error("Publish raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "raksha-bandhan" });
  } catch (error) {
    console.error("Get shared raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyRakshaBandhanPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await RakshaBandhanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) res.json({ success: true, verified: true });
    else res.status(401).json({ success: false, verified: false, error: "Wrong password" });
  } catch (error) {
    console.error("Verify raksha bandhan page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * POST /raksha-bandhan-pages/share/:shareId/vachan — PUBLIC.
 *
 * Her brother is not a user of this site and should not have to become one to
 * answer her. So this route is unauthenticated, and its safety comes from being
 * as narrow as it is possible to make it:
 *
 *   • addressed only by the unguessable shareId
 *   • writes exactly one field, capped at 120 characters
 *   • WRITE-ONCE — a filled vachan is never overwritten
 *
 * The write-once rule is what stops the obvious abuse: without it, anyone with
 * the link could replace her brother's promise with anything they liked, and she
 * would have no way of knowing it had changed.
 */
export const submitVachan = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (page.vachan && page.vachan.trim().length > 0) {
      // Not an error from his side — he simply already answered. Returning the
      // existing promise lets the client show it rather than a failure.
      res.json({ success: true, data: { vachan: page.vachan, alreadySubmitted: true } });
      return;
    }

    const vachan = str((req.body || {}).vachan, MAX_VACHAN).trim();
    if (!vachan) { res.status(400).json({ success: false, error: "Nothing to save" }); return; }

    page.vachan = vachan;
    page.vachanAt = new Date();
    await page.save();

    res.json({ success: true, data: { vachan: page.vachan, alreadySubmitted: false } });
  } catch (error) {
    console.error("Submit vachan error:", error);
    res.status(500).json({ success: false, error: "Failed to save promise" });
  }
};

export const deleteRakshaBandhanPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RakshaBandhanPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete raksha bandhan page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
