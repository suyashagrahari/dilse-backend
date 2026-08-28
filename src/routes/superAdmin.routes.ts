import { Router } from "express";
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

// Page actions
router.put("/pages/:templateType/:pageId/password", setPagePassword);
router.patch("/pages/:templateType/:pageId", updatePageContent);
router.delete("/pages/:templateType/:pageId", deletePage);

// Account actions
router.post("/users/:userId/points", adjustPoints);
router.post("/users/:userId/status", setAccountStatus);
router.post("/users/:userId/force-logout", forceLogout);
router.post("/users/:userId/impersonate", startImpersonation);

export default router;
