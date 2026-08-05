import { Request, Response } from "express";
import ProposalPage, { IMemory, HeroArt } from "../models/ProposalPage";
import { checkPublishAccess } from "../services/publishGate.service";

const MAX_MEMORIES = 6;
const HERO_ART: HeroArt[] = ["ring", "rose", "bouquet"];

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * `imageUrl` is left uncapped on purpose: an uploaded photo arrives as an inline
 * base64 data URL, and slicing it would produce a silently broken image.
 */
const sanitizeMemories = (raw: unknown): IMemory[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_MEMORIES)
    .map((m) => {
      const src = (m ?? {}) as Record<string, unknown>;
      return {
        imageUrl: typeof src.imageUrl === "string" ? src.imageUrl : "",
        caption: str(src.caption, 140),
      };
    })
    // A polaroid with no picture would render an empty white card — drop it.
    .filter((m) => m.imageUrl.trim().length > 0);
};

const sanitizeHeroArt = (raw: unknown): HeroArt =>
  typeof raw === "string" && HERO_ART.includes(raw as HeroArt) ? (raw as HeroArt) : "ring";

type ProposalBody = {
  senderName?: unknown;
  recipientName?: unknown;
  gateTitle?: unknown;
  gateButtonLabel?: unknown;
  memoryLaneTitle?: unknown;
  memories?: unknown;
  askHeadline?: unknown;
  heroArt?: unknown;
  yesLabel?: unknown;
  celebrationTitle?: unknown;
  secretNote?: unknown;
  metDate?: unknown;
  musicUrl?: unknown;
  password?: unknown;
};

export const createProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as ProposalBody;

    const page = await ProposalPage.create({
      userId: req.userId,
      senderName: str(b.senderName, 80),
      recipientName: str(b.recipientName, 80),
      gateTitle: str(b.gateTitle, 160),
      gateButtonLabel: str(b.gateButtonLabel, 60),
      memoryLaneTitle: str(b.memoryLaneTitle, 160),
      memories: sanitizeMemories(b.memories),
      askHeadline: str(b.askHeadline, 200),
      heroArt: sanitizeHeroArt(b.heroArt),
      yesLabel: str(b.yesLabel, 60),
      celebrationTitle: str(b.celebrationTitle, 200),
      secretNote: str(b.secretNote, 3000),
      metDate: str(b.metDate, 24),
      musicUrl: str(b.musicUrl, 2000),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyProposalPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ProposalPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my proposal pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProposalPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as ProposalBody;

    const page = await ProposalPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName       !== undefined) page.senderName       = str(b.senderName, 80);
    if (b.recipientName    !== undefined) page.recipientName    = str(b.recipientName, 80);
    if (b.gateTitle        !== undefined) page.gateTitle        = str(b.gateTitle, 160);
    if (b.gateButtonLabel  !== undefined) page.gateButtonLabel  = str(b.gateButtonLabel, 60);
    if (b.memoryLaneTitle  !== undefined) page.memoryLaneTitle  = str(b.memoryLaneTitle, 160);
    if (b.memories         !== undefined) page.memories         = sanitizeMemories(b.memories);
    if (b.askHeadline      !== undefined) page.askHeadline      = str(b.askHeadline, 200);
    if (b.heroArt          !== undefined) page.heroArt          = sanitizeHeroArt(b.heroArt);
    if (b.yesLabel         !== undefined) page.yesLabel         = str(b.yesLabel, 60);
    if (b.celebrationTitle !== undefined) page.celebrationTitle = str(b.celebrationTitle, 200);
    if (b.secretNote       !== undefined) page.secretNote       = str(b.secretNote, 3000);
    if (b.metDate          !== undefined) page.metDate          = str(b.metDate, 24);
    if (b.musicUrl         !== undefined) page.musicUrl         = str(b.musicUrl, 2000);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProposalPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "proposal",
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
    console.error("Publish proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProposalPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "proposal" });
  } catch (error) {
    console.error("Get shared proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyProposalPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ProposalPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify proposal page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteProposalPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProposalPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete proposal page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
