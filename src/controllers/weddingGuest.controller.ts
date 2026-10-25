// ─── Wedding guests: RSVPs + blessings (see config/weddingShared.ts) ─────────
//
// One controller per wedding slug, mounted by makeValentineDayRouter. Every
// store and side effect is injectable so the tests run without Mongo or mail.

import type { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import mongoose from "mongoose";
import { isPremiumLocked, type PremiumFields } from "../config/valentineDays";
import {
  BLESSING_LIMITS,
  RSVP_LIMITS,
  WEDDING_TIER_LIMITS,
  cleanBlessing,
  cleanRsvp,
  eventIdsOf,
  eventLabelsOf,
  ipHash,
  isWeddingSlug,
  mailPlan,
  newEditToken,
  rsvpCsv,
  rsvpTotals,
  tokenHash,
  HOUR_MS,
  type RsvpInput,
  type RsvpTotals,
} from "../config/weddingShared";
import User from "../models/User";
import { WeddingRsvp } from "../models/WeddingRsvp";
import { WeddingBlessing } from "../models/WeddingBlessing";
import { sendWeddingBlessingEmail, sendWeddingRsvpDigestEmail, sendWeddingRsvpEmail } from "../utils/mailer";

// ── The shapes the controller needs (a subset of the real documents) ────────

export interface GuestPage {
  _id: unknown;
  userId: unknown;
  shareId: string;
  recipientName: string;
  senderName: string;
  extras?: unknown;
  premium?: unknown;
  password?: string;
  comparePassword(candidate: string): Promise<boolean>;
}

export type RsvpRecord = RsvpInput & { _id: unknown; createdAt: Date; updatedAt?: Date; emailed?: boolean };
export interface BlessingRecord {
  _id: unknown;
  name: string;
  message: string;
  approved: boolean;
  createdAt: Date;
}

export interface RsvpStore {
  count(pageId: unknown): Promise<number>;
  create(doc: RsvpInput & { pageId: unknown; slug: string; tokenHash: string; ipHash: string }): Promise<RsvpRecord>;
  /** With the token hash (normally unselected). */
  findForEdit(rsvpId: string, pageId: unknown): Promise<(RsvpRecord & { tokenHash: string }) | null>;
  update(rsvpId: string, set: RsvpInput): Promise<RsvpRecord | null>;
  countSince(pageId: unknown, since: Date): Promise<number>;
  lastDigestAt(pageId: unknown): Promise<Date | null>;
  unemailed(pageId: unknown): Promise<RsvpRecord[]>;
  markEmailed(ids: unknown[], digestOn?: { id: unknown; at: Date }): Promise<void>;
  /** Oldest first. */
  all(pageId: unknown): Promise<RsvpRecord[]>;
}

export interface BlessingStore {
  count(pageId: unknown): Promise<number>;
  create(doc: { pageId: unknown; slug: string; name: string; message: string; ipHash: string }): Promise<BlessingRecord>;
  /** Newest first. */
  approved(pageId: unknown, limit: number): Promise<BlessingRecord[]>;
  all(pageId: unknown): Promise<BlessingRecord[]>;
  setApproved(blessingId: string, pageId: unknown, approved: boolean): Promise<BlessingRecord | null>;
}

export interface WeddingGuestDeps {
  findPublishedPage(shareId: string): Promise<GuestPage | null>;
  findOwnedPage(id: string, userId: unknown): Promise<GuestPage | null>;
  rsvps: RsvpStore;
  blessings: BlessingStore;
  ownerEmail(userId: unknown): Promise<string | null>;
  shareUrl(shareId: string, userId: string): Promise<string>;
  sendSingle: typeof sendWeddingRsvpEmail;
  sendDigest: typeof sendWeddingRsvpDigestEmail;
  /** Optional: the owner's mail per blessing (absent = no mail). */
  sendBlessing?: typeof sendWeddingBlessingEmail;
  now(): Date;
}

// ── Default (Mongo) implementations ─────────────────────────────────────────

const isId = (v: string) => mongoose.Types.ObjectId.isValid(v);

function mongoDeps(model: mongoose.Model<any>): WeddingGuestDeps { // eslint-disable-line @typescript-eslint/no-explicit-any
  const R = () => WeddingRsvp;
  const B = () => WeddingBlessing;
  const lean = <T>(q: { lean: () => Promise<unknown> }) => q.lean() as Promise<T>;
  return {
    findPublishedPage: (shareId) => model.findOne({ shareId, isPublished: true }),
    findOwnedPage: (id, userId) => (isId(id) ? model.findOne({ _id: id, userId }) : Promise.resolve(null)),
    rsvps: {
      count: (pageId) => R().countDocuments({ pageId }),
      create: async (doc) => (await R().create(doc)).toObject() as unknown as RsvpRecord,
      findForEdit: (id, pageId) =>
        isId(id) ? lean(R().findOne({ _id: id, pageId }).select("+tokenHash")) : Promise.resolve(null),
      update: (id, set) => lean(R().findByIdAndUpdate(id, { $set: { ...set, emailed: false } }, { new: true })),
      countSince: (pageId, since) => R().countDocuments({ pageId, updatedAt: { $gte: since } }),
      lastDigestAt: async (pageId) => {
        const d = await lean<{ digestSentAt?: Date } | null>(
          R().findOne({ pageId, digestSentAt: { $ne: null } }).sort({ digestSentAt: -1 }).select("digestSentAt"),
        );
        return d?.digestSentAt ?? null;
      },
      unemailed: (pageId) => lean(R().find({ pageId, emailed: false }).sort({ updatedAt: 1 }).limit(200)),
      markEmailed: async (ids, digestOn) => {
        await R().updateMany({ _id: { $in: ids } }, { $set: { emailed: true } });
        if (digestOn) await R().updateOne({ _id: digestOn.id }, { $set: { digestSentAt: digestOn.at } });
      },
      all: (pageId) => lean(R().find({ pageId }).sort({ createdAt: 1 }).limit(RSVP_LIMITS.maxPerPage)),
    },
    blessings: {
      count: (pageId) => B().countDocuments({ pageId }),
      create: async (doc) => (await B().create(doc)).toObject() as unknown as BlessingRecord,
      approved: (pageId, limit) => lean(B().find({ pageId, approved: true }).sort({ createdAt: -1 }).limit(limit)),
      all: (pageId) => lean(B().find({ pageId }).sort({ createdAt: -1 }).limit(BLESSING_LIMITS.maxPerPage)),
      setApproved: (id, pageId, approved) =>
        isId(id) ? lean(B().findOneAndUpdate({ _id: id, pageId }, { $set: { approved } }, { new: true })) : Promise.resolve(null),
    },
    ownerEmail: async (userId) => {
      const u = await User.findById(userId).select("email").lean<{ email?: string }>();
      return u?.email || null;
    },
    shareUrl: async (shareId, userId) => {
      const { buildShareUrl } = await import("../utils/shareUrl");
      return buildShareUrl(shareId, userId);
    },
    sendSingle: sendWeddingRsvpEmail,
    sendDigest: sendWeddingRsvpDigestEmail,
    sendBlessing: sendWeddingBlessingEmail,
    now: () => new Date(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const publicRsvp = (r: RsvpRecord) => ({
  id: String(r._id),
  guestName: r.guestName,
  phone: r.phone,
  attending: r.attending,
  guests: r.guests,
  events: r.events,
  meal: r.meal,
  message: r.message,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt ?? r.createdAt,
});

const publicBlessing = (b: BlessingRecord) => ({ id: String(b._id), name: b.name, message: b.message, createdAt: b.createdAt });

const sameToken = (token: string, hash: string): boolean => {
  const a = Buffer.from(tokenHash(token));
  const b = Buffer.from(hash || "");
  return a.length === b.length && timingSafeEqual(a, b);
};

const passwordFrom = (req: Request): string => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.password === "string") return b.password;
  const h = req.headers["x-page-password"];
  return typeof h === "string" ? h : "";
};

// ── Controller ──────────────────────────────────────────────────────────────

export function makeWeddingGuestController(slug: string, model: mongoose.Model<any> | null, overrides: Partial<WeddingGuestDeps> = {}) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!isWeddingSlug(slug)) throw new Error(`${slug} is not a wedding slug`);
  const deps: WeddingGuestDeps = { ...(model ? mongoDeps(model) : ({} as WeddingGuestDeps)), ...overrides };
  const limits = WEDDING_TIER_LIMITS[slug];
  const label = `${slug} guests`;

  /** The published page a guest may write to, or an error already sent. */
  const openPage = async (req: Request, res: Response): Promise<GuestPage | null> => {
    const page = await deps.findPublishedPage(String(req.params.shareId || ""));
    if (!page) {
      res.status(404).json({ success: false, error: "Invitation not found" });
      return null;
    }
    if (page.premium && isPremiumLocked(page.premium as Partial<PremiumFields>, deps.now())) {
      res.status(403).json({ success: false, error: "This invitation has not opened yet" });
      return null;
    }
    if (page.password && !(await page.comparePassword(passwordFrom(req)))) {
      res.status(401).json({ success: false, error: "This invitation is private — enter its password", needsPassword: true });
      return null;
    }
    return page;
  };

  const isOwner = (req: Request, page: GuestPage) => !!req.userId && String(req.userId) === String(page.userId);

  /** Tell the owner, honouring the burst throttle. Fire-and-forget. */
  const notify = (page: GuestPage, rsvp: RsvpRecord, updated: boolean) => {
    void (async () => {
      try {
        const to = await deps.ownerEmail(page.userId);
        if (!to) return;
        const now = deps.now();
        const [recentCount, lastDigestAt, all] = await Promise.all([
          deps.rsvps.countSince(page._id, new Date(now.getTime() - HOUR_MS)),
          deps.rsvps.lastDigestAt(page._id),
          deps.rsvps.all(page._id),
        ]);
        const plan = mailPlan({ recentCount, lastDigestAt, now });
        if (plan === "hold") return;
        const totals = rsvpTotals(all);
        const link = await deps.shareUrl(page.shareId, String(page.userId));
        const eventLabels = eventLabelsOf(page.extras);
        if (plan === "single") {
          await deps.sendSingle({ to, coupleA: page.recipientName, coupleB: page.senderName, rsvp, updated, totals, eventLabels, link });
          await deps.rsvps.markEmailed([rsvp._id]);
          return;
        }
        const pending = await deps.rsvps.unemailed(page._id);
        if (!pending.length) return;
        await deps.sendDigest({ to, coupleA: page.recipientName, coupleB: page.senderName, rsvps: pending, totals, eventLabels, link });
        await deps.rsvps.markEmailed(
          pending.map((r) => r._id),
          { id: rsvp._id, at: now },
        );
      } catch (err) {
        console.error(`${label} rsvp email error:`, err);
      }
    })();
  };

  /** POST /share/:shareId/rsvp */
  const createRsvp = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await openPage(req, res);
      if (!page) return;
      const clean = cleanRsvp(req.body, { eventIds: eventIdsOf(page.extras, slug), mealEnabled: !!(page.extras as { rsvpMeal?: unknown } | undefined)?.rsvpMeal });
      if (!clean.ok) { res.status(400).json({ success: false, error: clean.error }); return; }
      if (clean.spam) {
        // Look exactly like success; store nothing.
        res.json({ success: true, rsvpId: "0".repeat(24), editToken: newEditToken(), rsvp: clean.value });
        return;
      }
      if ((await deps.rsvps.count(page._id)) >= RSVP_LIMITS.maxPerPage) {
        res.status(409).json({ success: false, error: "This invitation has stopped taking RSVPs online — please tell the family directly." });
        return;
      }
      const editToken = newEditToken();
      const saved = await deps.rsvps.create({
        ...clean.value,
        pageId: page._id,
        slug,
        tokenHash: tokenHash(editToken),
        ipHash: ipHash(req.ip, String(page._id)),
      });
      if (!isOwner(req, page)) notify(page, saved, false);
      res.status(201).json({ success: true, rsvpId: String(saved._id), editToken, rsvp: publicRsvp(saved) });
    } catch (error) {
      console.error(`Create ${label} rsvp error:`, error);
      res.status(500).json({ success: false, error: "Could not send your RSVP — please try again" });
    }
  };

  /** PUT /share/:shareId/rsvp/:rsvpId — "edit my response" with the token from the first answer. */
  const updateRsvp = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await openPage(req, res);
      if (!page) return;
      const token = String(req.headers["x-rsvp-token"] || (req.body as { editToken?: unknown })?.editToken || "");
      const existing = token ? await deps.rsvps.findForEdit(String(req.params.rsvpId || ""), page._id) : null;
      if (!existing || !sameToken(token, existing.tokenHash)) {
        res.status(403).json({ success: false, error: "That response can only be changed from the phone that sent it" });
        return;
      }
      const clean = cleanRsvp(req.body, { eventIds: eventIdsOf(page.extras, slug), mealEnabled: !!(page.extras as { rsvpMeal?: unknown } | undefined)?.rsvpMeal });
      if (!clean.ok) { res.status(400).json({ success: false, error: clean.error }); return; }
      const saved = await deps.rsvps.update(String(existing._id), clean.value);
      if (!saved) { res.status(404).json({ success: false, error: "Response not found" }); return; }
      if (!isOwner(req, page)) notify(page, saved, true);
      res.json({ success: true, rsvpId: String(saved._id), rsvp: publicRsvp(saved) });
    } catch (error) {
      console.error(`Update ${label} rsvp error:`, error);
      res.status(500).json({ success: false, error: "Could not update your RSVP — please try again" });
    }
  };

  /** POST /share/:shareId/blessing — tiers with `blessings` only. */
  const createBlessing = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!limits.blessings) { res.status(404).json({ success: false, error: "Not found" }); return; }
      const page = await openPage(req, res);
      if (!page) return;
      const clean = cleanBlessing(req.body);
      if (!clean.ok) { res.status(400).json({ success: false, error: clean.error }); return; }
      if (clean.spam) {
        res.status(201).json({ success: true, blessing: { id: "0".repeat(24), ...clean.value, createdAt: deps.now() } });
        return;
      }
      if ((await deps.blessings.count(page._id)) >= BLESSING_LIMITS.maxPerPage) {
        res.status(409).json({ success: false, error: "The blessings wall is full — thank you for the love!" });
        return;
      }
      const saved = await deps.blessings.create({ ...clean.value, pageId: page._id, slug, ipHash: ipHash(req.ip, String(page._id)) });
      res.status(201).json({ success: true, blessing: publicBlessing(saved) });
      // The couple keeps every blessing: one mail each (fire-and-forget).
      const send = deps.sendBlessing;
      if (send) {
        void (async () => {
          try {
            const to = await deps.ownerEmail(page.userId);
            if (!to) return;
            const link = await deps.shareUrl(page.shareId, String(page.userId));
            await send({ to, coupleA: page.recipientName, coupleB: page.senderName, name: saved.name, message: saved.message, link });
          } catch (err) {
            console.error(`${label} blessing email error:`, err);
          }
        })();
      }
    } catch (error) {
      console.error(`Create ${label} blessing error:`, error);
      res.status(500).json({ success: false, error: "Could not post your blessing — please try again" });
    }
  };

  /** GET /share/:shareId/blessings — approved only, newest first. Password via X-Page-Password. */
  const listBlessings = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!limits.blessings) { res.status(404).json({ success: false, error: "Not found" }); return; }
      const page = await openPage(req, res);
      if (!page) return;
      const list = await deps.blessings.approved(page._id, BLESSING_LIMITS.publicPage);
      res.set("Cache-Control", "no-store");
      res.json({ success: true, blessings: list.map(publicBlessing) });
    } catch (error) {
      console.error(`List ${label} blessings error:`, error);
      res.status(500).json({ success: false, error: "Could not load blessings" });
    }
  };

  // ── Owner ────────────────────────────────────────────────────────────────

  const ownedPage = async (req: Request, res: Response): Promise<GuestPage | null> => {
    const page = await deps.findOwnedPage(String(req.params.id || ""), req.userId);
    if (!page) res.status(404).json({ success: false, error: "Page not found" });
    return page;
  };

  /** GET /:id/guests — { rsvps (newest first), totals, eventLabels, blessings (all, newest first) }. */
  const ownerGuests = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await ownedPage(req, res);
      if (!page) return;
      const [rsvps, blessings] = await Promise.all([
        deps.rsvps.all(page._id),
        limits.blessings ? deps.blessings.all(page._id) : Promise.resolve([] as BlessingRecord[]),
      ]);
      const totals: RsvpTotals = rsvpTotals(rsvps);
      res.set("Cache-Control", "no-store");
      res.json({
        success: true,
        data: {
          rsvps: rsvps.map(publicRsvp).reverse(),
          totals,
          eventLabels: eventLabelsOf(page.extras),
          blessings: blessings.map((b) => ({ ...publicBlessing(b), approved: b.approved })),
          features: { rsvpPerEvent: limits.rsvpPerEvent, blessings: limits.blessings },
        },
      });
    } catch (error) {
      console.error(`Owner ${label} error:`, error);
      res.status(500).json({ success: false, error: "Could not load guests" });
    }
  };

  /** GET /:id/guests.csv */
  const ownerCsv = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await ownedPage(req, res);
      if (!page) return;
      const rsvps = await deps.rsvps.all(page._id);
      const names = [page.recipientName, page.senderName].filter(Boolean).join("-").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "wedding";
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="rsvps-${names}.csv"`);
      res.set("Cache-Control", "no-store");
      res.send(rsvpCsv(rsvps, eventLabelsOf(page.extras)));
    } catch (error) {
      console.error(`Owner ${label} csv error:`, error);
      res.status(500).json({ success: false, error: "Could not export RSVPs" });
    }
  };

  /** PATCH /:id/blessings/:blessingId { approved } */
  const ownerModerate = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await ownedPage(req, res);
      if (!page) return;
      const approved = (req.body as { approved?: unknown } | undefined)?.approved;
      if (typeof approved !== "boolean") { res.status(400).json({ success: false, error: "approved must be true or false" }); return; }
      const b = await deps.blessings.setApproved(String(req.params.blessingId || ""), page._id, approved);
      if (!b) { res.status(404).json({ success: false, error: "Blessing not found" }); return; }
      res.json({ success: true, blessing: { ...publicBlessing(b), approved: b.approved } });
    } catch (error) {
      console.error(`Owner ${label} moderate error:`, error);
      res.status(500).json({ success: false, error: "Could not update the blessing" });
    }
  };

  return { createRsvp, updateRsvp, createBlessing, listBlessings, ownerGuests, ownerCsv, ownerModerate };
}
