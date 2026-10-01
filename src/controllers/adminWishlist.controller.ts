// ─── /admin/wishlist — who joined which wishlist ─────────────────────────────
//
// Super-admin only. One row per join, newest first, with enough about the
// account to judge it at a glance — how they sign in, whether the address is
// proven, how many pages they've made, whether they've ever paid — and the
// numbers on top. The per-user facts come from the outreach audience (cached
// for a minute), so this page and the Outreach "joined the wishlist" filter
// always agree on who is who.

import { Request, Response } from "express";
import Wishlist, { WISHLIST_CAMPAIGNS } from "../models/Wishlist";
import User from "../models/User";
import { loadAudience } from "../services/audience.service";

const DAY = 86_400_000;

export const getWishlistJoins = async (req: Request, res: Response): Promise<void> => {
  try {
    const campaign = String(req.query.campaign || Object.keys(WISHLIST_CAMPAIGNS)[0]);
    if (!WISHLIST_CAMPAIGNS[campaign]) {
      res.status(404).json({ success: false, error: "Unknown campaign" });
      return;
    }
    const q = String(req.query.q ?? "").trim().toLowerCase().slice(0, 120);
    const provider = ["google", "local"].includes(String(req.query.provider)) ? String(req.query.provider) : "any";
    const kind = ["creators", "new", "paid"].includes(String(req.query.kind)) ? String(req.query.kind) : "any";
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit ?? "25"), 10) || 25));

    const joins = await Wishlist.find({ campaign }).sort({ createdAt: 1 }).lean();
    const ids = joins.map((j) => j.userId);
    const [users, audience] = await Promise.all([
      User.find({ _id: { $in: ids } }).select("name email avatar provider isVerified role status createdAt").lean(),
      loadAudience(),
    ]);
    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const audMap = new Map(audience.map((a) => [a.userId, a]));

    const all = joins.map((j, i) => {
      const u = userMap.get(j.userId);
      const a = audMap.get(j.userId);
      return {
        userId: j.userId,
        position: i + 1,
        joinedAt: j.createdAt,
        source: j.source || null,
        phone: j.phone || null,
        phoneCountry: j.phoneCountry || null,
        discountPercent: j.discountPercent,
        name: u?.name || a?.name || "",
        email: u?.email || j.email || "",
        avatar: u?.avatar || null,
        provider: (u?.provider as string) || "local",
        verified: Boolean(u?.isVerified) || u?.provider === "google",
        role: (u?.role as string) || "normal",
        status: (u?.status as string) || "active",
        accountCreatedAt: u?.createdAt || null,
        deleted: !u,
        pages: a?.pages || 0,
        published: a?.published || 0,
        paidOrders: a?.paidOrders || 0,
        feedbackCount: a?.feedbackCount || 0,
      };
    });

    const now = Date.now();
    const stats = {
      total: all.length,
      today: all.filter((r) => now - new Date(r.joinedAt).getTime() < DAY).length,
      last7: all.filter((r) => now - new Date(r.joinedAt).getTime() < 7 * DAY).length,
      google: all.filter((r) => r.provider === "google").length,
      verified: all.filter((r) => r.verified).length,
      withPhone: all.filter((r) => r.phone).length,
      creators: all.filter((r) => r.pages > 0).length,
      paid: all.filter((r) => r.paidOrders > 0).length,
      // Signed up within a day before joining — the wishlist brought them in.
      newSignups: all.filter((r) => r.accountCreatedAt && new Date(r.joinedAt).getTime() - new Date(r.accountCreatedAt).getTime() < DAY).length,
      sources: Object.entries(all.reduce<Record<string, number>>((m, r) => { const k = r.source || "unknown"; m[k] = (m[k] || 0) + 1; return m; }, {}))
        .map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n),
    };

    let rows = all.slice().reverse();
    if (q) rows = rows.filter((r) => r.email.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.phone || "").includes(q.replace(/\s/g, "")));
    if (provider !== "any") rows = rows.filter((r) => r.provider === provider);
    if (kind === "creators") rows = rows.filter((r) => r.pages > 0);
    if (kind === "paid") rows = rows.filter((r) => r.paidOrders > 0);
    if (kind === "new") rows = rows.filter((r) => r.accountCreatedAt && new Date(r.joinedAt).getTime() - new Date(r.accountCreatedAt).getTime() < DAY);

    res.json({
      success: true,
      data: {
        campaign,
        campaigns: Object.entries(WISHLIST_CAMPAIGNS).map(([key, c]) => ({ key, label: c.label, discountPercent: c.discountPercent })),
        stats,
        rows: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
        page,
        pages: Math.max(1, Math.ceil(rows.length / limit)),
      },
    });
  } catch (error) {
    console.error("Admin wishlist error:", error);
    res.status(500).json({ success: false, error: "Failed to load the wishlist" });
  }
};
