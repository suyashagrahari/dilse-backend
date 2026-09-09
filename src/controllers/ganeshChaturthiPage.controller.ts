import { Request, Response } from "express";
import GaneshChaturthiPage from "../models/GaneshChaturthiPage";
import type { IWishRow, IVargani } from "../models/GaneshChaturthiPage";
import { checkPublishAccess } from "../services/publishGate.service";

const MAX_WISHES = 6;
const MAX_GREETING_LINES = 4;
const MAX_REPLY = 140;

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

function sanitizeWishes(input: unknown): IWishRow[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { label: str(o.label, 60), value: str(o.value, 44) };
    })
    .filter((r) => r.label.trim().length > 0)
    .slice(0, MAX_WISHES);
}

function sanitizeVargani(input: unknown): IVargani {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    upiId: str(o.upiId, 120).trim(),
    // 600 chars fits a CDN URL and firmly does not fit a base64 data URL — the
    // cap is the backstop for the decision in `components/upload.ts` to store a
    // URL rather than the bytes.
    qrImageUrl: str(o.qrImageUrl, 600),
    note: str(o.note, 200),
  };
}

const isoDate = (input: unknown, fallback: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(input || "")) ? String(input) : fallback;

function buildContent(b: Record<string, unknown>) {
  return {
    recipientName: str(b.recipientName, 120),
    senderName: str(b.senderName, 120),
    city: str(b.city, 120),
    photoUrl: str(b.photoUrl, 600),
    greeting: sanitizeGreeting(b.greeting),
    aartiLine: str(b.aartiLine, 200),
    prasadNote: str(b.prasadNote, 200),
    wishes: sanitizeWishes(b.wishes),
    vargani: sanitizeVargani(b.vargani),
    festivalDate: isoDate(b.festivalDate, "2026-09-14"),
    visarjanDate: isoDate(b.visarjanDate, "2026-09-24"),
  };
}

export const createGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const content = buildContent(req.body || {});
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const page = await GaneshChaturthiPage.create({ userId: req.userId, ...content, password });
    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyGaneshChaturthiPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await GaneshChaturthiPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my ganesh chaturthi pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }
    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const b = (req.body || {}) as Record<string, unknown>;
    const content = buildContent(b);
    page.recipientName = content.recipientName;
    page.senderName = content.senderName;
    page.city = content.city;
    page.photoUrl = content.photoUrl;
    page.greeting = content.greeting;
    page.aartiLine = content.aartiLine;
    page.prasadNote = content.prasadNote;
    page.wishes = content.wishes;
    page.vargani = content.vargani;
    page.festivalDate = content.festivalDate;
    page.visarjanDate = content.visarjanDate;
    // An empty string means "the sender did not retype the password", not
    // "remove it" — every editor sends the whole body on every save, and
    // treating blank as a removal would wipe the reader's password on the next
    // edit.
    if (typeof b.password === "string" && b.password !== "") page.password = b.password;

    // `reply` is intentionally NOT settable here. It belongs to the person who
    // opened the page, and an owner-side edit that could rewrite it would make
    // the whole exchange worthless — the point is that the sender receives words
    // that are not their own.

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "ganesh-chaturthi",
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
    console.error("Publish ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({
      success: true,
      data: safeData,
      hasPassword: !!page.password,
      templateType: "ganesh-chaturthi",
    });
  } catch (error) {
    console.error("Get shared ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyGaneshChaturthiPagePassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await GaneshChaturthiPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(password || "");
    if (match) res.json({ success: true, verified: true });
    else res.status(401).json({ success: false, verified: false, error: "Wrong password" });
  } catch (error) {
    console.error("Verify ganesh chaturthi page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * POST /ganesh-chaturthi-pages/share/:shareId/reply — PUBLIC.
 *
 * The person this page was sent to is not a user of this site and should not
 * have to become one to answer it. So this route is unauthenticated, and its
 * safety comes from being as narrow as it is possible to make it:
 *
 *   • addressed only by the unguessable shareId
 *   • writes exactly one field, capped at 140 characters
 *   • WRITE-ONCE — a filled reply is never overwritten
 *
 * The write-once rule is what stops the obvious abuse: without it, anyone
 * holding the link could replace the reader's words with anything they liked,
 * and the sender would have no way of knowing it had changed.
 */
export const submitReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (page.reply && page.reply.trim().length > 0) {
      // Not an error from their side — they simply already wrote it. Returning
      // the existing reply lets the client show it rather than a failure.
      res.json({ success: true, data: { reply: page.reply, alreadySubmitted: true } });
      return;
    }

    const reply = str((req.body || {}).reply, MAX_REPLY).trim();
    if (!reply) { res.status(400).json({ success: false, error: "Nothing to save" }); return; }

    page.reply = reply;
    page.replyAt = new Date();
    await page.save();

    res.json({ success: true, data: { reply: page.reply, alreadySubmitted: false } });
  } catch (error) {
    console.error("Submit ganesh chaturthi reply error:", error);
    res.status(500).json({ success: false, error: "Failed to save reply" });
  }
};

export const deleteGaneshChaturthiPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await GaneshChaturthiPage.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete ganesh chaturthi page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
