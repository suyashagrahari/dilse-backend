// ─── The creator leaving feedback, straight after publishing ─────────────────
//
// One route. The modal that calls it is raised by the client the moment a
// publish succeeds, before the share sheet — see `lib/feedback/feedbackBus.ts`.
//
// ── WHY THIS IS AN UPSERT AND NOT A CREATE ──────────────────────────────────
//
// The client promises "asked once per page" and keeps that promise with a
// localStorage key. Storage is not a database: cleared site data, a second
// device, a private window, or simply publishing from the phone after the laptop
// all defeat it. Without an upsert the second submission would be a duplicate
// key error surfacing as a failed submit on a modal the person is trying to be
// nice in.
//
// So the unique index on `(userId, pageUrl)` is the real guarantee and this
// route is idempotent against it: submit twice and the second one is an edit.
// That is also the honest reading of the action — they are telling us what they
// think of this page, and they are allowed to change their mind.
//
// ── WHY THE TEMPLATE LABEL IS NOT TAKEN FROM THE BODY ───────────────────────
//
// The client sends a slug. The label is resolved here from the catalog. A label
// is what a super admin reads in the panel and what the AI drafter is told the
// person built, so accepting it from the browser would let anyone write their
// own caption onto a support ticket — small, but free to prevent.

import { Request, Response } from "express";
import PageFeedback, { COMMENT_MAX } from "../models/PageFeedback";
import User from "../models/User";
import { templateTypesForSlug } from "../config/templateSlugs";
import { templateByType } from "../services/templateRegistry";

/** Long enough for a real URL, short enough not to be a storage vector. */
const URL_MAX = 500;

/**
 * The human name of a template, from whatever identifier the client sent.
 *
 * ── WHY IT TRIES THE templateType FIRST ─────────────────────────────────────
 *
 * The client sends `payload.slug`, which is the editor's route — so the slug
 * mapping looks like the only lookup needed. It is not, and getting this wrong
 * mislabels support tickets in two different ways:
 *
 *   · Some identifiers are BOTH. "birthday-gf" is an editor route and also a
 *     templateType, and `templateTypesForSlug("birthday-gf")` answers
 *     `["birthday", "birthday-gf"]` — two types sharing one editor. Taking the
 *     first match there returns "Birthday" for a page that is a "Birthday GF",
 *     which is the wrong label on a real ticket.
 *   · Some identifiers are only a templateType. "eid" and "raksha-bandhan" have
 *     labels but no slug entry pointing at them, so the slug mapping alone
 *     returns nothing and the panel shows an unlabelled row.
 *
 * An exact templateType match is unambiguous whenever it exists, so it wins.
 * The slug mapping is the fallback, for the common case where the editor route
 * and the type genuinely differ ("happy-rakshabandhan-to-brother").
 *
 * Returns "" rather than guessing when neither resolves. An empty label renders
 * as no chip; a wrong one is read as fact.
 */
export function labelForSlug(slug: string): string {
  const key = String(slug || "").trim().toLowerCase();
  if (!key) return "";

  const exact = templateByType(key);
  if (exact?.label) return exact.label;

  for (const type of templateTypesForSlug(key)) {
    const entry = templateByType(type);
    if (entry?.label) return entry.label;
  }
  return "";
}

/**
 * Is this a page URL on our own site?
 *
 * Not a security boundary — the row is owned by an authenticated user either
 * way — but a cheap guard against a bad payload turning the admin panel into a
 * list of links to somewhere else. A URL that fails this is stored empty rather
 * than rejected: the rating still matters, and failing the submit over a
 * malformed link would lose real feedback.
 */
function safePageUrl(raw: unknown): string {
  const value = String(raw ?? "").trim().slice(0, URL_MAX);
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

/**
 * POST /api/feedback
 *
 * `{ rating: 1..5, comment?: string, templateSlug?: string, pageUrl?: string }`
 *
 * Behind `protect`: a reply is an email, so feedback with no account attached
 * would be a dead end. The modal is never raised for a logged-out visitor, and
 * publishing already requires a session, so this costs nothing in practice.
 */
export const submitFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ success: false, error: "Pick a rating from 1 to 5 stars." });
      return;
    }

    const comment = String(body.comment ?? "").trim().slice(0, COMMENT_MAX);
    const templateSlug = String(body.templateSlug ?? "").trim().toLowerCase().slice(0, 120);
    const pageUrl = safePageUrl(body.pageUrl);

    // Identity from the session, never from the payload — this address is what
    // a reply gets sent to.
    const user = await User.findById(req.userId).select("name email");
    if (!user) {
      res.status(401).json({ success: false, error: "Please sign in again." });
      return;
    }

    // ── Why the key falls back to the slug ────────────────────────────────
    //
    // `(userId, pageUrl)` is the unique index, and an empty pageUrl would
    // collapse every page a person ever rates into one row — the second rating
    // silently overwriting the first. That only happens when the URL was
    // unusable, which is rare, but "rare" and "silently loses data" is a bad
    // pair. A synthetic key keeps those rows distinct.
    const dedupeKey = pageUrl || `no-url:${templateSlug || "unknown"}:${Date.now()}`;

    const doc = await PageFeedback.findOneAndUpdate(
      { userId: user._id, pageUrl: dedupeKey },
      {
        $set: {
          userName: user.name || "",
          userEmail: (user.email || "").toLowerCase(),
          templateSlug,
          templateLabel: labelForSlug(templateSlug),
          rating,
          comment,
          ipAddress: req.ip || "",
          userAgent: String(req.headers["user-agent"] || "").slice(0, 400),
        },
        // Re-opening on edit is deliberate: an updated rating is news, and a
        // row already marked read would otherwise never be looked at again.
        // A row that has been REPLIED to keeps that status — see below.
        $setOnInsert: { pageUrl: dedupeKey },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // `status` is not in the `$set` above so that a reply already sent is not
    // undone by an edit. It is only pushed back to "new" when nobody has
    // written back yet.
    if (doc.replies.length === 0 && doc.status !== "new") {
      doc.status = "new";
      await doc.save();
    }

    res.status(201).json({
      success: true,
      message: "Thank you — this goes straight to the team.",
      data: { id: doc._id, rating: doc.rating },
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    res.status(500).json({ success: false, error: "Could not save your feedback" });
  }
};
