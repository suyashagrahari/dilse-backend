import { Request, Response } from "express";
import mongoose from "mongoose";
import Contribution, { SUBMITTER_NAME_MAX, type ContributionStatus, type IContribution } from "../models/Contribution";
import { getPageSource, listPageSources, type ContributionPageSource } from "../config/contributionTemplates";
import { isProfane } from "../utils/profanity";
import type { ApiResponse } from "../types";

// ─── Contributions ───────────────────────────────────────────────────────────
//
// Friends adding things to somebody else's published page. Three trust rules
// run through every handler in this file:
//
//   1. Ownership is `ownerId === req.userId`, resolved from the stored document.
//      No handler here reads an owner from the request body, and no owner route
//      takes an owner id in the URL. The two are indistinguishable to a client
//      and only one of them is safe.
//   2. `status` is "pending" on create, always. A client-supplied status is
//      dropped on the floor — nobody publishes themselves onto a stranger's gift.
//   3. Nothing is stored as it arrived. Payloads are rebuilt key by key against
//      the per-kind schema below, so an unknown field cannot reach Mongo through
//      a Mixed column.

/** The kinds a page can collect. Generic on purpose — no handler branches on template. */
const CONTRIBUTION_KINDS = ["review", "comment", "tag"] as const;
type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

const isContributionKind = (value: string): value is ContributionKind =>
  (CONTRIBUTION_KINDS as readonly string[]).includes(value);

/** Hard caps. These are the contract — the client mirrors them, the server enforces them. */
const LIMITS = {
  reviewTitle: 60,
  reviewBody: 200,
  commentText: 200,
  tagLabel: 24,
  idempotencyKey: 100,
  pageType: 40,
} as const;

/**
 * How many contributions one page will accept, ever.
 *
 * The per-IP limiter on the route stops one person flooding a page; it does
 * nothing about a hundred people, or one person with a hundred addresses. This
 * is the backstop that keeps a single gift page from becoming unbounded storage
 * and an unloadable moderation queue.
 */
const MAX_PER_PAGE = 500;

/** Rows returned to the public poll, and to the owner's queue, per request. */
const PUBLIC_READ_LIMIT = 200;
const QUEUE_READ_LIMIT = 500;

/** Same normalise-and-clamp idiom as the story profile: collapse whitespace, trim, cut. */
const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Route params are typed `string | string[]` in this project, because a
 * duplicated key on the query string can arrive as an array. Everything here
 * wants a single opaque id, so anything else normalises to "" — which then
 * fails the lookup it is used in and returns a 404, rather than being spread
 * into a Mongo filter as an array and matching something unintended.
 */
const param = (v: unknown): string => str(v, 100);

type PayloadResult =
  | { ok: true; payload: Record<string, unknown>; moderationText: string }
  | { ok: false; error: string };

/**
 * Build the stored payload for a kind, field by field.
 *
 * Note what this does NOT do: copy. Every returned object is constructed from
 * named reads of `raw`, so unknown keys are not "stripped" so much as never
 * looked at — which is the only version of stripping that stays correct when
 * somebody adds a field later.
 *
 * `moderationText` is the human-written prose concatenated for the word filter;
 * it is not stored.
 */
function validatePayload(kind: ContributionKind, raw: Record<string, unknown>): PayloadResult {
  switch (kind) {
    case "review": {
      // Integer 1..5. `Number()` on a numeric string is deliberate — form
      // controls post "4", and rejecting that would be pedantry, not safety.
      const stars = Number(raw.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
        return { ok: false, error: "A rating has to be a whole number of stars from 1 to 5." };
      }

      const title = str(raw.title, LIMITS.reviewTitle);
      const body = str(raw.body, LIMITS.reviewBody);
      if (!body) return { ok: false, error: "A review needs something written in it." };

      return { ok: true, payload: { stars, title, body }, moderationText: `${title} ${body}` };
    }

    case "comment": {
      const text = str(raw.text, LIMITS.commentText);
      if (!text) return { ok: false, error: "A comment needs some text." };
      return { ok: true, payload: { text }, moderationText: text };
    }

    case "tag": {
      const label = str(raw.label, LIMITS.tagLabel);
      if (!label) return { ok: false, error: "A tag needs a label." };
      return { ok: true, payload: { label }, moderationText: label };
    }
  }
}

interface ResolvedPage {
  pageType: string;
  pageId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
}

/** Ask one registered source whether it owns this shareId. */
async function lookupIn(source: ContributionPageSource, shareId: string): Promise<ResolvedPage | null> {
  const page = await source.model.findOne({ shareId }).select("_id userId").lean();
  // A page with no owner cannot be moderated by anyone, so it cannot be
  // contributed to either. Better a 404 than an orphan row.
  if (!page?.userId) return null;
  return { pageType: source.pageType, pageId: page._id, ownerId: page.userId };
}

/**
 * shareId → page → owner, across every registered template.
 *
 * `pageTypeHint` comes from the request body and is treated as exactly that: a
 * hint that saves a query or two by trying the right collection first. It is
 * never trusted for anything that matters — the ownerId always comes from the
 * document that was actually found, so a client lying about pageType only makes
 * its own request slower.
 */
async function resolvePage(shareId: string, pageTypeHint: string): Promise<ResolvedPage | null> {
  const hinted = pageTypeHint ? getPageSource(pageTypeHint) : undefined;
  if (hinted) {
    const found = await lookupIn(hinted, shareId);
    if (found) return found;
  }

  for (const source of listPageSources()) {
    if (source === hinted) continue;
    const found = await lookupIn(source, shareId);
    if (found) return found;
  }

  return null;
}

/**
 * What a contributor is allowed to see of their own submission.
 *
 * `status` is in here so the friend can be told "waiting for approval" instead
 * of watching their comment vanish. `ownerId`, `pageId`, `idempotencyKey` and
 * `flagged` are not, and must never be — `flagged` in particular would tell a
 * contributor exactly which words trip the filter.
 */
const contributorView = (c: IContribution) => ({
  id: String(c._id),
  kind: c.kind,
  submitterName: c.submitterName,
  payload: c.payload,
  status: c.status,
  createdAt: c.createdAt,
});

/** The public shape, straight off a projected lean read. */
interface PublishedRow {
  _id: mongoose.Types.ObjectId;
  kind: string;
  submitterName: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** The owner's shape. Adds moderation state; still no idempotency key. */
interface QueueRow extends PublishedRow {
  pageType: string;
  status: ContributionStatus;
  flagged: boolean;
  updatedAt: Date;
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * POST /:shareId — a friend submits a contribution.
 *
 * The link that got them here is REUSABLE and is meant to be: one link goes out,
 * twenty friends open it. So there is no token to consume and no "already used"
 * state. Deduping is per submission instead, on { shareId, idempotencyKey },
 * and a repeat of a key returns the ORIGINAL row with 200 — not a 409, and never
 * a second row. A retry after a timeout has to be safe, because on a phone on
 * the train it is going to happen.
 */
export const submitContribution = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const shareId = param(req.params.shareId);
    const body = req.body as Record<string, unknown>;

    const idempotencyKey = str(body.idempotencyKey, LIMITS.idempotencyKey);
    if (!idempotencyKey) {
      res.status(400).json({ success: false, error: "Missing submission key. Please reload and try again." });
      return;
    }

    const kind = str(body.kind, 20);
    if (!isContributionKind(kind)) {
      res.status(400).json({ success: false, error: "That isn't something this page collects." });
      return;
    }

    const submitterName = str(body.submitterName, SUBMITTER_NAME_MAX);
    if (!submitterName) {
      res.status(400).json({ success: false, error: "Please add your name so they know who it's from." });
      return;
    }

    const rawPayload = (body.payload && typeof body.payload === "object" ? body.payload : {}) as Record<string, unknown>;
    const validated = validatePayload(kind, rawPayload);
    if (!validated.ok) {
      res.status(400).json({ success: false, error: validated.error });
      return;
    }

    // Dedupe before doing any work. The common repeat is a retry of a request
    // that actually succeeded, and that path should cost one indexed read.
    const already = await Contribution.findOne({ shareId, idempotencyKey });
    if (already) {
      res.json({ success: true, data: contributorView(already) });
      return;
    }

    const page = await resolvePage(shareId, str(body.pageType, LIMITS.pageType));
    if (!page) {
      res.status(404).json({ success: false, error: "That page isn't accepting anything right now." });
      return;
    }

    if ((await Contribution.countDocuments({ shareId })) >= MAX_PER_PAGE) {
      res.status(429).json({ success: false, error: "This page has collected all it can hold." });
      return;
    }

    // A hint for the moderation queue, and nothing more: it sets a flag, it does
    // not reject. The owner decides.
    const flagged = isProfane(`${submitterName} ${validated.moderationText}`);

    try {
      const created = await Contribution.create({
        pageType: page.pageType,
        pageId: page.pageId,
        shareId,
        ownerId: page.ownerId,
        kind,
        submitterName,
        payload: validated.payload,
        // Hardcoded, not read from `body`. This is requirement (2), and it is
        // the whole reason a contribution is safe to accept unauthenticated.
        status: "pending",
        flagged,
        idempotencyKey,
      });

      res.status(201).json({ success: true, data: contributorView(created) });
    } catch (error) {
      // Lost the race against a simultaneous retry of the same key. The row the
      // other request wrote is the row this one wanted, so serve it.
      if (isDuplicateKeyError(error)) {
        const raced = await Contribution.findOne({ shareId, idempotencyKey });
        if (raced) {
          res.json({ success: true, data: contributorView(raced) });
          return;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error("Submit contribution error:", error);
    res.status(500).json({ success: false, error: "Couldn't save that. Please try again." });
  }
};

/**
 * GET /:shareId/published — what the page renders, and what it polls.
 *
 * Published only, and the projection is an allowlist rather than a blocklist:
 * a field added to the model later is invisible here until somebody names it.
 * `ownerId`, `pageId`, `idempotencyKey` and `flagged` are not named, and are the
 * specific things that must never reach this response.
 *
 * An unknown shareId returns an empty list rather than 404 — the recipient's
 * page should render, not error, when nobody has contributed yet, and the two
 * cases are indistinguishable to an honest caller anyway.
 */
export const getPublishedContributions = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const shareId = param(req.params.shareId);

    // Newest first for the limit, so a busy page keeps recent contributions
    // rather than the first 200 ever written; reversed after, so the client
    // receives them oldest-first and can append.
    const rows = await Contribution.find({ shareId, status: "published" })
      .select("kind submitterName payload createdAt")
      .sort({ createdAt: -1 })
      .limit(PUBLIC_READ_LIMIT)
      .lean<PublishedRow[]>();

    res.json({
      success: true,
      data: {
        contributions: rows.reverse().map((row) => ({
          id: String(row._id),
          kind: row.kind,
          submitterName: row.submitterName,
          payload: row.payload,
          createdAt: row.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error("Get published contributions error:", error);
    res.status(500).json({ success: false, error: "Couldn't load contributions" });
  }
};

// ─── Owner ───────────────────────────────────────────────────────────────────
//
// Every query below carries `ownerId: req.userId` in the FILTER, not in a check
// after the read. A filtered query cannot leak a row it never returned, and it
// cannot be defeated by a missing early return.

/**
 * GET /:shareId/queue — everything for this page, pending included.
 *
 * A caller who does not own the page gets an empty list rather than a 403,
 * which is also the honest answer for an owner whose page has no contributions
 * yet. Nothing distinguishes "not yours" from "nothing there", so nothing about
 * other people's pages is confirmed here.
 */
export const getContributionQueue = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const shareId = param(req.params.shareId);

    const rows = await Contribution.find({ shareId, ownerId: userId })
      .select("pageType kind submitterName payload status flagged createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(QUEUE_READ_LIMIT)
      .lean<QueueRow[]>();

    res.json({
      success: true,
      data: {
        contributions: rows.map((row) => ({
          id: String(row._id),
          pageType: row.pageType,
          kind: row.kind,
          submitterName: row.submitterName,
          payload: row.payload,
          status: row.status,
          flagged: row.flagged,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
        pendingCount: rows.filter((row) => row.status === "pending").length,
      },
    });
  } catch (error) {
    console.error("Get contribution queue error:", error);
    res.status(500).json({ success: false, error: "Couldn't load your moderation queue" });
  }
};

/** PATCH /:id/status — approve or reject one contribution. */
export const updateContributionStatus = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const id = param(req.params.id);
    const { status } = req.body as { status?: unknown };

    // "pending" is not settable: it is where a row starts, not somewhere an
    // owner puts it back. Un-publishing is "rejected".
    if (status !== "published" && status !== "rejected") {
      res.status(400).json({ success: false, error: "Status has to be published or rejected." });
      return;
    }

    // Checked rather than left to Mongoose, so a junk id is a clean 404 instead
    // of a CastError landing in the 500 handler.
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ success: false, error: "Contribution not found" });
      return;
    }

    // ownerId in the filter — requirement (2). A row belonging to somebody else
    // simply does not match, and the update touches nothing.
    const updated = await Contribution.findOneAndUpdate(
      { _id: id, ownerId: userId },
      { status },
      { new: true }
    );

    if (!updated) {
      res.status(404).json({ success: false, error: "Contribution not found" });
      return;
    }

    res.json({
      success: true,
      data: { id: String(updated._id), status: updated.status },
    });
  } catch (error) {
    console.error("Update contribution status error:", error);
    res.status(500).json({ success: false, error: "Couldn't update that contribution" });
  }
};

/**
 * POST /:shareId/approve-all — publish every pending contribution on this page.
 *
 * Scoped to "pending" as well as to the owner, so it can never resurrect
 * something the owner already rejected. Approve-all means "approve the ones I
 * haven't looked at", not "undo my decisions".
 */
export const approveAllContributions = async (
  req: Request,
  res: Response<ApiResponse>
): Promise<void> => {
  try {
    const userId = req.userId!;
    const shareId = param(req.params.shareId);

    const result = await Contribution.updateMany(
      { shareId, ownerId: userId, status: "pending" },
      { status: "published" }
    );

    res.json({ success: true, data: { approved: result.modifiedCount } });
  } catch (error) {
    console.error("Approve all contributions error:", error);
    res.status(500).json({ success: false, error: "Couldn't approve those contributions" });
  }
};
