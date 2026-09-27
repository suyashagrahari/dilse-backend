import { Request, Response } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import DateInvitationPage, { DATE_INVITE_LIMITS, IDateInvitationPage, RsvpState } from "../models/DateInvitationPage";
import User from "../models/User";
import { env } from "../config/env";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { sendDateRsvpEmail } from "../utils/mailer";

// ─── The evening, shared by two people ───────────────────────────────────────
//
// A published invitation has two viewers and they do different things:
//
//   the SENDER (the page owner, signed in)  — the host. Only they tap
//       "we're here", so the plan unlocks for both of them from one phone.
//   the RECIPIENT (anyone else with the link) — answers the invitation.
//
// Both poll GET /live and see each other's actions within a few seconds.
// Afterwards either of them can pin up to four photos to the stops.
//
// A password-protected page hands out a short HMAC token at /verify; every
// recipient call here carries it in `x-page-token`. The token is derived from
// the password hash, so changing the password invalidates every old token.

const AUTO_ADVANCE_GRACE_MS = 20 * 60 * 1000;
const MEMORY_MAX_DATA_URL = 12 * 1024 * 1024;

export const pageToken = (page: Pick<IDateInvitationPage, "shareId" | "password">): string =>
  createHmac("sha256", env.JWT_SECRET).update(`date-invitation:${page.shareId}:${page.password}`).digest("base64url");

const isOwner = (req: Request, page: IDateInvitationPage): boolean =>
  !!req.userId && String(page.userId) === String(req.userId);

const hasAccess = (req: Request, page: IDateInvitationPage): boolean => {
  if (!page.password || isOwner(req, page)) return true;
  const got = String(req.headers["x-page-token"] || "");
  const want = pageToken(page);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
};

const findPage = (shareId: string) => DateInvitationPage.findOne({ shareId, isPublished: true });

/**
 * The same grace rule the client uses: twenty minutes past the NEXT stop's
 * arrival time, a forgotten tap stops costing them the rest of the night.
 * Stamped "" — the contract's marker for "nobody tapped". Applied on every
 * read, so the evening keeps moving even when the host's phone is in a pocket.
 */
const applyAutoAdvance = (page: IDateInvitationPage, now: number): boolean => {
  if (page.rsvp !== "accepted") return false;
  let moved = false;
  while (page.currentStopIndex < page.stops.length) {
    const next = page.stops[page.currentStopIndex + 1];
    if (!next) break;
    const due = Date.parse(next.arriveAt);
    if (Number.isNaN(due) || now <= due + AUTO_ADVANCE_GRACE_MS) break;
    const arrived = page.stops.map((_, i) => page.arrivedAt[i] ?? "");
    page.arrivedAt = arrived;
    page.currentStopIndex += 1;
    moved = true;
  }
  return moved;
};

/** Over when every stop is done, or when the planned duration has run out. */
const isOver = (page: IDateInvitationPage, now: number): boolean => {
  if (page.rsvp !== "accepted") return false;
  if (page.stops.length > 0 && page.currentStopIndex >= page.stops.length) return true;
  const start = Date.parse(page.startsAt);
  return !Number.isNaN(start) && now >= start + page.durationMins * 60_000;
};

const liveView = (req: Request, page: IDateInvitationPage) => ({
  isOwner: isOwner(req, page),
  rsvp: page.rsvp,
  rsvpAt: page.rsvpAt || "",
  proposedDate: page.proposedDate || "",
  currentStopIndex: page.currentStopIndex,
  arrivedAt: page.stops.map((_, i) => page.arrivedAt[i] ?? ""),
  memories: page.memories || [],
  maxMemories: DATE_INVITE_LIMITS.maxMemories,
  serverNow: new Date().toISOString(),
});

const deny = (res: Response, status: number, error: string) => {
  res.status(status).json({ success: false, error });
};

// ─── GET /share/:shareId/live ────────────────────────────────────────────────

export const getLiveState = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(String(req.params.shareId));
    if (!page) return deny(res, 404, "Page not found");
    if (!hasAccess(req, page)) return deny(res, 401, "Password required");
    if (applyAutoAdvance(page, Date.now())) await page.save();
    res.json({ success: true, data: liveView(req, page) });
  } catch (error) {
    console.error("Date invitation live state error:", error);
    deny(res, 500, "Failed to load");
  }
};

// ─── POST /share/:shareId/rsvp ───────────────────────────────────────────────

export const answerInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(String(req.params.shareId));
    if (!page) return deny(res, 404, "Page not found");
    if (!hasAccess(req, page)) return deny(res, 401, "Password required");
    // The host cannot say yes on her behalf.
    if (isOwner(req, page)) return deny(res, 403, `Only ${page.recipientName || "they"} can answer this one`);

    const state = String(req.body?.state || "") as Exclude<RsvpState, "pending">;
    if (!["accepted", "declined", "reschedule"].includes(state)) return deny(res, 400, "Unknown answer");

    // One answer. A counter-proposal can still become a yes or a no.
    if (page.rsvp !== "pending" && page.rsvp !== "reschedule") {
      res.json({ success: true, data: liveView(req, page) });
      return;
    }

    const proposed = typeof req.body?.proposedDate === "string" ? req.body.proposedDate.slice(0, DATE_INVITE_LIMITS.iso) : "";
    if (state === "reschedule" && Number.isNaN(Date.parse(proposed))) return deny(res, 400, "Pick a day");

    page.rsvp = state;
    page.proposedDate = state === "reschedule" ? proposed : "";
    page.rsvpAt = new Date().toISOString();
    await page.save();

    // Tell the host. Never blocks the answer.
    void (async () => {
      try {
        const owner = await User.findById(page.userId).select("email name");
        if (owner?.email) {
          const { buildShareUrl } = await import("../utils/shareUrl");
          await sendDateRsvpEmail({
            to: owner.email,
            senderName: page.senderName,
            recipientName: page.recipientName,
            state,
            proposedDate: page.proposedDate,
            startsAt: page.startsAt,
            link: await buildShareUrl(page.shareId, String(page.userId)),
          });
        }
      } catch (err) {
        console.error("Date invitation RSVP email error:", err);
      }
    })();

    res.json({ success: true, data: liveView(req, page) });
  } catch (error) {
    console.error("Date invitation RSVP error:", error);
    deny(res, 500, "Failed to send your answer");
  }
};

// ─── POST /share/:shareId/arrive ─────────────────────────────────────────────

export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(String(req.params.shareId));
    if (!page) return deny(res, 404, "Page not found");
    if (!isOwner(req, page)) return deny(res, 403, `Only ${page.senderName || "the host"} can check you in`);
    if (page.rsvp !== "accepted") return deny(res, 409, "They haven't said yes yet");

    applyAutoAdvance(page, Date.now());

    // `from` is where the host's screen thinks the cursor is. A stale tap from
    // a second tab must not skip a stop, so it only moves when they agree.
    const from = Number(req.body?.from);
    if (Number.isInteger(from) && from === page.currentStopIndex && from < page.stops.length) {
      const arrived = page.stops.map((_, i) => page.arrivedAt[i] ?? "");
      if (from >= 0) arrived[from] = new Date().toISOString();
      page.arrivedAt = arrived;
      page.currentStopIndex = from + 1;
    }
    await page.save();
    res.json({ success: true, data: liveView(req, page) });
  } catch (error) {
    console.error("Date invitation check-in error:", error);
    deny(res, 500, "Failed to check in");
  }
};

// ─── POST /share/:shareId/memories ───────────────────────────────────────────

export const addMemory = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(String(req.params.shareId));
    if (!page) return deny(res, 404, "Page not found");
    if (!hasAccess(req, page)) return deny(res, 401, "Password required");
    if (!isOver(page, Date.now())) return deny(res, 409, "Photos open once the date is over");

    const max = DATE_INVITE_LIMITS.maxMemories;
    if ((page.memories || []).length >= max) return deny(res, 409, `That's all ${max} photos`);

    const image = typeof req.body?.image === "string" ? req.body.image : "";
    if (!image.startsWith("data:image/") || image.length > MEMORY_MAX_DATA_URL) return deny(res, 400, "That photo didn't come through");

    const stopId = String(req.body?.stopId || "").slice(0, DATE_INVITE_LIMITS.stopId);
    if (!page.stops.some((s) => s.id === stopId)) return deny(res, 400, "Pick the place it was taken");
    const title = String(req.body?.title || "").trim().slice(0, DATE_INVITE_LIMITS.memoryTitle);

    const uploaded = await uploadImageDataUrl(image, `date-invitation/memories/${page.shareId}`);
    const memory = {
      id: randomUUID().slice(0, 12),
      url: uploaded.url.slice(0, DATE_INVITE_LIMITS.url),
      stopId,
      title,
      by: isOwner(req, page) ? ("sender" as const) : ("recipient" as const),
      at: new Date().toISOString(),
    };

    // Atomic cap: two people uploading at once can never make it five.
    const updated = await DateInvitationPage.findOneAndUpdate(
      { _id: page._id, [`memories.${max - 1}`]: { $exists: false } },
      { $push: { memories: memory } },
      { new: true },
    );
    if (!updated) return deny(res, 409, `That's all ${max} photos`);
    res.json({ success: true, data: liveView(req, updated) });
  } catch (error) {
    console.error("Date invitation memory upload error:", error);
    deny(res, 500, "Failed to add the photo");
  }
};

// ─── DELETE /share/:shareId/memories/:memoryId ───────────────────────────────

export const removeMemory = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(String(req.params.shareId));
    if (!page) return deny(res, 404, "Page not found");
    if (!hasAccess(req, page)) return deny(res, 401, "Password required");
    const by = isOwner(req, page) ? "sender" : "recipient";
    const updated = await DateInvitationPage.findOneAndUpdate(
      { _id: page._id },
      // Each of them can only take down their own.
      { $pull: { memories: { id: String(req.params.memoryId), by } } },
      { new: true },
    );
    res.json({ success: true, data: liveView(req, updated ?? page) });
  } catch (error) {
    console.error("Date invitation memory delete error:", error);
    deny(res, 500, "Failed to remove the photo");
  }
};
