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

// ─── The public wall ─────────────────────────────────────────────────────────
//
// `GET /api/feedback/public` — what creators said, on a page anybody can read
// without signing in.
//
// ── WHAT IS DELIBERATELY NOT IN THE RESPONSE ────────────────────────────────
//
// This is the whole reason the projection below is written out field by field
// rather than as an exclusion list. A row in this collection also carries
// `userEmail`, `pageUrl`, `ipAddress`, `userAgent`, `adminNotes` and the full
// `replies` thread, and every one of those would be a genuine leak:
//
//   · `pageUrl` is a LINK TO SOMEBODY'S PRIVATE CARD — a birthday page made for
//     one person, some of them password-protected. Publishing the feedback next
//     to the URL it is about would turn a testimonials page into a directory of
//     strangers' private pages. This is the most serious of the five and the
//     reason the projection is a whitelist: an exclusion list silently leaks
//     whatever field is added to the model next.
//   · `userEmail` and `ipAddress` are personal data with no business here.
//   · `adminNotes` and `replies` are internal support correspondence.
//
// ── AND WHY THE NAME IS CUT DOWN ────────────────────────────────────────────
//
// First name only, and nothing at all when what we hold does not look like a
// name someone chose to be called. People signed up to make a card, not to be
// quoted on a marketing page under their full legal name, and a wall of first
// names reads warmer than one of full ones anyway.
//
// ── THE COMMENT FILTER ──────────────────────────────────────────────────────
//
// A comment containing an email address or a URL is published as a rating with
// no words. Two reasons, and the first is the real one: people put their own
// contact details in feedback boxes ("call me on…", "my page is at…"), and
// republishing that is the same leak as `userEmail` wearing different clothes.
// The second is that it is also what link spam looks like. The rating still
// counts towards the average — their opinion is not discarded, only their
// phone number.
//
// None of this is moderation. There is no approval step, so a genuinely abusive
// comment would appear here the moment it is written. That is a real gap and it
// wants an admin toggle on the row; it is called out rather than quietly
// half-solved.

/**
 * Looks like a way to contact somebody: an email, a URL, a bare domain, or a
 * phone number.
 *
 * The phone half is the one that is easy to forget and was: the first version
 * caught "my page is at example.com" and published "call me on 9876543210"
 * word for word. Eight or more digits, allowing the spaces, dashes and brackets
 * people actually type, is long enough to miss a year ("in 2009"), a price, or
 * a count, and short enough to catch every real number including a landline.
 * The masked form ("98xxxxxx") is caught too — somebody writing that is just as
 * clearly handing out a number.
 */
const CONTACTISH = new RegExp(
  [
    /\S+@\S+\.\S+/.source,                                   // email
    /https?:\/\//.source,                                      // explicit link
    /\bwww\./.source,                                          // bare www
    /\b[a-z0-9-]+\.(com|in|net|org|co|io|me)\b/.source,        // bare domain
    /\+?\d[\d\s().-]{6,}\d/.source,                            // phone number
    /\d{2,}\s*x{3,}/.source,                                    // a masked one
  ].join("|"),
  "i"
);

/** The first name, or "" when what we hold is not one. */
function publicName(raw: string): string {
  const name = String(raw ?? "").trim();
  if (!name) return "";
  const first = name.split(/\s+/)[0];
  if (first.length > 18) return "";
  // An email local-part or a handle is a login, not something to be called.
  if (/[@_.]|\d{3}/.test(first)) return "";
  return first;
}

export const listPublicFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;

    // ── Filters ───────────────────────────────────────────────────────────
    const ratingParam = String(q.rating ?? "all").toLowerCase();
    const rating = /^[1-5]$/.test(ratingParam) ? Number(ratingParam) : null;
    const withWords = String(q.words ?? "") === "1";
    const sort = String(q.sort ?? "recent").toLowerCase();

    const limit = Math.min(Math.max(Number(q.limit) || 24, 1), 60);
    const skip = Math.max(Number(q.skip) || 0, 0);

    const match: Record<string, unknown> = {};
    if (rating !== null) match.rating = rating;
    // ── "Only with words" has to mean words the READER will see ───────────
    //
    // A row whose comment is stripped for containing contact details is
    // published as a rating with no text, so filtering on "comment is not
    // empty" alone promised words and delivered three cards saying "Rated 4 out
    // of 5". The same pattern that does the stripping does the filtering, so
    // the two cannot disagree — which is also why it is one constant and not
    // two copies.
    if (withWords) match.comment = { $nin: ["", null], $not: CONTACTISH };

    // ── The stats are over EVERYTHING, never the filtered slice ───────────
    //
    // An average that moves when you tap "5 stars" is not an average, it is a
    // tautology. The summary describes the whole body of feedback; the list
    // below it is what the filters act on.
    const [rows, distribution, total] = await Promise.all([
      PageFeedback.find(match)
        .select("userName rating comment templateLabel createdAt")
        .sort(sort === "rating" ? { rating: -1, createdAt: -1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean(),
      PageFeedback.aggregate([{ $group: { _id: "$rating", n: { $sum: 1 } } }]),
      PageFeedback.countDocuments(match),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distribution) {
      const star = Number((d as { _id: unknown })._id);
      if (star >= 1 && star <= 5) counts[star] = Number((d as { n: unknown }).n) || 0;
    }
    const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
    const sum = Object.entries(counts).reduce((a, [star, n]) => a + Number(star) * n, 0);

    res.json({
      success: true,
      data: {
        // Whitelisted field by field. See the note above before adding to this.
        items: page.map((r) => {
          const row = r as unknown as {
            _id: unknown; userName: string; rating: number; comment: string;
            templateLabel: string; createdAt: Date;
          };
          const comment = String(row.comment ?? "").trim();
          return {
            id: String(row._id),
            name: publicName(row.userName),
            rating: Number(row.rating) || 0,
            comment: CONTACTISH.test(comment) ? "" : comment,
            template: String(row.templateLabel ?? ""),
            createdAt: row.createdAt,
          };
        }),
        hasMore,
        matched: total,
        stats: {
          total: allCount,
          average: allCount ? Math.round((sum / allCount) * 10) / 10 : 0,
          counts,
        },
      },
    });
  } catch (error) {
    console.error("List public feedback error:", error);
    res.status(500).json({ success: false, error: "Could not load feedback" });
  }
};
