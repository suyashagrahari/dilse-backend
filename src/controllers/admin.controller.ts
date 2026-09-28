import { Request, Response } from "express";
import { isSuperAdminEmail } from "../config/roles";
import { invalidateUser } from "../services/accountStatus";
import { audit } from "../services/adminAudit";
import mongoose from "mongoose";
import User, { UserRole } from "../models/User";
import PageView from "../models/PageView";
import PageFeedback from "../models/PageFeedback";
import ContactInquiry from "../models/ContactInquiry";
import { sendContactReplyEmail } from "../utils/mailer";
import { TEMPLATE_LOOKUPS } from "./share.controller";
import { templateLabel } from "../config/templateCatalog";
import { hiddenSlugs } from "../config/templateVisibility";
import { parseSortOrder, sortSpec } from "../utils/listSort";

// Every template, derived from the one list that says which templates exist.
//
// This used to be a hand-written array of fourteen models with a comment asking
// the next person to keep it in sync with TEMPLATE_LOOKUPS. It had drifted to
// fourteen of forty-three: twenty-nine templates — the rakhi pair among them —
// were invisible here. Their pages were missing from the user-detail list, they
// contributed nothing to "Pages Created", they could not be deleted, and the
// popularity chart showed their raw slug instead of a name. Nothing errored,
// which is why nobody noticed.
//
// Deriving it means a template added to TEMPLATE_LOOKUPS is counted here on the
// same commit, and there is no longer a list that can be out of date.
const ALL_PAGE_MODELS = TEMPLATE_LOOKUPS.map(({ model, templateType, editorRoute }) => ({
  model,
  type: templateType,
  label: templateLabel(templateType),
  // Visibility is keyed by builder route, not by templateType, because that is
  // what the admin screen and the gate switch on. Birthday and Birthday GF share
  // a route and so share one switch — which is correct: there is one page to
  // show or hide.
  slug: editorRoute.replace(/^\//, ""),
}));

// ─── IST DAYS ───────────────────────────────────────────────────
//
// Every "day" on the admin screens is an Indian day, midnight to midnight IST.
// The server runs in UTC, so `new Date().setHours(0)` used to start "today" at
// 05:30 IST — the Analytics card and the Users "Today" filter then disagreed by
// everyone who signed up between midnight and half past five.
const TZ = "Asia/Kolkata";
const IST_DAY = /^\d{4}-\d{2}-\d{2}$/;
const istYmd = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const istMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const addDays = (ymd: string, n: number) => {
  const d = istMidnight(ymd);
  d.setUTCDate(d.getUTCDate() + n); // IST has no DST, so a day is always 24h
  return istYmd(d);
};

/** `from`/`to` (YYYY-MM-DD, IST) as a [start, end) range; `to` defaults to `from`. */
const istRange = (from?: unknown, to?: unknown): { start: Date; end: Date; from: string; to: string } | null => {
  const f = typeof from === "string" && IST_DAY.test(from) ? from : "";
  if (!f) return null;
  const t = typeof to === "string" && IST_DAY.test(to) && to >= f ? to : f;
  const start = istMidnight(f);
  const end = istMidnight(addDays(t, 1));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end, from: f, to: t };
};

/** One count per IST day in [fromYmd, toYmd], zeros filled in. */
const dailyCounts = async (model: mongoose.Model<any>, fromYmd: string, toYmd: string) => {
  const rows = (await model.aggregate([
    { $match: { createdAt: { $gte: istMidnight(fromYmd), $lt: istMidnight(addDays(toYmd, 1)) } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
  ])) as { _id: string; count: number }[];
  const by = new Map(rows.map((r) => [r._id, r.count]));
  const out: { date: string; count: number }[] = [];
  for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) out.push({ date: d, count: by.get(d) || 0 });
  return out;
};

/** 24 hourly counts for one IST day — the chart when a single day is chosen. */
const hourlyCounts = async (model: mongoose.Model<any>, ymd: string) => {
  const rows = (await model.aggregate([
    { $match: { createdAt: { $gte: istMidnight(ymd), $lt: istMidnight(addDays(ymd, 1)) } } },
    { $group: { _id: { $hour: { date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
  ])) as { _id: number; count: number }[];
  const by = new Map(rows.map((r) => [r._id, r.count]));
  return Array.from({ length: 24 }, (_, h) => ({ date: `${String(h).padStart(2, "0")}:00`, count: by.get(h) || 0 }));
};

// ─── ANALYTICS DASHBOARD ────────────────────────────────────────
//
// `from`/`to` pick the period the headline numbers, template table and device
// split describe; without them it is all time. "Today", "yesterday", the
// 7/30-day totals and the 7-day average are always sent, whatever the period,
// because they are the pulse you check every time.

export const getAnalyticsOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const todayYmd = istYmd();
    const today = istMidnight(todayYmd);
    const yesterday = istMidnight(addDays(todayYmd, -1));
    const week = istMidnight(addDays(todayYmd, -6)); // last 7 days, today included
    const month = istMidnight(addDays(todayYmd, -29));
    const range = istRange(req.query.from, req.query.to);
    const inRange = range ? { createdAt: { $gte: range.start, $lt: range.end } } : {};

    const [totalUsers, usersToday, usersYesterday, usersThisWeek, usersThisMonth, usersInPeriod] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
      User.countDocuments({ createdAt: { $gte: week } }),
      User.countDocuments({ createdAt: { $gte: month } }),
      User.countDocuments(inRange),
    ]);

    const [totalViews, viewsToday, viewsYesterday, viewsThisWeek, viewsThisMonth, viewsInPeriod] = await Promise.all([
      PageView.countDocuments(),
      PageView.countDocuments({ createdAt: { $gte: today } }),
      PageView.countDocuments({ createdAt: { $gte: yesterday, $lt: today } }),
      PageView.countDocuments({ createdAt: { $gte: week } }),
      PageView.countDocuments({ createdAt: { $gte: month } }),
      PageView.countDocuments(inRange),
    ]);

    // The 7 COMPLETE days before today. Today is still filling up, so counting
    // it would drag the average down every morning.
    const [last7Users, last7Views] = await Promise.all([
      dailyCounts(User as unknown as mongoose.Model<any>, addDays(todayYmd, -7), addDays(todayYmd, -1)),
      dailyCounts(PageView as unknown as mongoose.Model<any>, addDays(todayYmd, -7), addDays(todayYmd, -1)),
    ]);
    const avg = (xs: { count: number }[]) => Math.round((xs.reduce((a, b) => a + b.count, 0) / 7) * 10) / 10;

    // Whether each template is switched on HERE, so a row of zeros can be read.
    // Without it the table lies by omission: a hidden template shows 0/0 and
    // reads as "nobody wants this", when in fact nobody could reach it.
    const hidden = new Set(await hiddenSlugs().catch(() => []));

    // Pages per template — in the period when one is chosen.
    const templateStats = await Promise.all(
      ALL_PAGE_MODELS.map(async ({ model, type, label, slug }) => {
        const [total, published] = await Promise.all([
          (model as mongoose.Model<unknown>).countDocuments(inRange),
          (model as mongoose.Model<unknown>).countDocuments({ ...inRange, isPublished: true }),
        ]);
        return { type, label, slug, live: !hidden.has(slug), total, published };
      })
    );

    // Busiest first. With every template present this table is 43 rows long,
    // and registry order buries the ones that are actually being used.
    templateStats.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    const totalPagesCreated = templateStats.reduce((s, t) => s + t.total, 0);
    const totalPagesPublished = templateStats.reduce((s, t) => s + t.published, 0);

    const [roleDistribution, providerDistribution, deviceBreakdown] = await Promise.all([
      User.aggregate([{ $match: inRange }, { $group: { _id: "$role", count: { $sum: 1 } } }]),
      User.aggregate([{ $match: inRange }, { $group: { _id: "$provider", count: { $sum: 1 } } }]),
      PageView.aggregate([{ $match: inRange }, { $group: { _id: "$device", count: { $sum: 1 } } }]),
    ]);

    res.json({
      success: true,
      data: {
        today: todayYmd,
        period: range ? { from: range.from, to: range.to } : null,
        users: {
          total: totalUsers, today: usersToday, yesterday: usersYesterday,
          thisWeek: usersThisWeek, thisMonth: usersThisMonth, inPeriod: usersInPeriod,
        },
        pageViews: {
          total: totalViews, today: viewsToday, yesterday: viewsYesterday,
          thisWeek: viewsThisWeek, thisMonth: viewsThisMonth, inPeriod: viewsInPeriod,
        },
        last7: { users: last7Users, views: last7Views, avgUsers: avg(last7Users), avgViews: avg(last7Views) },
        pages: {
          totalCreated: totalPagesCreated,
          totalPublished: totalPagesPublished,
          // A draft is a page somebody built and did not publish — the number
          // that says where people are dropping out.
          totalDrafts: totalPagesCreated - totalPagesPublished,
        },
        templateStats,
        roleDistribution: roleDistribution.map((r) => ({ role: r._id || "normal", count: r.count })),
        providerDistribution: providerDistribution.map((r) => ({ provider: r._id || "local", count: r.count })),
        deviceBreakdown: deviceBreakdown.map((d) => ({ device: d._id || "unknown", count: d.count })),
      },
    });
  } catch (error) {
    console.error("Analytics overview error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
};

// ─── CHART DATA: users / views over time ────────────────────────
//
// `from`/`to` for a period (one day → 24 hourly points), else the last `days`
// IST days ending today.
const seriesFor = async (model: mongoose.Model<any>, req: Request) => {
  const range = istRange(req.query.from, req.query.to);
  if (range && range.from === range.to) return hourlyCounts(model, range.from);
  if (range) return dailyCounts(model, range.from, range.to);
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 365);
  const todayYmd = istYmd();
  return dailyCounts(model, addDays(todayYmd, -(days - 1)), todayYmd);
};

export const getUserGrowthChart = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await seriesFor(User as unknown as mongoose.Model<any>, req) });
  } catch (error) {
    console.error("User growth chart error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chart data" });
  }
};

export const getViewsChart = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await seriesFor(PageView as unknown as mongoose.Model<any>, req) });
  } catch (error) {
    console.error("Views chart error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chart data" });
  }
};

// ─── CHART DATA: Template popularity ────────────────────────────

export const getTemplatePopularity = async (req: Request, res: Response): Promise<void> => {
  try {
    const range = istRange(req.query.from, req.query.to);
    const data = await PageView.aggregate([
      ...(range ? [{ $match: { createdAt: { $gte: range.start, $lt: range.end } } }] : []),
      { $group: { _id: "$templateType", views: { $sum: 1 } } },
      { $sort: { views: -1 } },
    ]);

    res.json({
      success: true,
      data: data.map((d) => ({
        templateType: d._id,
        label: ALL_PAGE_MODELS.find((m) => m.type === d._id)?.label || d._id,
        views: d.views,
      })),
    });
  } catch (error) {
    console.error("Template popularity error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
};

// ─── USER MANAGEMENT ────────────────────────────────────────────

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string || "").trim();
    const roleFilter = req.query.role as string;
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const range = istRange(req.query.from, req.query.to);
    const templateType = String(req.query.template || "");
    const tpl = templateType ? ALL_PAGE_MODELS.find((m) => m.type === templateType) : undefined;

    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (roleFilter && ["normal", "member", "admin", "superadmin"].includes(roleFilter)) {
      query.role = roleFilter;
    }
    const statusFilter = req.query.status as string;
    if (statusFilter && ["active", "suspended", "banned"].includes(statusFilter)) {
      query.status = statusFilter;
    }

    // With a template, the date means "made a page of it that day"; without
    // one, it means "signed up that day".
    const templatePages = new Map<string, { count: number; last: Date }>();
    if (templateType && !tpl) {
      res.status(400).json({ success: false, error: "Unknown template" });
      return;
    }
    if (tpl) {
      const match: Record<string, unknown> = {};
      if (range) match.createdAt = { $gte: range.start, $lt: range.end };
      const rows = (await (tpl.model as mongoose.Model<unknown>).aggregate([
        { $match: match },
        { $group: { _id: "$userId", count: { $sum: 1 }, last: { $max: "$createdAt" } } },
      ])) as { _id: mongoose.Types.ObjectId | null; count: number; last: Date }[];
      for (const r of rows) if (r._id) templatePages.set(String(r._id), { count: r.count, last: r.last });
      query._id = { $in: [...templatePages.keys()].map((id) => new mongoose.Types.ObjectId(id)) };
    } else if (range) {
      query.createdAt = { $gte: range.start, $lt: range.end };
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("name email avatar provider role status statusReason suspendedUntil points isVerified createdAt")
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Did they rate anything, and how warmly — one aggregate for the page.
    const ids = users.map((u) => u._id);
    const fb = ids.length
      ? ((await PageFeedback.aggregate([
          { $match: { userId: { $in: ids } } },
          { $group: { _id: "$userId", avg: { $avg: "$rating" }, count: { $sum: 1 }, templates: { $addToSet: "$templateSlug" } } },
        ])) as { _id: mongoose.Types.ObjectId; avg: number; count: number; templates: string[] }[])
      : [];
    const fbBy = new Map(fb.map((f) => [String(f._id), f]));

    res.json({
      success: true,
      data: {
        users: users.map((u) => {
          const f = fbBy.get(String(u._id));
          const tp = templatePages.get(String(u._id));
          return {
            ...u,
            feedback: f ? { count: f.count, avg: Math.round(f.avg * 10) / 10, templates: f.templates.length } : null,
            ...(tp ? { templatePages: tp.count, templateLastAt: tp.last } : {}),
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        ...(tpl ? { template: { type: tpl.type, label: tpl.label, pages: [...templatePages.values()].reduce((a, b) => a + b.count, 0) } } : {}),
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
};

// Every template with how many distinct people made one — in the date range
// when one is given. Feeds the template filter on /admin/users.
export const getUserTemplateCounts = async (req: Request, res: Response): Promise<void> => {
  try {
    const range = istRange(req.query.from, req.query.to);
    const match: Record<string, unknown> = {};
    if (range) match.createdAt = { $gte: range.start, $lt: range.end };
    const rows = await Promise.all(
      ALL_PAGE_MODELS.map(async ({ model, type, label }) => {
        const [r] = (await (model as mongoose.Model<unknown>).aggregate([
          { $match: match },
          { $group: { _id: "$userId" } },
          { $count: "users" },
        ])) as { users: number }[];
        const pages = await (model as mongoose.Model<unknown>).countDocuments(match);
        return { type, label, users: r?.users || 0, pages };
      }),
    );
    rows.sort((a, b) => b.users - a.users || a.label.localeCompare(b.label));
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("User template counts error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch template counts" });
  }
};

// ─── USER DETAIL ────────────────────────────────────────────────

export const getUserDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select("name email avatar provider role status statusReason suspendedUntil points totalPointsEarned isVerified referralCode subdomain createdAt updatedAt")
      .lean();

    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Get all pages created by this user across all templates
    interface PageDoc {
      _id: string;
      shareId?: string;
      isPublished?: boolean;
      viewCount?: number;
      installCount?: number;
      createdAt?: string;
      updatedAt?: string;
      templateType: string;
      templateLabel: string;
    }

    const pages = await Promise.all(
      ALL_PAGE_MODELS.map(async ({ model, type, label }) => {
        const docs = await (model as mongoose.Model<unknown>)
          .find({ userId })
          .select("shareId isPublished viewCount installCount createdAt updatedAt")
          .sort({ createdAt: -1 })
          .lean() as Record<string, unknown>[];
        return docs.map((d): PageDoc => ({
          _id: String(d._id),
          shareId: d.shareId as string | undefined,
          isPublished: d.isPublished as boolean | undefined,
          viewCount: d.viewCount as number | undefined,
          installCount: d.installCount as number | undefined,
          createdAt: d.createdAt as string | undefined,
          updatedAt: d.updatedAt as string | undefined,
          templateType: type,
          templateLabel: label,
        }));
      })
    );

    const allPages = pages.flat().sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // View stats for this user's pages
    const viewStats = await PageView.aggregate([
      { $match: { pageOwnerId: new mongoose.Types.ObjectId(String(userId)) } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        user,
        pages: allPages,
        stats: {
          totalPagesCreated: allPages.length,
          totalPagesPublished: allPages.filter((p) => p.isPublished).length,
          totalViews: viewStats[0]?.totalViews || 0,
        },
      },
    });
  } catch (error) {
    console.error("User detail error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch user details" });
  }
};

// Admin: permanently delete any user's page (across all template types).
// Deleting removes the doc entirely, so its shared link 404s for everyone.
export const deleteUserPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const pageId = String(req.params.pageId || "");
    const templateType = String(req.query.templateType || req.body?.templateType || "");

    if (!mongoose.Types.ObjectId.isValid(pageId)) {
      res.status(400).json({ success: false, error: "Invalid page id" });
      return;
    }

    const entry = ALL_PAGE_MODELS.find((m) => m.type === templateType);
    if (!entry) {
      res.status(400).json({ success: false, error: "Unknown or unsupported template type" });
      return;
    }

    const deleted = await (entry.model as mongoose.Model<unknown>).findByIdAndDelete(pageId).lean();
    if (!deleted) {
      res.status(404).json({ success: false, error: "Page not found" });
      return;
    }

    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Admin delete page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};

// ─── CHANGE USER ROLE ───────────────────────────────────────────



export const changeUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { role } = req.body as { role: UserRole };

    // "superadmin" is deliberately NOT grantable here. This route is behind
    // `requireAdmin`, so allowing it would let any admin promote themselves to
    // the tier that can read passwords, ban accounts and impersonate. The super
    // admin is defined by email in `config/roles` and asserted on save.
    if (!["normal", "member", "admin"].includes(role)) {
      res.status(400).json({ success: false, error: "Invalid role. Must be normal, member, or admin." });
      return;
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    // Prevent demoting the super admin
    if (isSuperAdminEmail(targetUser.email) && role !== "superadmin") {
      res.status(403).json({ success: false, error: "Cannot change the super admin's role." });
      return;
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();
    // `protect` caches the role, so without this the change takes up to the
    // cache TTL to take effect.
    invalidateUser(String(targetUser._id));

    await audit(req, {
      action: "user.change_role",
      targetUserId: String(targetUser._id),
      targetUserEmail: targetUser.email,
      changes: { role: { from: previousRole, to: role } },
    });

    res.json({
      success: true,
      data: {
        id: targetUser._id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
      },
    });
  } catch (error) {
    console.error("Change role error:", error);
    res.status(500).json({ success: false, error: "Failed to change user role" });
  }
};

// ─── RECENT ACTIVITY ────────────────────────────────────────────

export const getRecentActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    const [recentUsers, recentViews] = await Promise.all([
      User.find()
        .select("name email avatar role createdAt")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      PageView.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        recentUsers,
        // Named, not slugged. Every other admin surface resolves the label, and
        // a feed that reads "raksha-bandhan-sister" next to tables that say
        // "Rakhi for Behna" looks like two different things.
        recentViews: recentViews.map((v) => ({
          ...v,
          templateLabel: templateLabel(String(v.templateType || "")),
        })),
      },
    });
  } catch (error) {
    console.error("Recent activity error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch activity" });
  }
};

// ─── TOP PAGES ──────────────────────────────────────────────────

export const getTopPages = async (_req: Request, res: Response): Promise<void> => {
  try {
    const topPages = await PageView.aggregate([
      { $group: { _id: { shareId: "$shareId", templateType: "$templateType" }, views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      success: true,
      data: topPages.map((p) => ({
        shareId: p._id.shareId,
        templateType: p._id.templateType,
        label: ALL_PAGE_MODELS.find((m) => m.type === p._id.templateType)?.label || p._id.templateType,
        views: p.views,
      })),
    });
  } catch (error) {
    console.error("Top pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch top pages" });
  }
};

// ─── CONTACT INQUIRIES ──────────────────────────────────────────

export const getContactInquiries = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const filter = req.query.filter as string; // "all" | "unread" | "read"
    const sort = parseSortOrder(req.query.sort);

    const query: Record<string, unknown> = {};
    if (filter === "unread") query.isRead = false;
    else if (filter === "read") query.isRead = true;

    const [items, total, unreadCount] = await Promise.all([
      ContactInquiry.find(query)
        .sort(sortSpec("createdAt", sort))
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ContactInquiry.countDocuments(query),
      ContactInquiry.countDocuments({ isRead: false }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        unreadCount,
        sort,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error("Get contacts error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch contact inquiries" });
  }
};

export const markContactRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isRead } = req.body as { isRead: boolean };

    const item = await ContactInquiry.findByIdAndUpdate(
      id,
      { isRead: !!isRead },
      { new: true }
    ).lean();

    if (!item) {
      res.status(404).json({ success: false, error: "Inquiry not found" });
      return;
    }

    res.json({ success: true, data: item });
  } catch (error) {
    console.error("Mark contact error:", error);
    res.status(500).json({ success: false, error: "Failed to update inquiry" });
  }
};

export const updateContactNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body as { adminNotes: string };

    const item = await ContactInquiry.findByIdAndUpdate(
      id,
      { adminNotes: (adminNotes || "").slice(0, 2000) },
      { new: true }
    ).lean();

    if (!item) {
      res.status(404).json({ success: false, error: "Inquiry not found" });
      return;
    }

    res.json({ success: true, data: item });
  } catch (error) {
    console.error("Update notes error:", error);
    res.status(500).json({ success: false, error: "Failed to update notes" });
  }
};

export const deleteContactInquiry = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const item = await ContactInquiry.findByIdAndDelete(id);
    if (!item) {
      res.status(404).json({ success: false, error: "Inquiry not found" });
      return;
    }
    res.json({ success: true, message: "Inquiry deleted" });
  } catch (error) {
    console.error("Delete contact error:", error);
    res.status(500).json({ success: false, error: "Failed to delete inquiry" });
  }
};

export const replyToContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = String(req.body?.body ?? "").trim();

    if (!body || body.length < 2) {
      res.status(400).json({ success: false, error: "Reply body is required" });
      return;
    }
    if (body.length > 4000) {
      res.status(400).json({ success: false, error: "Reply too long (max 4000 chars)" });
      return;
    }

    const item = await ContactInquiry.findById(id);
    if (!item) {
      res.status(404).json({ success: false, error: "Inquiry not found" });
      return;
    }

    await sendContactReplyEmail(item.email, item.name, body, item.message);

    item.replies.push({ body, sentAt: new Date() });
    item.isRead = true;
    await item.save();

    res.json({ success: true, message: "Reply sent", data: { replies: item.replies } });
  } catch (error) {
    console.error("Reply to contact error:", error);
    res.status(500).json({ success: false, error: "Failed to send reply" });
  }
};
