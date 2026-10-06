// The wishlist sale countdown: one public read for the banners, and the super
// admin's start / stop. See config/promoMath.ts for what "live" means.

import { Request, Response } from "express";
import PromoCampaign from "../models/PromoCampaign";
import Wishlist, { WISHLIST_CAMPAIGNS } from "../models/Wishlist";
import { isPromoLive, isPromoEnded, parseStartInput, endsAtFrom } from "../config/promoMath";
import { audit } from "../services/adminAudit";

const WISHLIST_PATHS: Record<string, string> = { "valentine-2027": "/valentine-wishlist" };

// Every blog view asks for this, so it is answered from memory. Fifteen seconds
// is the most a start or stop takes to reach visitors — and a stop clears it at
// once on this instance. An ended countdown needs no invalidation: `endsAt`
// travels with the answer and the browser hides the banner on the second.
const CACHE_MS = 15_000;
let cache: { at: number; body: unknown } | null = null;
export function invalidatePromoCache(): void {
  cache = null;
}

async function buildActive() {
  const now = new Date();
  const rows = await PromoCampaign.find({ enabled: true, endsAt: { $gt: now } }).sort({ endsAt: 1 }).lean();
  const row = rows.find((r) => WISHLIST_CAMPAIGNS[r.campaign] && isPromoLive(r, now));
  if (!row) return { active: false as const };
  const config = WISHLIST_CAMPAIGNS[row.campaign];
  const joined = await Wishlist.countDocuments({ campaign: row.campaign });
  return {
    active: true as const,
    campaign: row.campaign,
    label: config.label,
    discountPercent: config.discountPercent,
    path: WISHLIST_PATHS[row.campaign] ?? "/",
    style: row.style,
    runNumber: row.runNumber,
    endsAt: row.endsAt,
    joined,
  };
}

/** GET /promo/active — public. What the banners render, or `{ active: false }`. */
export const getActivePromo = async (_req: Request, res: Response): Promise<void> => {
  try {
    const cachedEnd = (cache?.body as { endsAt?: Date } | undefined)?.endsAt;
    // Rebuilt when stale — or the moment the cached countdown runs out, so the
    // server never says "live" for a sale that has ended.
    if (!cache || Date.now() - cache.at > CACHE_MS || (cachedEnd && new Date(cachedEnd).getTime() <= Date.now())) {
      cache = { at: Date.now(), body: await buildActive() };
    }
    res.set("Cache-Control", "public, max-age=15");
    // serverNow lets the browser correct for a wrong device clock, so a phone
    // set to tomorrow does not show the sale as over.
    res.json({ success: true, data: { ...(cache.body as object), serverNow: new Date() } });
  } catch (error) {
    console.error("Promo active error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};

function campaignOf(req: Request): string | null {
  const c = String(req.params.campaign || "");
  return WISHLIST_CAMPAIGNS[c] ? c : null;
}

async function adminView(campaign: string) {
  const row = await PromoCampaign.findOne({ campaign }).lean();
  const now = new Date();
  const since = row?.startedAt ?? null;
  const [total, duringRun, bySource] = await Promise.all([
    Wishlist.countDocuments({ campaign }),
    since ? Wishlist.countDocuments({ campaign, createdAt: { $gte: since } }) : Promise.resolve(0),
    since
      ? Wishlist.aggregate<{ _id: string | null; n: number }>([
          { $match: { campaign, createdAt: { $gte: since } } },
          { $group: { _id: "$source", n: { $sum: 1 } } },
          { $sort: { n: -1 } },
        ])
      : Promise.resolve([]),
  ]);
  return {
    campaign,
    label: WISHLIST_CAMPAIGNS[campaign].label,
    discountPercent: WISHLIST_CAMPAIGNS[campaign].discountPercent,
    enabled: Boolean(row?.enabled),
    live: isPromoLive(row, now),
    ended: isPromoEnded(row, now),
    startedAt: row?.startedAt ?? null,
    endsAt: row?.endsAt ?? null,
    durationHours: row?.durationHours ?? 240,
    style: row?.style ?? "sale",
    runNumber: row?.runNumber ?? 0,
    updatedByEmail: row?.updatedByEmail ?? "",
    serverNow: now,
    stats: { total, duringRun, bySource: bySource.map((s) => ({ source: s._id || "unknown", n: s.n })) },
  };
}

/** GET /admin/promo/:campaign — super admin. */
export const getPromoAdmin = async (req: Request, res: Response): Promise<void> => {
  const campaign = campaignOf(req);
  if (!campaign) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  try {
    res.json({ success: true, data: await adminView(campaign) });
  } catch (error) {
    console.error("Promo admin error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};

/**
 * POST /admin/promo/:campaign/start — super admin. Starts a fresh countdown
 * from now. Also how a running or ended one is restarted: the new end time
 * replaces the old, and the run number goes up.
 */
export const startPromo = async (req: Request, res: Response): Promise<void> => {
  const campaign = campaignOf(req);
  if (!campaign) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  const input = parseStartInput(req.body);
  if ("error" in input) {
    res.status(400).json({ success: false, error: input.error });
    return;
  }
  try {
    const before = await PromoCampaign.findOne({ campaign }).lean();
    const now = new Date();
    const endsAt = endsAtFrom(now, input.durationHours);
    await PromoCampaign.updateOne(
      { campaign },
      {
        $set: {
          enabled: true, startedAt: now, endsAt, durationHours: input.durationHours,
          style: input.style, updatedByEmail: req.userEmail || "",
        },
        $inc: { runNumber: 1 },
      },
      { upsert: true }
    );
    invalidatePromoCache();
    await audit(req, {
      action: "promo.start",
      reason: `${campaign}: ${input.style}, ${input.durationHours}h, ends ${endsAt.toISOString()}`,
      changes: {
        enabled: { from: Boolean(before?.enabled), to: true },
        endsAt: { from: before?.endsAt ?? null, to: endsAt },
        style: { from: before?.style ?? null, to: input.style },
      },
    });
    res.json({ success: true, data: await adminView(campaign) });
  } catch (error) {
    console.error("Promo start error:", error);
    res.status(500).json({ success: false, error: "Failed to start" });
  }
};

/** POST /admin/promo/:campaign/stop — super admin. Banners vanish everywhere. */
export const stopPromo = async (req: Request, res: Response): Promise<void> => {
  const campaign = campaignOf(req);
  if (!campaign) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  try {
    const before = await PromoCampaign.findOne({ campaign }).lean();
    await PromoCampaign.updateOne(
      { campaign },
      { $set: { enabled: false, updatedByEmail: req.userEmail || "" } },
      { upsert: true }
    );
    invalidatePromoCache();
    await audit(req, {
      action: "promo.stop",
      reason: `${campaign}: switched off`,
      changes: { enabled: { from: Boolean(before?.enabled), to: false } },
    });
    res.json({ success: true, data: await adminView(campaign) });
  } catch (error) {
    console.error("Promo stop error:", error);
    res.status(500).json({ success: false, error: "Failed to stop" });
  }
};
