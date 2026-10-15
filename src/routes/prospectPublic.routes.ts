// ─── Public: unsubscribe from prospect outreach ──────────────────────────────
//
// The link in every prospect email's footer and its List-Unsubscribe header.
// GET shows a confirm button (link scanners prefetch GETs); POST unsubscribes,
// both from that button and from RFC 8058 one-click (Gmail/Yahoo POST
// `List-Unsubscribe=One-Click`). The token is 24 random characters, so it
// cannot be guessed; the limiter stops anyone trying.

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { unsubscribeOneClick, unsubscribePage } from "../controllers/prospect.controller";

const router = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

router.get("/unsubscribe/:token", limiter, unsubscribePage);
router.post("/unsubscribe/:token", limiter, unsubscribeOneClick);

export default router;
