import { Request, Response } from "express";
import { isSuperAdminEmail } from "../config/roles";
import { invalidateUser } from "../services/accountStatus";
import { audit } from "../services/adminAudit";
import mongoose from "mongoose";
import User, { UserRole } from "../models/User";
import PageView from "../models/PageView";
import ContactInquiry from "../models/ContactInquiry";
import { sendContactReplyEmail } from "../utils/mailer";
import { TEMPLATE_LOOKUPS } from "./share.controller";
import { templateLabel } from "../config/templateCatalog";
import { hiddenSlugs } from "../config/templateVisibility";

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

// ─── ANALYTICS DASHBOARD ────────────────────────────────────────

export const getAnalyticsOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // User stats
    const [totalUsers, usersToday, usersThisWeek, usersThisMonth] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    // Page view stats
    const [totalViews, viewsToday, viewsThisWeek, viewsThisMonth] = await Promise.all([
      PageView.countDocuments(),
      PageView.countDocuments({ createdAt: { $gte: today } }),
      PageView.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      PageView.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    ]);

    // Whether each template is switched on HERE, so a row of zeros can be read.
    // Without it the table lies by omission: a hidden template shows 0/0 and
    // reads as "nobody wants this", when in fact nobody could reach it. On this
    // production deployment 37 of 43 are currently switched off, so that is most
    // of the table.
    const hidden = new Set(await hiddenSlugs().catch(() => []));

    // Total pages created across all templates
    const templateStats = await Promise.all(
      ALL_PAGE_MODELS.map(async ({ model, type, label, slug }) => {
        const [total, published] = await Promise.all([
          (model as mongoose.Model<unknown>).countDocuments(),
          (model as mongoose.Model<unknown>).countDocuments({ isPublished: true }),
        ]);
        return { type, label, slug, live: !hidden.has(slug), total, published };
      })
    );

    // Busiest first. With every template present this table is 43 rows long,
    // and registry order buries the ones that are actually being used.
    templateStats.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    const totalPagesCreated = templateStats.reduce((s, t) => s + t.total, 0);
    const totalPagesPublished = templateStats.reduce((s, t) => s + t.published, 0);

    // User role distribution
    const roleDistribution = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);

    // Device breakdown from page views
    const deviceBreakdown = await PageView.aggregate([
      { $group: { _id: "$device", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, today: usersToday, thisWeek: usersThisWeek, thisMonth: usersThisMonth },
        pageViews: { total: totalViews, today: viewsToday, thisWeek: viewsThisWeek, thisMonth: viewsThisMonth },
        pages: { totalCreated: totalPagesCreated, totalPublished: totalPagesPublished },
        templateStats,
        roleDistribution: roleDistribution.map((r) => ({ role: r._id || "normal", count: r.count })),
        deviceBreakdown: deviceBreakdown.map((d) => ({ device: d._id || "unknown", count: d.count })),
      },
    });
  } catch (error) {
    console.error("Analytics overview error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
};

// ─── CHART DATA: User registrations over time ───────────────────

export const getUserGrowthChart = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const data = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing days with 0
    const result: { date: string; count: number }[] = [];
    const cursor = new Date(startDate);
    const dataMap = new Map(data.map((d) => [d._id, d.count]));
    while (cursor <= new Date()) {
      const key = cursor.toISOString().split("T")[0];
      result.push({ date: key, count: dataMap.get(key) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("User growth chart error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chart data" });
  }
};

// ─── CHART DATA: Page views over time ───────────────────────────

export const getViewsChart = async (req: Request, res: Response): Promise<void> => {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const data = await PageView.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const result: { date: string; count: number }[] = [];
    const cursor = new Date(startDate);
    const dataMap = new Map(data.map((d) => [d._id, d.count]));
    while (cursor <= new Date()) {
      const key = cursor.toISOString().split("T")[0];
      result.push({ date: key, count: dataMap.get(key) || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Views chart error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chart data" });
  }
};

// ─── CHART DATA: Template popularity ────────────────────────────

export const getTemplatePopularity = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await PageView.aggregate([
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

    const [users, total] = await Promise.all([
      User.find(query)
        .select("name email avatar provider role status statusReason suspendedUntil points isVerified createdAt")
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch users" });
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

    const query: Record<string, unknown> = {};
    if (filter === "unread") query.isRead = false;
    else if (filter === "read") query.isRead = true;

    const [items, total, unreadCount] = await Promise.all([
      ContactInquiry.find(query)
        .sort({ createdAt: -1 })
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
