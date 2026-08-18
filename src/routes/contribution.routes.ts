import { Router } from "express";
import rateLimit from "express-rate-limit";
import { protect } from "../middleware/auth";
import {
  approveAllContributions,
  getContributionQueue,
  getPublishedContributions,
  submitContribution,
  updateContributionStatus,
} from "../controllers/contribution.controller";

// Mounted at /api/contributions.

const router = Router();

const HOUR = 60 * 60 * 1000;

// ─── Write limit ─────────────────────────────────────────────────────────────
//
// 30 submissions per IP per hour. Keyed on IP because there is nothing else to
// key on — the whole point of a contributor link is that a friend uses it
// without an account.
//
// A household or a college hostel behind one NAT shares this budget, which is
// the known cost of the anonymous door. 30/hour is well clear of what a real
// group of friends does to one page (a handful of reviews over an evening) and
// well under what makes flooding worthwhile.
const submitLimiter = rateLimit({
  windowMs: HOUR,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "That's a lot of contributions in one go. Please try again a little later.",
  },
});

// ─── Read limit ──────────────────────────────────────────────────────────────
//
// Separate, and much higher, on purpose. The published endpoint is what the
// recipient's page POLLS for new contributions — at one poll every ten seconds
// a single open tab spends 360 requests an hour, so putting it behind the
// 30/hour write budget would kill the live view within five minutes of opening
// the gift. This still caps a runaway client; it just caps it at a number a
// legitimate one cannot hit.
const readLimiter = rateLimit({
  windowMs: HOUR,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please slow down and try again shortly.",
  },
});

// ── Public — no auth, by design ──────────────────────────────────────────────
//
// The contributor link is reusable and gets forwarded around a group chat.
// Nothing here trusts the caller: the payload is rebuilt field by field, the
// status is forced to "pending", and the read is published-only with an
// allowlisted projection.
// Submitting is addressed by `contribToken` (the friends' write link) and
// reading by `shareId` (the recipient's read link). Two different secrets for
// two different audiences — see ContributablePage for why. The literal "/submit"
// prefix also keeps this from ever shadowing "/:shareId/published".
router.post("/submit/:contribToken", submitLimiter, submitContribution);
router.get("/:shareId/published", readLimiter, getPublishedContributions);

// ── Owner — moderation ───────────────────────────────────────────────────────
//
// A sub-router so `protect` cannot be forgotten on a route added later: nothing
// registered below this line is reachable without a valid token, by
// construction. Mounted after the public routes, whose paths it does not
// overlap (`/:shareId` does not match `/:shareId/approve-all` — Express params
// stop at the slash).
//
// Because this is mounted at "/", a request matching none of its routes still
// runs `protect` and gets 401 rather than 404. That is the trade for the
// can't-forget-it guarantee, and failing closed is the right side to fail on.
const ownerRouter = Router();
ownerRouter.use(protect);

ownerRouter.get("/:shareId/queue", getContributionQueue);
ownerRouter.post("/:shareId/approve-all", approveAllContributions);
// PATCH and PUT both, the same way the story profile routes do it — the client
// contract has drifted from the server verb before, silently, and accepting
// both costs nothing.
ownerRouter.route("/:id/status").patch(updateContributionStatus).put(updateContributionStatus);

router.use(ownerRouter);

export default router;
