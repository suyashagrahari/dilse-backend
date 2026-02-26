import { Router } from "express";
import { getPlatformOverview } from "../controllers/analytics.controller";

const router = Router();

router.get("/overview", getPlatformOverview);

export default router;
