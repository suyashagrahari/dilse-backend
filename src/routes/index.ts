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
import shareRoutes from "./share.routes";
import { protect } from "../middleware/auth";

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
router.use("/share", shareRoutes);

router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Gifts API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
