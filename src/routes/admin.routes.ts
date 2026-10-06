import { Router } from "express";
import rateLimit from "express-rate-limit";
import { draftContactReplyHandler } from "../controllers/contactReply.controller";
import {
  getAnalyticsOverview,
  getUserGrowthChart,
  getViewsChart,
  getTemplatePopularity,
  getAllUsers,
  getUserTemplateCounts,
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
import {
  getDrafts,
  getDraftDetail,
  draftEmail,
  sendDraftEmail,
} from "../controllers/adminDraft.controller";
import {
  addInboundManual,
  draftReplyForThread,
  getThread,
  getThreads,
  replyToThread,
  updateThread,
} from "../controllers/adminThread.controller";
import { requireSuperAdmin } from "../middleware/adminAuth";
import { getAdminTemplateTiers, setTemplateTier, clearTemplateTier } from "../controllers/templateMeta.controller";
import { getRecurringUsers } from "../controllers/adminRetention.controller";
import {
  getAudience,
  getRecipients,
  draftEmail as draftOutreachEmail,
  previewEmail as previewOutreachEmail,
  sendTest as sendOutreachTest,
  sendBroadcast,
  listBroadcasts,
  getBroadcast,
  resumeBroadcast,
  setOptOut,
} from "../controllers/adminOutreach.controller";
import { getWishlistJoins } from "../controllers/adminWishlist.controller";

const router = Router();

// Analytics
router.get("/analytics/overview", getAnalyticsOverview);
router.get("/analytics/user-growth", getUserGrowthChart);
router.get("/analytics/views", getViewsChart);
router.get("/analytics/template-popularity", getTemplatePopularity);
router.get("/analytics/top-pages", getTopPages);
router.get("/analytics/recent-activity", getRecentActivity);

// User management
// Who came back on a different day and made another page. Super-admin only:
// it reads every creator's activity across every template.
router.get("/users/recurring", requireSuperAdmin, getRecurringUsers);
router.get("/users/template-counts", getUserTemplateCounts);
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
// AI draft of a reply, from the message plus what this person has made with us.
// Sends nothing. Limited per admin: each call is a paid model request.
router.post(
  "/contacts/:id/draft-reply",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:${req.userId || req.ip}`,
    message: { success: false, error: "Too many drafts in a short time. Please wait a few minutes." },
  }),
  draftContactReplyHandler
);

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

// Premium / normal tier. Super-admin only, next to pricing, because the two are
// set together on the same screen.
router.get("/template-tiers", requireSuperAdmin, getAdminTemplateTiers);
router.patch("/template-tiers/:slug", requireSuperAdmin, setTemplateTier);
router.delete("/template-tiers/:slug", requireSuperAdmin, clearTemplateTier);

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

// ── Pages somebody started and never published ─────────────────────────────
//
// Super-admin only, and for a sharper reason than the other blocks: `send` puts
// UNSOLICITED email in a real person's inbox, in the company's name, about a
// private document. That is the most externally-visible thing any admin route
// here does.
//
// `draft-email` and `send` are two routes with a human in between. The generator
// cannot mail and the sender cannot generate — see the controller header.
//
// The two-segment path is `(templateType, pageId)`, which is how every admin
// surface addresses a page across the 43 collections. The list route is declared
// first so it cannot be swallowed by the parameterised one.
router.get("/drafts", requireSuperAdmin, getDrafts);
router.get("/drafts/:templateType/:pageId", requireSuperAdmin, getDraftDetail);
router.post("/drafts/:templateType/:pageId/draft-email", requireSuperAdmin, draftEmail);
router.post("/drafts/:templateType/:pageId/send", requireSuperAdmin, sendDraftEmail);

// ── Conversations ──────────────────────────────────────────────────────────
//
// Reading what was said, both directions. Super-admin only for the same reason
// as the block above and one more: these documents hold what a creator wrote
// back, which is private correspondence and not general staff reading.
//
// `POST /threads/:id/inbound` is the only write that adds a message ATTRIBUTED
// to somebody else — a reply pasted in from the mailbox while inbound mail is
// not yet wired up. It is audited. See adminThread.controller.ts.
router.get("/threads", requireSuperAdmin, getThreads);
router.get("/threads/:id", requireSuperAdmin, getThread);
router.patch("/threads/:id", requireSuperAdmin, updateThread);
router.post("/threads/:id/inbound", requireSuperAdmin, addInboundManual);

// Generate and send are two routes with a human in between, the same boundary
// the feedback and drafts panels have. `draft-reply` gets the WHOLE
// conversation and cannot mail; `reply` mails and cannot generate.
router.post("/threads/:id/draft-reply", requireSuperAdmin, draftReplyForThread);
router.post("/threads/:id/reply", requireSuperAdmin, replyToThread);

// ── One email to many creators ─────────────────────────────────────────────
//
// Super-admin only: `send` puts mail in many real inboxes at once. `draft`
// calls the model and cannot mail; `send` mails and cannot call the model; and
// `send` refuses unless the count the super admin confirmed still matches. See
// adminOutreach.controller.ts.
router.get("/wishlist", requireSuperAdmin, getWishlistJoins);
router.get("/outreach/audience", requireSuperAdmin, getAudience);
router.post("/outreach/recipients", requireSuperAdmin, getRecipients);
router.post("/outreach/draft", requireSuperAdmin, draftOutreachEmail);
router.post("/outreach/preview", requireSuperAdmin, previewOutreachEmail);
router.post("/outreach/test", requireSuperAdmin, sendOutreachTest);
router.post("/outreach/send", requireSuperAdmin, sendBroadcast);
router.get("/outreach/broadcasts", requireSuperAdmin, listBroadcasts);
router.get("/outreach/broadcasts/:id", requireSuperAdmin, getBroadcast);
router.post("/outreach/broadcasts/:id/resume", requireSuperAdmin, resumeBroadcast);
router.patch("/outreach/users/:userId/opt-out", requireSuperAdmin, setOptOut);

export default router;
