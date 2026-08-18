import { Router } from "express";
import { getActivityHighlights } from "../controllers/activity.controller";

const router = Router();

// Public and read-only. Returns counts and timestamps, never names or location.
router.get("/highlights", getActivityHighlights);

export default router;
