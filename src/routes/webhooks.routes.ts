// ─── Public webhooks ────────────────────────────────────────────────────────
//
// Endpoints called by a third party rather than by our own client, so nothing
// here can go behind `protect`. Each one authenticates itself — see
// `sesInbound.controller.ts`, which checks a path secret, an Amazon signature
// and the topic ARN before it will look at a message.
//
// ── WHY THE BODY IS PARSED AS TEXT ─────────────────────────────────────────
//
// SNS posts JSON with `Content-Type: text/plain; charset=UTF-8`. The app-wide
// `express.json()` looks at the content type and skips it, so `req.body` would
// be `{}` and every notification would be dropped as unparseable. Parsing text
// here and calling `JSON.parse` in the controller is what actually works.
//
// `type: "*/*"` because SNS's content type has been known to vary, and this
// route is only ever reached by SNS.

import { Router } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { sesInboundWebhook } from "../controllers/sesInbound.controller";
import { razorpayWebhook } from "../controllers/razorpayWebhook.controller";

const router = Router();

// 12mb: an inbound message includes the entire quoted original and can include
// an attachment. Larger than that is not a reply worth parsing.
router.post(
  "/ses-inbound/:token",
  express.text({ type: "*/*", limit: "12mb" }),
  sesInboundWebhook
);

// Razorpay payment events. The body arrives already parsed by the global
// express.json, which also kept the raw bytes for this path (see app.ts) —
// the signature is checked against those, not the parsed object.
router.post(
  "/razorpay",
  // Razorpay sends a handful of events per payment; 120/min per source IP is
  // far above that and stops anyone using the HMAC check as a CPU sink.
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }),
  razorpayWebhook
);

export default router;
