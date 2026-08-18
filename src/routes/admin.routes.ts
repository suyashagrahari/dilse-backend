import { Router } from "express";
import {
  getAnalyticsOverview,
  getUserGrowthChart,
  getViewsChart,
  getTemplatePopularity,
  getAllUsers,
  getUserDetail,
  changeUserRole,
  deleteUserPage,
  getRecentActivity,
  getTopPages,
  getContactInquiries,
  markContactRead,
  updateContactNotes,
  deleteContactInquiry,
  replyToContact,
} from "../controllers/admin.controller";
import {
  getAdminTemplateVisibility,
  setTemplateVisibility,
  setTemplateVisibilityBulk,
  clearTemplateVisibility,
} from "../controllers/templateVisibility.controller";

const router = Router();

// Analytics
router.get("/analytics/overview", getAnalyticsOverview);
router.get("/analytics/user-growth", getUserGrowthChart);
router.get("/analytics/views", getViewsChart);
router.get("/analytics/template-popularity", getTemplatePopularity);
router.get("/analytics/top-pages", getTopPages);
router.get("/analytics/recent-activity", getRecentActivity);

// User management
router.get("/users", getAllUsers);
router.get("/users/:userId", getUserDetail);
router.patch("/users/:userId/role", changeUserRole);
router.delete("/pages/:pageId", deleteUserPage);

// Contact inquiries
router.get("/contacts", getContactInquiries);
router.patch("/contacts/:id/read", markContactRead);
router.patch("/contacts/:id/notes", updateContactNotes);
router.delete("/contacts/:id", deleteContactInquiry);
router.post("/contacts/:id/reply", replyToContact);

// ── Which templates are live on THIS deployment ────────────────────────────
//
// The bulk route is declared before the per-slug one on purpose: Express matches
// in order, and `PATCH /template-visibility` would otherwise be swallowed by
// `PATCH /template-visibility/:slug` with an empty slug on some clients.
//
// Every route here is already behind `protect` + `requireAdmin`, applied where
// this file is mounted in routes/index.ts.
router.get("/template-visibility", getAdminTemplateVisibility);
router.patch("/template-visibility", setTemplateVisibilityBulk);
router.patch("/template-visibility/:slug", setTemplateVisibility);
router.delete("/template-visibility/:slug", clearTemplateVisibility);

export default router;
