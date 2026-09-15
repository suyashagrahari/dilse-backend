// ─── The public feedback wall ────────────────────────────────────────────────
//
// Read-only, unauthenticated, and mounted ABOVE `/feedback` in routes/index.ts
// so the more specific prefix matches before that one's `protect` runs.
//
// Nothing here writes. Submitting feedback stays behind a session — see the
// note on the protected mount for why.

import { Router } from "express";
import { listPublicFeedback } from "../controllers/pageFeedback.controller";

const router = Router();

router.get("/", listPublicFeedback);

export default router;
