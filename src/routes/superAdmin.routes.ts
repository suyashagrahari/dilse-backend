import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { deleteProof, listProofs, updateProof, uploadProof } from "../controllers/outreachProof.controller";
import { PROOF_MAX_BYTES } from "../services/outreachProof.service";
import {
  getFullUserProfile,
  getPageContent,
  revealPagePassword,
  setPagePassword,
  updatePageContent,
  deletePage,
  adjustPoints,
  setAccountStatus,
  forceLogout,
  startImpersonation,
  getAuditLog,
} from "../controllers/superAdmin.controller";
import {
  adminListInfluencers,
  adminUpdateInfluencerSettings,
  adminGetInfluencer,
  adminUpdateInfluencer,
  adminRecordPayout,
  adminDeletePayout,
} from "../controllers/influencer.controller";
import {
  adminGetPaymentSettings,
  adminUpdatePaymentSettings,
  adminGeoCheck,
} from "../controllers/paymentSettings.controller";
import { adminGetSeason, adminPreviewSeason, adminUpdateSeason } from "../controllers/season.controller";
import { getMyPays, setMyPays, setFreeAccess } from "../controllers/freeAccess.controller";
import revenueRoutes, { userRevenueRouter } from "./superAdminRevenue.routes";
import { getCreations } from "../controllers/superAdminCreations.controller";
import { adminSetUpgradeEnabled, adminUpgradeStats } from "../controllers/upgrade.controller";
import {
  draftInfluencerMailHandler,
  getInfluencerMail,
  sendInfluencerMailHandler,
} from "../controllers/influencerMail.controller";
import {
  bulkStatus,
  cancelProspectMail,
  checkProspect,
  createProspect,
  deleteProspects,
  draftProspects,
  getProspect,
  importProspects,
  listProspects,
  previewProspectMail,
  improveProspectMailHandler,
  sendProspectMail,
  updateProspect,
} from "../controllers/prospect.controller";

/**
 * Mounted at /api/admin/super behind `protect` + `requireSuperAdmin`.
 *
 * `requireSuperAdmin` also refuses impersonated sessions, so nothing in here is
 * reachable while viewing as another user. The one exception —
 * `POST /impersonate/end` — is mounted separately in `routes/index.ts`,
 * because ending a session necessarily happens while inside one.
 */
const router = Router();

// Read
router.get("/users/:userId/profile", getFullUserProfile);
router.get("/pages/:templateType/:pageId/content", getPageContent);
router.get("/pages/:templateType/:pageId/password", revealPagePassword);
router.get("/audit", getAuditLog);

// International pricing (currency by country)
router.get("/payment-settings", adminGetPaymentSettings);
router.put("/payment-settings", adminUpdatePaymentSettings);
router.get("/geo-check", adminGeoCheck);

// Who publishes free: the caller's own "Pay like a customer" switch, and
// "All templates free" for any account (influencers, mostly).
router.get("/me/pays", getMyPays);
router.put("/me/pays", setMyPays);
router.put("/users/:userId/free-access", setFreeAccess);

// Season campaign + sale (Valentine wishlist / Halloween drop / off)
router.get("/season", adminGetSeason);
router.get("/season/preview", adminPreviewSeason);
router.put("/season", adminUpdateSeason);

// Influencer programme
router.get("/influencers", adminListInfluencers);
router.put("/influencers/settings", adminUpdateInfluencerSettings);
router.get("/influencers/:userId", adminGetInfluencer);
router.patch("/influencers/:userId", adminUpdateInfluencer);
router.post("/influencers/:userId/payouts", adminRecordPayout);
router.delete("/influencers/:userId/payouts/:payoutId", adminDeletePayout);

// Influencer chat (email). `draft` calls the model and sends nothing; `send`
// sends and never calls the model. Both limited per admin: a draft is a paid
// model request, and a send is mail from our domain's reputation.
const perAdmin = (limit: number, windowMinutes: number, error: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `influencer-mail:${req.userId || req.ip}`,
    message: { success: false, error },
  });
router.get("/influencers/:userId/mail", getInfluencerMail);
router.post(
  "/influencers/:userId/mail/draft",
  perAdmin(30, 10, "Too many drafts in a short time. Please wait a few minutes."),
  draftInfluencerMailHandler
);
router.post(
  "/influencers/:userId/mail/send",
  perAdmin(40, 60, "Too many emails sent in the last hour. Please wait."),
  sendInfluencerMailHandler
);

// Prospects: creators we invite who have not joined. `draft` calls the model
// and sends nothing; `send` only QUEUES — the worker sends one at a time under
// the daily cap (services/prospectQueue.service). See docs/influencer-prospects.md.
const perAdminKey = (scope: string, limit: number, windowMinutes: number, error: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${scope}:${req.userId || req.ip}`,
    message: { success: false, error },
  });
router.get("/prospects", listProspects);
router.post("/prospects", perAdminKey("prospect-add", 150, 60, "Too many prospects added in an hour."), createProspect);
router.post("/prospects/check", perAdminKey("prospect-check", 300, 10, "Slow down a little."), checkProspect);
router.post("/prospects/import", perAdminKey("prospect-import", 20, 60, "Too many imports in an hour."), importProspects);
router.post("/prospects/status", bulkStatus);
router.post("/prospects/delete", deleteProspects);
router.post("/prospects/draft", perAdminKey("prospect-draft", 30, 10, "Too many drafts in a short time. Please wait a few minutes."), draftProspects);
router.post("/prospects/improve", perAdminKey("prospect-improve", 30, 10, "Too many rewrites in a short time. Please wait a few minutes."), improveProspectMailHandler);
router.post("/prospects/preview", perAdminKey("prospect-preview", 400, 10, "Too many previews. Please wait."), previewProspectMail);
router.post("/prospects/send", perAdminKey("prospect-send", 20, 60, "Too many sends in the last hour. Please wait."), sendProspectMail);
router.post("/prospects/cancel", cancelProspectMail);
// Traction screenshots (Prospects → Traction). Before "/prospects/:id", which
// would otherwise read "proofs" as an id. The bytes are sniffed in the
// service; multer only caps the size (a little over 5 MB, so the service
// answers with a sentence instead of multer with a stack trace).
const proofUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PROOF_MAX_BYTES + 256 * 1024, files: 1 } });
router.get("/prospects/proofs", listProofs);
router.post(
  "/prospects/proofs/upload",
  perAdminKey("prospect-proof-upload", 30, 60, "Too many uploads in an hour."),
  (req, res, next) =>
    proofUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ success: false, error: (err as { code?: string })?.code === "LIMIT_FILE_SIZE" ? "That image is over 5 MB — crop it or save it smaller." : "That upload could not be read." });
        return;
      }
      next();
    }),
  uploadProof
);
router.patch("/prospects/proofs/:id", updateProof);
router.delete("/prospects/proofs/:id", deleteProof);
router.get("/prospects/:id", getProspect);
router.patch("/prospects/:id", updateProspect);

// Page actions
router.put("/pages/:templateType/:pageId/password", setPagePassword);
router.patch("/pages/:templateType/:pageId", updatePageContent);
router.delete("/pages/:templateType/:pageId", deletePage);

// Account actions
router.post("/users/:userId/points", adjustPoints);
router.post("/users/:userId/status", setAccountStatus);
router.post("/users/:userId/force-logout", forceLogout);
router.post("/users/:userId/impersonate", startImpersonation);

// Revenue reports, per-user billing + statements, and account closure.
// /revenue/* is the documented surface; the per-user routes are also reachable
// directly under /users/:userId/* beside the other account actions.
router.use("/revenue", revenueRoutes);

// Pages created in a range, by whom, of which template.
router.get("/creations", getCreations);

// Free → premium upgrade offers: the funnel, and the on/off switch.
router.get("/upgrades", adminUpgradeStats);
router.put("/upgrades/:from", adminSetUpgradeEnabled);
router.use(userRevenueRouter);

export default router;
