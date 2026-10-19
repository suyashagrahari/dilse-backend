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
import { LOVE_LIMITS, sanitizeLovePhotos, userPhotoFolder } from "../utils/loveMedia";
import { sendValentineAnswerEmail, sendValentineReplyEmail } from "../utils/mailer";
import { resolvePremiumVoice, type AudioUploader } from "../utils/premiumVoice";
import {
  PREMIUM_BASE,
  PREMIUM_DAY_SLUGS,
  REACTION_EVENTS,
  VALENTINE_DAYS,
  VW_LIMITS,
  cleanReplyText,
  isPremiumDaySlug,
  isPremiumLocked,
  answerAllows,
  parseAnswer,
  reactionWrite,
  replyWrite,
  sanitizeExtras,
  sanitizeGifSlots,
  sanitizeMusic,
  sanitizePremium,
  type BaseDaySlug,
  type PremiumFields,
  type ReactionEvent,
  type ValentineDaySlug,
} from "../config/valentineDays";

const BASE_DAY_NAMES: Record<BaseDaySlug, string> = {
  "happy-rose-day": "Rose Day",
  "happy-propose-day": "Propose Day",
  "happy-chocolate-day": "Chocolate Day",
  "happy-teddy-day": "Teddy Day",
  "happy-promise-day": "Promise Day",
  "happy-hug-day": "Hug Day",
  "happy-kiss-day": "Kiss Day",
  "happy-valentines-day": "Valentine's Day",
  "happy-halloween": "Halloween",
  "dandiya-partner": "Dandiya invitation",
  "happy-diwali": "Diwali",
  sorry: "Sorry",
  "happy-birthday": "Birthday",
  "birthday-premium": "Birthday",
  "miss-you": "Miss You",
  "miss-you-premium": "Miss You ✦ Premium",
  "will-you-be-mine": "Proposal",
  "sorry-premium": "Sorry",
  "proposal-premium": "Proposal",
  "happy-anniversary": "Anniversary",
  "anniversary-premium": "Anniversary",
  "digital-bouquet": "Digital Bouquet",
  "wedding-invitation": "Wedding Invitation",
};

/** A premium day's emails use its base day's plain name ("Rose Day"). */
const DAY_NAMES: Record<ValentineDaySlug, string> = {
  ...BASE_DAY_NAMES,
  ...(Object.fromEntries(PREMIUM_DAY_SLUGS.map((s) => [s, BASE_DAY_NAMES[PREMIUM_BASE[s]]])) as Record<
    (typeof PREMIUM_DAY_SLUGS)[number],
    string
  >),
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
  /** Premium slugs only; ignored on a $2 slug. */
  premium?: unknown;
};

/** The owner-visible, never-public reaction summary. */
export type ReactionsView = {
  openedAt: Date | null;
  completedAt: Date | null;
  answer: "yes" | "no" | null;
  answeredAt: Date | null;
  noDodges: number | null;
  count: number | null;
  /** Premium slugs only (the key is absent on a $2 page). */
  reply?: { text: string; at: Date | null } | null;
};

/**
 * Strip what a recipient must never receive. Used by getShared AND the generic resolver.
 * `userId` goes too: the viewer never reads it (fromDb ignores it), and the
 * generic resolver takes the owner from the document, not from this object.
 *
 * Premium pages (by `day`) additionally:
 *  - while `premium.unlockAt` is in the future and the viewer is not the
 *    owner, return ONLY a teaser — names, the unlock instant and `locked: true`;
 *    no letter, photos, GIFs, extras, music, voice, end line or P.S.;
 *  - otherwise carry `locked: false` and `replySent` — the one reaction bit a
 *    recipient may see (so a reloaded page does not offer the reply box again).
 * A $2 page comes back exactly as before: no `premium`, `locked` or `replySent` keys added.
 */
export function projectValentineShared(
  data: Record<string, unknown>,
  opts: { now?: Date; viewerId?: string | null } = {}
): Record<string, unknown> {
  const { reactions, password: _pw, passwordRaw: _pr, userId, ...rest } = data;
  const isOwner = !!opts.viewerId && userId != null && String(userId) === String(opts.viewerId);
  // The signed-in sender opening their own link sees how it went (an owner
  // banner on the page). Never present for anyone else.
  const owner = isOwner ? { ownerView: ownerViewOf(reactions) } : {};
  if (!isPremiumDaySlug(rest.day)) return { ...rest, ...owner };

  const premium = (rest.premium ?? {}) as Partial<PremiumFields>;
  if (!isOwner && isPremiumLocked(premium, opts.now ?? new Date())) {
    return {
      _id: rest._id,
      shareId: rest.shareId,
      day: rest.day,
      recipientName: rest.recipientName,
      senderName: rest.senderName,
      petName: rest.petName,
      isPublished: rest.isPublished,
      createdAt: rest.createdAt,
      locked: true,
      premium: { unlockAt: premium.unlockAt ?? "", unlockTz: premium.unlockTz ?? "" },
    };
  }
  const reply = (reactions as { reply?: unknown } | undefined)?.reply;
  return { ...rest, ...owner, locked: false, replySent: !!(reply && typeof reply === "object") };
}

/** The owner banner's slice of the reactions: seen / answered (yes or no) and when. */
export function ownerViewOf(reactions: unknown): {
  openedAt: Date | null;
  answer: "yes" | "no" | null;
  answeredAt: Date | null;
  noDodges: number | null;
} {
  const r = reactions && typeof reactions === "object" ? (reactions as Record<string, unknown>) : {};
  return {
    openedAt: (r.openedAt as Date) ?? null,
    answer: r.answer === "yes" || r.answer === "no" ? r.answer : null,
    answeredAt: (r.answeredAt as Date) ?? null,
    noDodges: typeof r.noDodges === "number" ? r.noDodges : null,
  };
}

/** Injected in tests; the defaults are the real things. */
export interface ValentineControllerDeps {
  model?: mongoose.Model<IValentineDayPage>;
  findOwnerEmail?: (userId: unknown) => Promise<string | null>;
  sendAnswerEmail?: typeof sendValentineAnswerEmail;
  sendReplyEmail?: typeof sendValentineReplyEmail;
  buildShareUrl?: (shareId: string, userId: string) => Promise<string>;
  /** Premium voice-note uploader (S3 in production). */
  uploadAudio?: AudioUploader;
  now?: () => Date;
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
  const sendReply = deps.sendReplyEmail ?? sendValentineReplyEmail;
  const nowFn = deps.now ?? (() => new Date());
  const isPremium = isPremiumDaySlug(slug);
  const label = `${slug} page`;

  /**
   * Photos: inline data URLs from the editor are uploaded to S3 by
   * sanitizeLovePhotos (which calls uploadImageDataUrl per photo) BEFORE any
   * cap is applied; only the CDN link is stored. Capped to the day's own max
   * (the shared ten is the scan ceiling for $2 days, as before; premium keeps 12).
   */
  const photosFrom = async (raw: unknown, userId: unknown) =>
    (await sanitizeLovePhotos(raw, userPhotoFolder(slug, userId), Math.max(LOVE_LIMITS.maxPhotos, day.maxPhotos))).slice(
      0,
      day.maxPhotos
    );

  /**
   * Premium only. `prev` is the stored sub-document on update. A voiceNote in
   * the body (data URL or https) goes through resolvePremiumVoice; a body
   * without one keeps the stored link.
   */
  const premiumFrom = async (raw: unknown, userId: unknown, prev?: Partial<PremiumFields> | null): Promise<PremiumFields> => {
    const p = sanitizePremium(raw, prev, nowFn());
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    if (src.voiceNote !== undefined) p.voiceNote = await resolvePremiumVoice(src.voiceNote, userId, slug, deps.uploadAudio);
    return p;
  };

  /** Every content field the form owns, sanitised. Async only because of photos (and the voice note). */
  const contentFrom = async (b: DayBody, userId: unknown) => ({
    recipientName: line(b.recipientName, VW_LIMITS.name),
    senderName: line(b.senderName, VW_LIMITS.name),
    petName: line(b.petName, VW_LIMITS.petName),
    letter: str(b.letter, day.letterMax),
    photos: await photosFrom(b.photos, userId),
    gifs: sanitizeGifSlots(slug, b.gifs),
    ...sanitizeMusic(b, undefined, { track: !!day.musicTrack }),
    endLine: line(b.endLine, VW_LIMITS.endLine),
    extras: sanitizeExtras(slug, b.extras),
    // Never written for a $2 slug — its documents carry no `premium` key at all.
    ...(isPremium ? { premium: await premiumFrom(b.premium, userId) } : {}),
  });

  const reactionsOf = (page: IValentineDayPage): ReactionsView => {
    const r = (page.reactions ?? {}) as Record<string, unknown>;
    const view: ReactionsView = {
      openedAt: (r.openedAt as Date) ?? null,
      completedAt: (r.completedAt as Date) ?? null,
      answer: r.answer === "yes" || r.answer === "no" ? r.answer : null,
      answeredAt: (r.answeredAt as Date) ?? null,
      noDodges: typeof r.noDodges === "number" ? r.noDodges : null,
      count: typeof r.count === "number" ? r.count : null,
    };
    if (isPremium) {
      const reply = r.reply as { text?: unknown; at?: unknown } | null | undefined;
      view.reply =
        reply && typeof reply.text === "string" && reply.text
          ? { text: reply.text, at: reply.at instanceof Date ? reply.at : reply.at ? new Date(String(reply.at)) : null }
          : null;
    }
    return view;
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
        }, { track: !!day.musicTrack });
        page.music = m.music;
        page.musicMode = m.musicMode;
        page.musicYoutubeId = m.musicYoutubeId;
        page.musicStart = m.musicStart;
      }
      if (b.endLine !== undefined) page.endLine = line(b.endLine, VW_LIMITS.endLine);
      if (b.extras !== undefined) { page.extras = sanitizeExtras(slug, b.extras); page.markModified("extras"); }
      if (isPremium && b.premium !== undefined) {
        const stored = page.premium as unknown as { toObject?: () => PremiumFields } | PremiumFields | undefined;
        const prev = stored && typeof (stored as { toObject?: unknown }).toObject === "function"
          ? (stored as { toObject: () => PremiumFields }).toObject()
          : (stored as PremiumFields | undefined);
        page.premium = await premiumFrom(b.premium, req.userId, prev);
        page.markModified("premium");
      }
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
      // optionalAuth on the route: the signed-in owner sees their own sealed page.
      const safeData = projectValentineShared(page.toObject() as unknown as Record<string, unknown>, {
        now: nowFn(),
        viewerId: req.userId ? String(req.userId) : null,
      });
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
   * Body: `{ event: "opened" | "completed" | "answered", noDodges?, count?, answer? }`.
   * `answer` is "yes" (the default — every older client) or "no"; a "no" is
   * refused (400) unless the sender chose "Yes or No" (extras.answerMode
   * "noAfterTries"). Yes and no share ONE first-wins slot: whichever lands
   * first is the answer.
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
      const answer = event === "answered" ? parseAnswer(req.body?.answer) : "yes";
      if (!answer) {
        res.status(400).json({ success: false, error: "Unknown answer" });
        return;
      }
      const shareId = String(req.params.shareId || "");
      const page = await Model.findOne({ shareId, isPublished: true }).select("userId shareId recipientName senderName extras");
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      if (req.userId && String(req.userId) === String(page.userId)) {
        res.json({ success: true, recorded: false, reason: "owner" });
        return;
      }

      if (event === "answered" && !answerAllows(page.extras, answer)) {
        res.status(400).json({ success: false, error: "This page only takes a yes" });
        return;
      }

      const { guard, set } = reactionWrite(event, { ...(req.body ?? {}), answer }, new Date());
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
              slug,
              question: typeof extras.question === "string" ? extras.question : "",
              answer,
              noDodges: typeof set["reactions.noDodges"] === "number" ? (set["reactions.noDodges"] as number) : 0,
              // Happy Birthday's "when?" pick (1 tonight · 2 this weekend · 3 you plan it).
              ...(typeof set["reactions.count"] === "number" ? { count: set["reactions.count"] as number } : {}),
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

  /**
   * POST /share/:shareId/reply — premium only (the route is registered only on
   * premium routers). Public, rate-limited, optionalAuth.
   *
   * Body `{ text }`. One reply per page, first write wins (replyWrite): a
   * second tab or a replay answers `recorded: false`. Refused with 403 while
   * the page is still sealed or when the sender switched replies off. The
   * response never echoes anything. A recorded reply emails the owner,
   * fire-and-forget.
   */
  const reply = async (req: Request, res: Response): Promise<void> => {
    try {
      const text = cleanReplyText(req.body?.text);
      if (!text) { res.status(400).json({ success: false, error: "Write a reply first" }); return; }

      const shareId = String(req.params.shareId || "");
      const page = await Model.findOne({ shareId, isPublished: true }).select(
        "userId shareId recipientName senderName premium"
      );
      if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
      const premium = (page.premium ?? {}) as Partial<PremiumFields>;
      if (isPremiumLocked(premium, nowFn())) {
        res.status(403).json({ success: false, error: "This page has not opened yet" });
        return;
      }
      if (premium.allowReply === false) {
        res.status(403).json({ success: false, error: "Replies are turned off for this page" });
        return;
      }
      if (req.userId && String(req.userId) === String(page.userId)) {
        res.json({ success: true, recorded: false, reason: "owner" });
        return;
      }

      const { guard, set } = replyWrite(text, nowFn());
      const result = await Model.updateOne({ _id: page._id, isPublished: true, ...guard }, { $set: set });
      const recorded = (result?.modifiedCount ?? 0) > 0;

      if (recorded) {
        void (async () => {
          try {
            const to = await ownerEmail(page.userId);
            if (!to) return;
            await sendReply({
              to,
              senderName: page.senderName,
              recipientName: page.recipientName,
              dayName: DAY_NAMES[slug],
              slug,
              reply: text,
              link: await shareUrlFor(page.shareId, String(page.userId)),
            });
          } catch (err) {
            console.error(`${label} reply email error:`, err);
          }
        })();
      }

      res.json({ success: true, recorded });
    } catch (error) {
      console.error(`Reply ${label} error:`, error);
      res.status(500).json({ success: false, error: "Failed to send reply" });
    }
  };

  return {
    create,
    getMy,
    get,
    update,
    publish,
    getShared,
    verify,
    delete: remove,
    react,
    /** Premium slugs only; undefined on a $2 controller. */
    reply: isPremium ? reply : undefined,
  };
}

