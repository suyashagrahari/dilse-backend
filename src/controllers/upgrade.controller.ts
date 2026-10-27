// ─── Free → premium upgrade offer ────────────────────────────────────────────
//
//   GET  /upgrade/:from/offer     is the offer on, and what premium costs THIS visitor
//   POST /upgrade/:from/convert   their free page → a premium draft (AI-written)
//   POST /upgrade/:from/events    one funnel step (shown, try_clicked, …)
//
//   GET  /admin/super/upgrades           the funnel per offer, for a period
//   PUT  /admin/super/upgrades/:from     switch an offer on or off
//
// All public routes work signed out (optionalAuth): the offer can be shown
// before the visitor has an account. See config/upgradePaths.ts.

import { Request, Response } from "express";
import mongoose from "mongoose";
import { UPGRADE_EVENTS, UPGRADE_PATHS, isUpgradeEvent, upgradePathFrom } from "../config/upgradePaths";
import { isTemplateLive } from "../config/templateVisibility";
import { quoteFor } from "../services/pricingQuote.service";
import { upgradeBouquet } from "../services/bouquetUpgrade.service";
import { STORY_BUILDERS, upgradeViaStory } from "../services/storyUpgrade.service";
import UpgradeEvent from "../models/UpgradeEvent";
import UpgradeSetting from "../models/UpgradeSetting";
import User from "../models/User";
import { audit } from "../services/adminAudit";

const VISITOR_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function offerEnabled(from: string): Promise<boolean> {
  const row = await UpgradeSetting.findOne({ from }).select("enabled").lean();
  return row ? row.enabled : true;
}

async function record(from: string, event: string, req: Request, extra: { visitorId?: unknown; pageId?: unknown } = {}): Promise<void> {
  const path = upgradePathFrom(from);
  if (!path || !isUpgradeEvent(event)) return;
  const visitorId = typeof extra.visitorId === "string" && VISITOR_RE.test(extra.visitorId) ? extra.visitorId : "";
  if (!visitorId) return;
  const pageId = typeof extra.pageId === "string" && /^[a-f0-9]{24}$/i.test(extra.pageId) ? extra.pageId : "";
  const userId = req.userId && mongoose.isValidObjectId(req.userId) ? new mongoose.Types.ObjectId(req.userId) : null;
  await UpgradeEvent.create({ from, to: path.to, event, visitorId, userId, pageId });
}

export const getUpgradeOffer = async (req: Request, res: Response): Promise<void> => {
  const path = upgradePathFrom(String(req.params.from));
  if (!path) {
    res.json({ success: true, data: { enabled: false } });
    return;
  }
  try {
    const [enabled, live] = await Promise.all([offerEnabled(path.from), isTemplateLive(path.to)]);
    if (!enabled || !live) {
      res.json({ success: true, data: { enabled: false } });
      return;
    }
    const q = await quoteFor(req, path.to);
    res.json({
      success: true,
      data: {
        enabled: true,
        from: path.from,
        to: path.to,
        title: path.title,
        perks: path.perks,
        price: {
          isFree: q.pricing.isFree,
          currency: q.currency,
          final: q.pricing.finalAmount / 100,
          mrp: q.pricing.mrpAmount / 100,
          discountPercent: q.pricing.discountPercent,
          freeForViewer: q.freeForViewer,
        },
      },
    });
  } catch {
    // An offer we cannot price is an offer we do not show: the free publish goes on.
    res.json({ success: true, data: { enabled: false } });
  }
};

export const convertToPremium = async (req: Request, res: Response): Promise<void> => {
  const path = upgradePathFrom(String(req.params.from));
  if (!path || (path.from !== "bouquet-gf" && !STORY_BUILDERS[path.from])) {
    res.status(404).json({ success: false, error: "No premium version for this template." });
    return;
  }
  const body = (req.body ?? {}) as { data?: unknown; visitorId?: unknown; pageId?: unknown };
  try {
    // The bouquet maps field by field into a whole draft; the birthday pages
    // come back as a patch over the premium demo (see storyUpgrade.service).
    const data =
      path.from === "bouquet-gf"
        ? await upgradeBouquet(body.data).then((r) => ({ to: path.to, draft: r.draft, source: r.source }))
        : await upgradeViaStory(path.from, path.to, body.data).then((r) => ({ to: path.to, patch: r.patch, source: r.source }));
    void record(path.from, "preview_ready", req, body).catch(() => {});
    res.json({ success: true, data });
  } catch {
    void record(path.from, "preview_failed", req, body).catch(() => {});
    res.status(500).json({ success: false, error: "Could not prepare the premium version. Please try again." });
  }
};

export const recordUpgradeEvent = async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as { event?: unknown; visitorId?: unknown; pageId?: unknown };
  // preview_ready / preview_failed are the server's own to write.
  const event = String(body.event ?? "");
  if (event === "preview_ready" || event === "preview_failed") {
    res.status(204).end();
    return;
  }
  try {
    await record(String(req.params.from), event, req, body);
  } catch {
    // Analytics never breaks the page.
  }
  res.status(204).end();
};

// ─── Super admin ────────────────────────────────────────────────────────────

const PERIODS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

export const adminUpgradeStats = async (req: Request, res: Response): Promise<void> => {
  const days = PERIODS[String(req.query.period ?? "30d")] ?? 30;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  // ?from=<free slug> narrows the trend, the latest list and the people to one offer.
  const only = upgradePathFrom(String(req.query.from ?? ""))?.from ?? null;
  const scope = only ? { from: only } : {};
  try {
    const [byEvent, daily, recent, settings, people] = await Promise.all([
      UpgradeEvent.aggregate<{ _id: { from: string; event: string }; total: number; visitors: string[] }>([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: { from: "$from", event: "$event" }, total: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } },
      ]),
      UpgradeEvent.aggregate<{ _id: { day: string; event: string }; visitors: string[] }>([
        { $match: { createdAt: { $gte: since }, ...scope, event: { $in: ["shown", "try_clicked", "premium_published", "free_published"] } } },
        {
          $group: {
            _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, event: "$event" },
            visitors: { $addToSet: "$visitorId" },
          },
        },
      ]),
      UpgradeEvent.find({ createdAt: { $gte: since }, ...scope, event: { $in: ["try_clicked", "premium_published", "free_chosen", "back_to_free"] } })
        .sort({ createdAt: -1 })
        .limit(40)
        .select("from to event userId createdAt")
        .lean(),
      UpgradeSetting.find({}).lean(),
      // One row per signed-in person per offer: every step they reached.
      UpgradeEvent.aggregate<{ _id: { userId: mongoose.Types.ObjectId; from: string }; to: string; steps: string[]; firstAt: Date; lastAt: Date; total: number }>([
        { $match: { createdAt: { $gte: since }, userId: { $ne: null }, ...scope } },
        { $group: { _id: { userId: "$userId", from: "$from" }, to: { $first: "$to" }, steps: { $addToSet: "$event" }, firstAt: { $min: "$createdAt" }, lastAt: { $max: "$createdAt" }, total: { $sum: 1 } } },
        { $sort: { lastAt: -1 } },
        { $limit: 200 },
      ]),
    ]);

    const userIds = [...new Set([...recent.map((r) => (r.userId ? String(r.userId) : "")), ...people.map((p) => String(p._id.userId))].filter(Boolean))];
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select("name email avatar").lean() : [];
    const who = new Map(
      users.map((u) => {
        const x = u as { _id: unknown; name?: string; email?: string; avatar?: string };
        return [String(x._id), { userId: String(x._id), name: String(x.name ?? ""), email: String(x.email ?? ""), avatar: String(x.avatar ?? "") }];
      }),
    );
    const enabled = new Map(settings.map((s) => [s.from, s.enabled]));

    const offers = Object.values(UPGRADE_PATHS).map((p) => {
      const steps: Record<string, { total: number; visitors: number }> = {};
      for (const e of UPGRADE_EVENTS) steps[e] = { total: 0, visitors: 0 };
      for (const row of byEvent) if (row._id.from === p.from) steps[row._id.event] = { total: row.total, visitors: row.visitors.length };
      return { from: p.from, to: p.to, title: p.title, enabled: enabled.get(p.from) ?? true, steps };
    });

    const series: Record<string, Record<string, number>> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      series[d] = { shown: 0, try_clicked: 0, premium_published: 0, free_published: 0 };
    }
    for (const row of daily) if (series[row._id.day]) series[row._id.day][row._id.event] = row.visitors.length;

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        offers,
        daily: Object.entries(series).map(([day, v]) => ({ day, ...v })),
        people: people.map((p) => ({
          user: who.get(String(p._id.userId)) ?? { userId: String(p._id.userId), name: "", email: "", avatar: "" },
          from: p._id.from,
          to: p.to,
          steps: p.steps,
          outcome: outcomeOf(p.steps),
          firstAt: p.firstAt,
          lastAt: p.lastAt,
          total: p.total,
        })),
        recent: recent.map((r) => ({
          from: r.from,
          to: r.to,
          event: r.event,
          at: r.createdAt,
          user: r.userId ? who.get(String(r.userId)) ?? null : null,
        })),
      },
    });
  } catch {
    res.status(500).json({ success: false, error: "Could not load upgrade analytics." });
  }
};

/** Where one person's journey through an offer ended, best step first. */
function outcomeOf(steps: string[]): "premium" | "free" | "tried" | "previewed_left" | "chose_free" | "dismissed" | "saw" {
  const has = (e: string) => steps.includes(e);
  if (has("premium_published")) return "premium";
  if (has("free_published")) return "free";
  if (has("free_chosen") || has("back_to_free")) return "chose_free";
  if (has("preview_ready")) return "previewed_left";
  if (has("try_clicked")) return "tried";
  if (has("dismissed")) return "dismissed";
  return "saw";
}

/** GET /admin/super/upgrades/users/:userId — every step one person took, per offer. */
export const adminUserUpgrades = async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.params.userId);
  if (!mongoose.isValidObjectId(userId)) {
    res.status(400).json({ success: false, error: "Bad user id." });
    return;
  }
  try {
    const events = await UpgradeEvent.find({ userId }).sort({ createdAt: -1 }).limit(500).select("from to event pageId createdAt").lean();
    const byFrom = new Map<string, typeof events>();
    for (const e of events) byFrom.set(e.from, [...(byFrom.get(e.from) ?? []), e]);
    const offers = [...byFrom.entries()].map(([from, list]) => {
      const steps = [...new Set(list.map((e) => e.event))];
      const counts: Record<string, number> = {};
      for (const e of list) counts[e.event] = (counts[e.event] ?? 0) + 1;
      return {
        from,
        to: list[0].to,
        title: upgradePathFrom(from)?.title ?? list[0].to,
        steps,
        counts,
        outcome: outcomeOf(steps),
        firstAt: list[list.length - 1].createdAt,
        lastAt: list[0].createdAt,
      };
    });
    res.json({
      success: true,
      data: {
        offers,
        events: events.map((e) => ({ from: e.from, to: e.to, event: e.event, pageId: e.pageId || null, at: e.createdAt })),
      },
    });
  } catch {
    res.status(500).json({ success: false, error: "Could not load this user's upgrade journey." });
  }
};

export const adminSetUpgradeEnabled = async (req: Request, res: Response): Promise<void> => {
  const path = upgradePathFrom(String(req.params.from));
  if (!path || typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ success: false, error: "Unknown offer or missing `enabled`." });
    return;
  }
  const enabled = req.body.enabled as boolean;
  const email = String(req.userEmail ?? "");
  if (enabled) await UpgradeSetting.deleteOne({ from: path.from });
  else await UpgradeSetting.updateOne({ from: path.from }, { $set: { enabled: false, updatedByEmail: email } }, { upsert: true });
  await audit(req, { action: "template.set_upgrade_offer", targetTemplateType: path.from, changes: { enabled: { from: !enabled, to: enabled } } });
  res.json({ success: true, data: { from: path.from, enabled } });
};
