import { Router } from "express";
import rateLimit from "express-rate-limit";
import { optionalProtect, protect } from "../middleware/auth";
import { getSchema, postFill } from "../controllers/storyFill.controller";
import {
  addStory,
  deleteStory,
  getProfile,
  getStory,
  rebuildContext,
  updatePeople,
  updateSettings,
  updateStory,
} from "../controllers/storyProfile.controller";

const router = Router();

// ─── Fill limits ─────────────────────────────────────────────────────────────
//
// Two limiters rather than one, because an anonymous caller and a signed-in one
// are not the same risk. Anonymous is keyed on IP and capped low — it is the
// open door, and one model call per request is not cheap. Signed-in is keyed on
// the user id and capped higher: they are identifiable, they usually make
// several templates in a sitting, and an office or a college hostel behind one
// NAT would otherwise burn the shared IP budget in minutes.
//
// Each limiter skips the traffic the other one owns, so every request is
// counted exactly once. Both sit AFTER optionalProtect so `req.userId` is known
// by the time they run.

const HOUR = 60 * 60 * 1000;

const anonymousFillLimiter = rateLimit({
  windowMs: HOUR,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => Boolean(req.userId),
  message: {
    success: false,
    error: "You've used up the free AI fills for now. Sign in, or try again a little later.",
  },
});

const authedFillLimiter = rateLimit({
  windowMs: HOUR,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.userId,
  // Keyed on the account, never the IP — see the note above about shared NATs.
  keyGenerator: (req) => req.userId ?? "anonymous",
  message: {
    success: false,
    error: "Too many AI fills in the last hour. Please try again shortly.",
  },
});

// ── Public ───────────────────────────────────────────────────────────────────
router.get("/schema/:slug", getSchema);
router.post("/fill", optionalProtect, anonymousFillLimiter, authedFillLimiter, postFill);

// ── The sender's own story profile ───────────────────────────────────────────
//
// A sub-router so `protect` cannot be forgotten on a route added later: nothing
// mounted below this line is reachable without a valid token, by construction.
const profileRouter = Router();
profileRouter.use(protect);

// Each mutation answers to BOTH PATCH and PUT.
//
// Not indecision — this shipped broken. The server registered PATCH, the client
// was written against a contract that said PUT, both sides typechecked, every
// unit test passed, and the two never met until the whole stack was run
// together. The result would have been three silent 404s in the profile:
// editing your names, editing a story, and the auto-fill master switch — the
// last of which is the one control a sender has for turning this feature off.
//
// The handlers already treat every field as optional, which is exactly PATCH
// semantics, and accepting PUT as well costs nothing and closes the whole class
// of drift.
profileRouter.get("/", getProfile);
profileRouter.route("/people").patch(updatePeople).put(updatePeople);
profileRouter.route("/settings").patch(updateSettings).put(updateSettings);
profileRouter.post("/stories", addStory);
profileRouter.get("/stories/:id", getStory);
profileRouter.route("/stories/:id").patch(updateStory).put(updateStory);
profileRouter.delete("/stories/:id", deleteStory);
profileRouter.post("/context/rebuild", rebuildContext);

router.use("/profile", profileRouter);

export default router;
