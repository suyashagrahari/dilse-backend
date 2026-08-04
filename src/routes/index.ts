import { Router } from "express";
import authRoutes from "./auth.routes";
import templateRoutes from "./template.routes";
import generateRoutes from "./generate.routes";
import favoriteRoutes from "./favorite.routes";
import userContentRoutes from "./userContent.routes";
import birthdayPageRoutes from "./birthdayPage.routes";
import valentinePageRoutes from "./valentinePage.routes";
import holiPageRoutes from "./holiPage.routes";
import eidPageRoutes from "./eidPage.routes";
import weddingPageRoutes from "./weddingPage.routes";
import receptionPageRoutes from "./receptionPage.routes";
import shaadiCardPageRoutes from "./shaadiCardPage.routes";
import christianWeddingPageRoutes from "./christianWeddingPage.routes";
import loveGfPageRoutes from "./loveGfPage.routes";
import birthdayGfPageRoutes from "./birthdayGfPage.routes";
import darlingPageRoutes from "./darlingPage.routes";
import apologyDashboardPageRoutes from "./apologyDashboardPage.routes";
import missyouGfPageRoutes from "./missyouGfPage.routes";
import bouquetGfPageRoutes from "./bouquetGfPage.routes";
import courtOfLovePageRoutes from "./courtOfLovePage.routes";
import shareRoutes from "./share.routes";
import mediaRoutes from "./media.routes";
import analyticsRoutes from "./analytics.routes";
import contactRoutes from "./contact.routes";
import referralRoutes from "./referral.routes";
import paymentRoutes from "./payment.routes";
import adminRoutes from "./admin.routes";
import { protect } from "../middleware/auth";
import { requireAdmin } from "../middleware/adminAuth";

const router = Router();

router.use("/auth", authRoutes);
router.use("/templates", templateRoutes);
router.use("/generate", protect, generateRoutes);
router.use("/favorites", protect, favoriteRoutes);
router.use("/content", protect, userContentRoutes);
router.use("/birthday-pages", birthdayPageRoutes);
router.use("/valentine-pages", valentinePageRoutes);
router.use("/holi-pages", holiPageRoutes);
router.use("/eid-pages", eidPageRoutes);
router.use("/wedding-pages", weddingPageRoutes);
router.use("/reception-pages", receptionPageRoutes);
router.use("/shaadi-card-pages", shaadiCardPageRoutes);
router.use("/christian-wedding-pages", christianWeddingPageRoutes);
router.use("/love-gf-pages", loveGfPageRoutes);
router.use("/birthday-gf-pages", birthdayGfPageRoutes);
router.use("/darling-pages", darlingPageRoutes);
router.use("/apology-dashboard-pages", apologyDashboardPageRoutes);
router.use("/missyou-gf-pages", missyouGfPageRoutes);
router.use("/bouquet-gf-pages", bouquetGfPageRoutes);
router.use("/court-of-love-pages", courtOfLovePageRoutes);
router.use("/share", shareRoutes);
router.use("/media", mediaRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/contact", contactRoutes);
router.use("/referral", referralRoutes);
router.use("/payment", paymentRoutes);
router.use("/admin", protect, requireAdmin, adminRoutes);

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Gifts API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
