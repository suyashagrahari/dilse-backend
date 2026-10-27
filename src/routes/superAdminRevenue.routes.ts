import { Router } from "express";
import {
  getRevenueSummary,
  getRevenueCustomers,
  getRevenueOrders,
  getUserBilling,
  previewBillingStatement,
  composeBillingThanks,
  sendBillingStatement,
  getClosePreview,
  closeUserAccount,
} from "../controllers/superAdminRevenue.controller";

/**
 * Revenue, billing statements and account closure.
 *
 * Mounted twice by superAdmin.routes.ts — at /api/admin/super/revenue (the
 * documented paths) and, for the per-user routes only, at /api/admin/super
 * (`/users/:userId/billing`, `/users/:userId/close`) next to the other account
 * actions — both behind `protect` + `requireSuperAdmin`, both the same handlers.
 */

/** The per-user routes, reachable under both prefixes. */
export const userRevenueRouter = Router();
userRevenueRouter.get("/users/:userId/billing", getUserBilling);
userRevenueRouter.post("/users/:userId/billing/preview", previewBillingStatement);
userRevenueRouter.post("/users/:userId/billing/compose", composeBillingThanks);
userRevenueRouter.post("/users/:userId/billing/send", sendBillingStatement);
userRevenueRouter.get("/users/:userId/close/preview", getClosePreview);
userRevenueRouter.post("/users/:userId/close", closeUserAccount);

const router = Router();
router.get("/summary", getRevenueSummary);
router.get("/customers", getRevenueCustomers);
router.get("/orders", getRevenueOrders);
router.use(userRevenueRouter);

export default router;
