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
import {
  getAdminTemplatePricing,
  setTemplatePricing,
  setTemplatePricingBulk,
  clearTemplatePricing,
} from "../controllers/templatePricing.controller";
import {
  getTemplateGrantCounts,
  getTemplateGrantsForSlug,
  getTemplateGrantsForUser,
  createTemplateGrant,
  deleteTemplateGrant,
} from "../controllers/templateGrant.controller";
import {
  getFeedbackList,
  setFeedbackStatus,
  setFeedbackNotes,
  deleteFeedback,
  draftReply,
  sendReply,
} from "../controllers/adminFeedback.controller";
import { requireSuperAdmin } from "../middleware/adminAuth";

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

// ── What each template costs ───────────────────────────────────────────────
//
// Bulk before per-slug, for the same Express-ordering reason as above.
//
// `requireSuperAdmin` per route, unlike the visibility block: this file is
// mounted behind `requireAdmin`, and visibility is deliberately an admin
// decision. A price is not — it decides what users are charged, so it needs the
// tier that already holds the money capabilities. A superadmin outranks admin,
// so both gates pass for them and only for them.
router.get("/template-pricing", requireSuperAdmin, getAdminTemplatePricing);
router.patch("/template-pricing", requireSuperAdmin, setTemplatePricingBulk);
router.patch("/template-pricing/:slug", requireSuperAdmin, setTemplatePricing);
router.delete("/template-pricing/:slug", requireSuperAdmin, clearTemplatePricing);

// ── Who gets a template before everybody else ──────────────────────────────
//
// Super-admin only, like pricing and unlike visibility: this decides that one
// named person may use something the public cannot, and — per the publish gate's
// rule 4 — without paying for it.
//
// `/user/:userId` is declared BEFORE `/:slug` because Express matches in order
// and `user` is a valid slug shape, so the per-user route would otherwise be
// swallowed and answer with the grants for a template called "user".
router.get("/template-grants", requireSuperAdmin, getTemplateGrantCounts);
router.get("/template-grants/user/:userId", requireSuperAdmin, getTemplateGrantsForUser);
router.get("/template-grants/:slug", requireSuperAdmin, getTemplateGrantsForSlug);
router.post("/template-grants", requireSuperAdmin, createTemplateGrant);
router.delete("/template-grants/:slug/:userId", requireSuperAdmin, deleteTemplateGrant);

// ── What creators thought, the moment they finished ────────────────────────
//
// Super-admin only, like pricing and grants and unlike contacts: replying here
// sends mail as SubhSandesh to a named customer, and the drafts are written by a
// model. See the header of adminFeedback.controller for why that tier.
//
// `draft-reply` and `reply` are two routes on purpose. Generating text and
// sending an email are separate acts with a human in between, and there is no
// route that does both.
router.get("/feedback", requireSuperAdmin, getFeedbackList);
router.patch("/feedback/:id/status", requireSuperAdmin, setFeedbackStatus);
router.patch("/feedback/:id/notes", requireSuperAdmin, setFeedbackNotes);
router.post("/feedback/:id/draft-reply", requireSuperAdmin, draftReply);
router.post("/feedback/:id/reply", requireSuperAdmin, sendReply);
router.delete("/feedback/:id", requireSuperAdmin, deleteFeedback);

export default router;
