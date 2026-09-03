import { Router } from "express";
import { submitFeedback } from "../controllers/pageFeedback.controller";

const router = Router();

// `protect` is applied where this is mounted, in routes/index.ts.
router.post("/", submitFeedback);

export default router;
