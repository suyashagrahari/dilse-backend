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
import { sesInboundWebhook } from "../controllers/sesInbound.controller";

const router = Router();

// 12mb: an inbound message includes the entire quoted original and can include
// an attachment. Larger than that is not a reply worth parsing.
router.post(
  "/ses-inbound/:token",
  express.text({ type: "*/*", limit: "12mb" }),
  sesInboundWebhook
);

export default router;
