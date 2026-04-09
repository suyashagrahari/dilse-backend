import { Router } from "express";
import {
  getAnalyticsOverview,
  getUserGrowthChart,
  getViewsChart,
  getTemplatePopularity,
  getAllUsers,
  getUserDetail,
  changeUserRole,
  getRecentActivity,
  getTopPages,
  getContactInquiries,
  markContactRead,
  updateContactNotes,
  deleteContactInquiry,
} from "../controllers/admin.controller";

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

// Contact inquiries
router.get("/contacts", getContactInquiries);
router.patch("/contacts/:id/read", markContactRead);
router.patch("/contacts/:id/notes", updateContactNotes);
router.delete("/contacts/:id", deleteContactInquiry);

export default router;
