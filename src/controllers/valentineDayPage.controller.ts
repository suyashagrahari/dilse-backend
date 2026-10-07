// ─── Valentine's week — one controller factory for eight days ────────────────
//
// `makeValentineDayController(slug)` returns the standard eight handlers
// (create, getMy, get, update, publish, getShared, verify, delete — same shape
// as controllers/catchGamePage.controller.ts) plus `react`, the recipient's
// beacon. Every handler queries the day's DISCRIMINATOR model, so a happy-rose-day
// handler can never read or write a happy-teddy-day row.
//
// Writes go through an explicit allow-list. `req.body` is never spread into a
// document, so `userId`, `isPublished`, `shareId`, `viewCount`, `passwordRaw`,
// `day` and — importantly — `reactions` cannot be set by the owner's form.

import { Request, Response } from "express";
import mongoose from "mongoose";
import { VALENTINE_DAY_MODELS, type IValentineDayPage } from "../models/ValentineDayPage";
import User from "../models/User";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import { sanitizeLovePhotos, userPhotoFolder } from "../utils/loveMedia";
import { sendValentineAnswerEmail } from "../utils/mailer";
import {
  REACTION_EVENTS,
  VALENTINE_DAYS,
  VW_LIMITS,
  reactionWrite,
  sanitizeExtras,
  sanitizeGifSlots,
  sanitizeMusic,
  type ReactionEvent,
  type ValentineDaySlug,
} from "../config/valentineDays";

const DAY_NAMES: Record<ValentineDaySlug, string> = {
  "happy-rose-day": "Rose Day",
  "happy-propose-day": "Propose Day",
  "happy-chocolate-day": "Chocolate Day",
  "happy-teddy-day": "Teddy Day",
  "happy-promise-day": "Promise Day",
  "happy-hug-day": "Hug Day",
  "happy-kiss-day": "Kiss Day",
  "happy-valentines-day": "Valentine's Day",
};

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const line = (v: unknown, max: number): string => str(v, max).trim();

type DayBody = {
  recipientName?: unknown;
  senderName?: unknown;
  petName?: unknown;
  letter?: unknown;
  photos?: unknown;
  gifs?: unknown;
  music?: unknown;
  musicMode?: unknown;
  musicYoutubeId?: unknown;
  musicStart?: unknown;
  endLine?: unknown;
  extras?: unknown;
  password?: unknown;
};

/** The owner-visible, never-public reaction summary. */
export type ReactionsView = {
  openedAt: Date | null;
  completedAt: Date | null;
  answer: "yes" | null;
  answeredAt: Date | null;
  noDodges: number | null;
  count: number | null;
};

/**
 * Strip what a recipient must never receive. Used by getShared AND the generic resolver.
 * `userId` goes too: the viewer never reads it (fromDb ignores it), and the
 * generic resolver takes the owner from the document, not from this object.
 */
export function projectValentineShared(data: Record<string, unknown>): Record<string, unknown> {
  const { reactions: _r, password: _pw, passwordRaw: _pr, userId: _u, ...rest } = data;
  return rest;
}

/** Injected in tests; the defaults are the real things. */
export interface ValentineControllerDeps {
  model?: mongoose.Model<IValentineDayPage>;
  findOwnerEmail?: (userId: unknown) => Promise<string | null>;
  sendAnswerEmail?: typeof sendValentineAnswerEmail;
  buildShareUrl?: (shareId: string, userId: string) => Promise<string>;
}

const defaultOwnerEmail = async (userId: unknown): Promise<string | null> => {
  const owner = await User.findById(userId).select("email").lean<{ email?: string }>();
  return owner?.email || null;
};

const defaultShareUrl = async (shareId: string, userId: string): Promise<string> => {
  const { buildShareUrl } = await import("../utils/shareUrl");
  return buildShareUrl(shareId, userId);
};

export function makeValentineDayController(slug: ValentineDaySlug, deps: ValentineControllerDeps = {}) {
  const Model = deps.model ?? VALENTINE_DAY_MODELS[slug];
  const day = VALENTINE_DAYS[slug];
  const ownerEmail = deps.findOwnerEmail ?? defaultOwnerEmail;
  const sendAnswer = deps.sendAnswerEmail ?? sendValentineAnswerEmail;
  const shareUrlFor = deps.buildShareUrl ?? defaultShareUrl;
  const label = `${slug} page`;

  /**
   * Photos: inline data URLs from the editor are uploaded to S3 by
   * sanitizeLovePhotos (which calls uploadImageDataUrl per photo) BEFORE any
   * cap is applied; only the CDN link is stored. Capped to the day's own max.
   */
  const photosFrom = async (raw: unknown, userId: unknown) =>
    (await sanitizeLovePhotos(raw, userPhotoFolder(slug, userId))).slice(0, day.maxPhotos);

  /** Every content field the form owns, sanitised. Async only because of photos. */
  const contentFrom = async (b: DayBody, userId: unknown) => ({
    recipientName: line(b.recipientName, VW_LIMITS.name),
    senderName: line(b.senderName, VW_LIMITS.name),
    petName: line(b.petName, VW_LIMITS.petName),
    letter: str(b.letter, day.letterMax),
    photos: await photosFrom(b.photos, userId),
    gifs: sanitizeGifSlots(slug, b.gifs),
    ...sanitizeMusic(b),
    endLine: line(b.endLine, VW_LIMITS.endLine),
    extras: sanitizeExtras(slug, b.extras),
  });

  const reactionsOf = (page: IValentineDayPage): ReactionsView => {
    const r = (page.reactions ?? {}) as Record<string, unknown>;
    return {
      openedAt: (r.openedAt as Date) ?? null,
      completedAt: (r.completedAt as Date) ?? null,
      answer: r.answer === "yes" ? "yes" : null,
      answeredAt: (r.answeredAt as Date) ?? null,
      noDodges: typeof r.noDodges === "number" ? r.noDodges : null,
      count: typeof r.count === "number" ? r.count : null,
    };
  };

  const create = async (req: Request, res: Response): Promise<void> => {
    try {
      const b = (req.body ?? {}) as DayBody;
      const page = await Model.create({
        userId: req.userId,
        ...(await contentFrom(b, req.userId)),
        password: str(b.password, VW_LIMITS.password),
      });
      res.status(201).json({ success: true, data: page });
    } catch (error) {
      console.error(`Create ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to create page" });
    }
  };

  const getMy = async (req: Request, res: Response): Promise<void> => {
    try {
      const pages = await Model.find({ userId: req.userId }).sort({ updatedAt: -1 });
      res.json({ success: true, data: pages });
    } catch (error) {
      console.error(`Get my ${label}s error:`, error);
      res.status(500).json({ success: false, error: "Failed to fetch pages" });
    }
  };

  /** The owner's own copy — the only place `reactions` is ever returned. */
  const get = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await Model.findOne({ _id: req.params.id, userId: req.userId });
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      const pageObj = page.toObject() as unknown as Record<string, unknown>;
      pageObj.reactions = reactionsOf(page);
      if (page.isPublished) pageObj.shareUrl = await shareUrlFor(page.shareId, String(req.userId));
      res.json({ success: true, data: pageObj });
    } catch (error) {
      console.error(`Get ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to fetch page" });
    }
  };

  const update = async (req: Request, res: Response): Promise<void> => {
    try {
      const b = (req.body ?? {}) as DayBody;
      const page = await Model.findOne({ _id: req.params.id, userId: req.userId });
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

      if (b.recipientName !== undefined) page.recipientName = line(b.recipientName, VW_LIMITS.name);
      if (b.senderName !== undefined) page.senderName = line(b.senderName, VW_LIMITS.name);
      if (b.petName !== undefined) page.petName = line(b.petName, VW_LIMITS.petName);
      if (b.letter !== undefined) page.letter = str(b.letter, day.letterMax);
      if (b.photos !== undefined) page.photos = await photosFrom(b.photos, req.userId);
      if (b.gifs !== undefined) { page.gifs = sanitizeGifSlots(slug, b.gifs); page.markModified("gifs"); }
      if (b.music !== undefined || b.musicMode !== undefined || b.musicYoutubeId !== undefined || b.musicStart !== undefined) {
        const m = sanitizeMusic(b, {
          music: page.music !== false,
          // A page saved before musicMode existed hydrates the "melody" default
          // even when its music was off — the boolean wins for those.
          musicMode: page.music === false ? "off" : page.musicMode ?? "melody",
          musicYoutubeId: page.musicYoutubeId ?? "",
          musicStart: page.musicStart ?? 0,
        });
        page.music = m.music;
        page.musicMode = m.musicMode;
        page.musicYoutubeId = m.musicYoutubeId;
        page.musicStart = m.musicStart;
      }
      if (b.endLine !== undefined) page.endLine = line(b.endLine, VW_LIMITS.endLine);
      if (b.extras !== undefined) { page.extras = sanitizeExtras(slug, b.extras); page.markModified("extras"); }
      // Empty password on update means "unchanged", not "remove the gate".
      if (b.password !== undefined && str(b.password, VW_LIMITS.password) !== "") {
        applyPagePassword(page, b.password, VW_LIMITS.password);
      }

      await page.save();
      res.json({ success: true, data: page });
    } catch (error) {
      console.error(`Update ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to update page" });
    }
  };

  const publish = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await Model.findOne({ _id: req.params.id, userId: req.userId });
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

      const gate = await checkPublishAccess({ req,
        userId: String(req.userId),
        templateType: slug,
        pageId: String(page._id),
        isAlreadyPublished: !!page.isPublished,
      });
      if (!gate.allowed) {
        res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
        return;
      }

      page.isPublished = true;
      await page.save();

      const shareUrl = await shareUrlFor(page.shareId, String(req.userId));
      res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
    } catch (error) {
      console.error(`Publish ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to publish page" });
    }
  };

  const getShared = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await Model.findOneAndUpdate(
        { shareId: req.params.shareId, isPublished: true },
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      const safeData = projectValentineShared(page.toObject() as unknown as Record<string, unknown>);
      res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: slug });
    } catch (error) {
      console.error(`Get shared ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to fetch page" });
    }
  };

  const verify = async (req: Request, res: Response): Promise<void> => {
    try {
      const { password } = req.body ?? {};
      const page = await Model.findOne({ shareId: req.params.shareId, isPublished: true });
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      if (!page.password) { res.json({ success: true, verified: true }); return; }
      const match = await page.comparePassword(typeof password === "string" ? password : "");
      if (match) res.json({ success: true, verified: true });
      else res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    } catch (error) {
      console.error(`Verify ${label} password error:`, error);
      res.status(500).json({ success: false, error: "Verification failed" });
    }
  };

  const remove = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await Model.findOneAndDelete({ _id: req.params.id, userId: req.userId });
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      res.json({ success: true, message: "Page deleted successfully" });
    } catch (error) {
      console.error(`Delete ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to delete page" });
    }
  };

  /**
   * POST /share/:shareId/react — the recipient's beacon. Public, published
   * pages only, rate-limited at the route.
   *
   * Body: `{ event: "opened" | "completed" | "answered", noDodges?, count? }`.
   * Every event is first-wins (see reactionWrite): the atomic update only
   * matches while that event's field is still unset, so replays, a second tab or
   * a forwarded link change nothing. An "answered" that actually lands emails
   * the owner on the question days — exactly once.
   *
   * The response says only whether this call recorded something. It never
   * echoes the reactions: those are the sender's, and the getShared payload
   * strips them too.
   *
   * The owner opening their own link (signed in, via optionalAuth) is not a
   * reaction and is not recorded.
   */
  const react = async (req: Request, res: Response): Promise<void> => {
    try {
      const event = String(req.body?.event || "") as ReactionEvent;
      if (!REACTION_EVENTS.includes(event)) {
        res.status(400).json({ success: false, error: "Unknown event" });
        return;
      }
      const shareId = String(req.params.shareId || "");
      const page = await Model.findOne({ shareId, isPublished: true }).select("userId shareId recipientName senderName extras");
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      if (req.userId && String(req.userId) === String(page.userId)) {
        res.json({ success: true, recorded: false, reason: "owner" });
        return;
      }

      const { guard, set } = reactionWrite(event, req.body ?? {}, new Date());
      const result = await Model.updateOne({ _id: page._id, isPublished: true, ...guard }, { $set: set });
      const recorded = (result?.modifiedCount ?? 0) > 0;

      if (recorded && event === "answered" && day.asksQuestion) {
        // Tell the sender. Never blocks the recipient's celebration.
        void (async () => {
          try {
            const to = await ownerEmail(page.userId);
            if (!to) return;
            const extras = (page.extras ?? {}) as Record<string, unknown>;
            await sendAnswer({
              to,
              senderName: page.senderName,
              recipientName: page.recipientName,
              dayName: DAY_NAMES[slug],
              question: typeof extras.question === "string" ? extras.question : "",
              noDodges: typeof set["reactions.noDodges"] === "number" ? (set["reactions.noDodges"] as number) : 0,
              link: await shareUrlFor(page.shareId, String(page.userId)),
            });
          } catch (err) {
            console.error(`${label} answer email error:`, err);
          }
        })();
      }

      res.json({ success: true, recorded });
    } catch (error) {
      console.error(`React ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to record" });
    }
  };

  return { create, getMy, get, update, publish, getShared, verify, delete: remove, react };
}

