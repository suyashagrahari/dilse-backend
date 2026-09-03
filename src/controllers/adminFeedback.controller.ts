// ─── The super-admin side of post-publish feedback ───────────────────────────
//
// Read the ratings, triage them, and write back from support@subhsandesh.in.
//
// ── WHY GENERATING AND SENDING ARE TWO ROUTES ───────────────────────────────
//
// `draftReply` calls the model and returns text. `sendReply` takes text and
// mails it. Neither does the other's job, and there is no route that does both.
//
// That is not tidiness. The feedback comment is text a member of the public
// typed, and it goes into a prompt — so a single write-and-send button would let
// a stranger's sentence decide the content of an email sent by the company, to a
// customer, over the company's own domain, with nobody having read it. Splitting
// them puts a human and a second click in the path, permanently, in a way a
// later refactor cannot accidentally optimise away.
//
// See `services/feedbackReply.service.ts` for the rest of that reasoning.
//
// ── WHY SUPER ADMIN AND NOT ADMIN ───────────────────────────────────────────
//
// Contact inquiries sit at `requireAdmin`, and this looked like the same kind of
// inbox. It is not: replying here sends mail as SubhSandesh to a named customer,
// and the drafts are machine-written. That belongs with the tier that already
// holds pricing and grants — the capabilities where a mistake is externally
// visible. Reads are gated the same way, because a list of a hundred customers'
// unfiltered opinions of the product is not a thing to widen access to for
// convenience.

import { Request, Response } from "express";
import mongoose from "mongoose";
import PageFeedback, {
  FEEDBACK_STATUSES,
  NOTES_MAX,
  REPLY_MAX,
  SUBJECT_MAX,
  type FeedbackStatus,
} from "../models/PageFeedback";
import { sendFeedbackReplyEmail } from "../utils/mailer";
import { audit } from "../services/adminAudit";
import { appendMessage, latestThreadForPage, openThread } from "../services/threadStore.service";
import EmailThread from "../models/EmailThread";
import { subjectKey, threadingHeadersFor } from "../services/emailThread.service";
import {
  AiRefusedError,
  AiUnavailableError,
  draftFeedbackReply,
} from "../services/feedbackReply.service";

const PAGE_SIZE_MAX = 100;
const REPLY_MIN = 20;

/** The `filter` query values the panel offers, and what each means. */
type ListFilter = "all" | "new" | "read" | "replied" | "unreplied" | "negative" | "with-comment";

function filterQuery(filter: string): Record<string, unknown> {
  switch (filter as ListFilter) {
    case "new":
      return { status: "new" };
    case "read":
      return { status: "read" };
    case "replied":
      return { status: "replied" };
    case "unreplied":
      return { status: { $ne: "replied" } };
    // The two that actually get used day to day: what needs attention, and what
    // has words in it. A four-star with no comment is not a queue item.
    case "negative":
      return { rating: { $lte: 3 } };
    case "with-comment":
      return { comment: { $nin: ["", null] } };
    default:
      return {};
  }
}

/**
 * GET /api/admin/feedback?page=&limit=&filter=&slug=&rating=
 *
 * The list, plus the summary numbers the header shows. Both come from one
 * request because the panel renders them together and two round trips would let
 * the count and the rows disagree on screen.
 */
/**
 * The subject key the feedback→conversation lookup uses.
 *
 * ── WHY THIS DELEGATES INSTEAD OF NORMALISING ───────────────────────────────
 *
 * It used to do its own: strip one leading `re:`, trim, lowercase. `openThread`
 * meanwhile stores `subjectKey(subject)`, which also collapses runs of
 * whitespace and strips STACKED `Re:`/`Fwd:` prefixes.
 *
 * The subject here is hand-typed by a super admin, so the gap was reachable by
 * typing. "Thanks  for the feedback" with two spaces produced a different key
 * from the one stored for "Thanks for the feedback", the lookup missed, and a
 * SECOND conversation was opened with the same person about the same thing —
 * with their original feedback comment re-appended as its opening message.
 * Twelve typed spellings of one subject produced five distinct keys.
 *
 * Nothing errored. The panel just filled with near-identical conversations,
 * and because an inbound reply matches on `userEmail + subjectKey` sorted by
 * `seq` descending, it landed on the newest fragment while the earlier ones sat
 * there looking abandoned.
 *
 * So there is one normaliser now, and it is the one the write uses. A test
 * pins them to each other rather than to a literal, so they cannot drift again.
 */
export function feedbackThreadSubjectKey(subject: string): string {
  return subjectKey(subject);
}

export const getFeedbackList = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20)
    );
    const filter = String(req.query.filter || "all");
    const slug = String(req.query.slug || "").trim().toLowerCase();
    const rating = parseInt(String(req.query.rating || ""), 10);

    const query: Record<string, unknown> = { ...filterQuery(filter) };
    if (slug) query.templateSlug = slug;
    if (Number.isInteger(rating) && rating >= 1 && rating <= 5) query.rating = rating;

    const [items, total, stats, byStar, byTemplate] = await Promise.all([
      PageFeedback.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PageFeedback.countDocuments(query),

      // Summary over EVERYTHING, not over the current filter: the header is a
      // health reading of the product, and an average that moves when you click
      // "1 star" is not a reading of anything.
      PageFeedback.aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avg: { $avg: "$rating" },
            newCount: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } },
            repliedCount: { $sum: { $cond: [{ $eq: ["$status", "replied"] }, 1, 0] } },
            withComment: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$comment", ""] } }, 0] }, 1, 0] } },
          },
        },
      ]),
      PageFeedback.aggregate([{ $group: { _id: "$rating", count: { $sum: 1 } } }]),
      PageFeedback.aggregate([
        {
          $group: {
            _id: "$templateSlug",
            label: { $first: "$templateLabel" },
            count: { $sum: 1 },
            avg: { $avg: "$rating" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 40 },
      ]),
    ]);

    const s = stats[0] || {};
    const starCounts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of byStar) starCounts[String(row._id)] = row.count;

    res.json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        stats: {
          count: s.count || 0,
          // One decimal place, computed here so the panel and any future
          // consumer round the same way.
          avg: s.count ? Math.round((s.avg || 0) * 10) / 10 : 0,
          newCount: s.newCount || 0,
          repliedCount: s.repliedCount || 0,
          withComment: s.withComment || 0,
          starCounts,
        },
        templates: byTemplate.map((t) => ({
          slug: t._id || "",
          label: t.label || t._id || "",
          count: t.count,
          avg: Math.round((t.avg || 0) * 10) / 10,
        })),
      },
    });
  } catch (error) {
    console.error("Get feedback list error:", error);
    res.status(500).json({ success: false, error: "Failed to load feedback" });
  }
};

/** Load one row by id, answering 400/404 itself. Returns null when it did. */
async function loadOr404(req: Request, res: Response) {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: "Invalid feedback id" });
    return null;
  }
  const doc = await PageFeedback.findById(id);
  if (!doc) {
    res.status(404).json({ success: false, error: "Feedback not found" });
    return null;
  }
  return doc;
}

/** PATCH /api/admin/feedback/:id/status — `{ status: "new" | "read" | "replied" }` */
export const setFeedbackStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await loadOr404(req, res);
    if (!doc) return;

    const status = String(req.body?.status || "") as FeedbackStatus;
    if (!FEEDBACK_STATUSES.includes(status)) {
      res.status(400).json({ success: false, error: "Unknown status" });
      return;
    }
    // "replied" is set by sending, not by asserting. Letting it be set by hand
    // would mean the panel could show a reply that no email backs up.
    if (status === "replied" && doc.replies.length === 0) {
      res.status(400).json({
        success: false,
        error: "Nothing has been replied to yet — send a reply instead.",
      });
      return;
    }

    doc.status = status;
    await doc.save();
    res.json({ success: true, data: { status: doc.status } });
  } catch (error) {
    console.error("Set feedback status error:", error);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
};

/** PATCH /api/admin/feedback/:id/notes — internal notes, never emailed. */
export const setFeedbackNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await loadOr404(req, res);
    if (!doc) return;

    doc.adminNotes = String(req.body?.adminNotes ?? "").slice(0, NOTES_MAX);
    await doc.save();
    res.json({ success: true, data: { adminNotes: doc.adminNotes } });
  } catch (error) {
    console.error("Set feedback notes error:", error);
    res.status(500).json({ success: false, error: "Failed to save notes" });
  }
};

/** DELETE /api/admin/feedback/:id */
export const deleteFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await loadOr404(req, res);
    if (!doc) return;
    await doc.deleteOne();
    res.json({ success: true, message: "Feedback deleted" });
  } catch (error) {
    console.error("Delete feedback error:", error);
    res.status(500).json({ success: false, error: "Failed to delete feedback" });
  }
};

/**
 * POST /api/admin/feedback/:id/draft-reply
 *
 * Writes a reply and returns it. Sends nothing, saves nothing, and changes no
 * status — pressing this button must be free, so that a super admin can
 * generate, dislike it, and generate again without leaving a trail of
 * half-answered tickets.
 */
export const draftReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await loadOr404(req, res);
    if (!doc) return;

    const draft = await draftFeedbackReply({
      rating: doc.rating,
      comment: doc.comment || "",
      templateLabel: doc.templateLabel || "",
      userName: doc.userName || "",
    });

    res.json({ success: true, data: draft });
  } catch (error) {
    // Three outcomes worth telling apart, because the fix differs: no key is a
    // deployment problem, a refusal is worth one retry, and anything else is a
    // bug. Collapsing them into 500 sends a super admin to the wrong place.
    if (error instanceof AiUnavailableError) {
      res.status(503).json({ success: false, error: error.message || "The AI is unavailable" });
      return;
    }
    if (error instanceof AiRefusedError) {
      res.status(422).json({
        success: false,
        error: "The draft came back unusable. Press Generate again, or write it yourself.",
      });
      return;
    }
    console.error("Draft feedback reply error:", error);
    res.status(500).json({ success: false, error: "Failed to generate a draft" });
  }
};

/**
 * POST /api/admin/feedback/:id/reply
 *
 * `{ subject, body, aiAssisted? }` — sends exactly this text.
 *
 * `aiAssisted` is a claim by the panel about where the text came from, recorded
 * for the record only. Nothing branches on it, so a wrong value cannot change
 * what is sent; it exists so that looking back at a reply later tells you
 * whether a person wrote it or approved it.
 */
export const sendReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const doc = await loadOr404(req, res);
    if (!doc) return;

    const subject = String(req.body?.subject ?? "")
      // A CRLF here would be header injection, so it is removed rather than
      // trimmed — the same rule the drafter applies to the model's output,
      // repeated because this route also accepts hand-typed text.
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, SUBJECT_MAX);
    const body = String(req.body?.body ?? "").replace(/\r\n/g, "\n").trim().slice(0, REPLY_MAX);
    const aiAssisted = req.body?.aiAssisted === true;

    if (!subject) {
      res.status(400).json({ success: false, error: "The email needs a subject." });
      return;
    }
    if (body.length < REPLY_MIN) {
      res.status(400).json({
        success: false,
        error: `Write at least ${REPLY_MIN} characters before sending.`,
      });
      return;
    }
    if (!doc.userEmail) {
      res.status(400).json({
        success: false,
        error: "This feedback has no email address on it, so there is nowhere to reply.",
      });
      return;
    }

    // ── Find the conversation first, but only to READ it ───────────────────
    //
    // The mail needs `In-Reply-To` and `References` pointing at the last
    // message that has an id, and those have to be on the message when it is
    // sent — they cannot be added afterwards. So the lookup moves above the
    // send while the WRITE stays below it.
    //
    // Without this, our second reply to the same person referenced nothing:
    // their mail client showed two unrelated emails, and their answer to
    // either carried no id we recognised.
    //
    // A failure here must not stop the reply going out — threading is a
    // nicety, an unsent support reply is not. Hence the empty fallback.
    let existing: { _id: mongoose.Types.ObjectId; messages?: unknown[] } | null = null;
    try {
      existing = await EmailThread.findOne({
        kind: "feedback",
        userEmail: doc.userEmail.toLowerCase(),
        subjectKey: feedbackThreadSubjectKey(subject),
      })
        .sort({ seq: -1 })
        .lean<{ _id: mongoose.Types.ObjectId; messages?: unknown[] }>();
    } catch (error) {
      console.error("Could not read the conversation before replying:", error);
    }

    const threading = threadingHeadersFor(
      ((existing?.messages || []) as {
        direction?: string;
        rfcMessageId?: string;
        rfcMessageIdSource?: string;
        references?: string[];
      }[]).map((m) => ({
        direction: m.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
        rfcMessageId: m.rfcMessageId,
        rfcMessageIdSource: m.rfcMessageIdSource as "received" | "reconstructed" | "" | undefined,
        references: m.references,
      }))
    );

    // ── Send BEFORE recording ──────────────────────────────────────────────
    //
    // Deliberately this order. If the mail fails, nothing is written and the
    // panel still shows the ticket as unanswered, which is true. The reverse
    // order — record, then send — would show a reply that never left the
    // building, and the person reading the panel would have no way to know.
    const sent = await sendFeedbackReplyEmail({
      to: doc.userEmail,
      toName: doc.userName || "",
      subject,
      body,
      rating: doc.rating,
      templateLabel: doc.templateLabel || "",
      headers: { inReplyTo: threading.inReplyTo, references: threading.references },
    });

    doc.replies.push({
      subject,
      body,
      sentAt: new Date(),
      sentByEmail: (req.userEmail || "").toLowerCase(),
      aiAssisted,
    });
    doc.status = "replied";
    await doc.save();

    // ── Record it as a conversation too ───────────────────────────────────
    //
    // `doc.replies` is the ticket's own history and stays as it is. This adds
    // the same message to EmailThread, which is what /admin/threads reads and
    // what an incoming reply gets matched against.
    //
    // Without this the feedback flow was one-directional: we could write, the
    // creator could answer, and their answer had no conversation to join — it
    // arrived as an "Unmatched" thread with no context, or matched only by the
    // loosest rung of the ladder.
    //
    // Failing here must NOT fail the request. The email has already gone; a
    // missing conversation entry is a display problem, telling a super admin
    // the reply failed would invite them to send it twice.
    try {
      // The same row read above, not a second query — and `null` there means
      // there is genuinely none, so this opens one.
      let thread: { _id: mongoose.Types.ObjectId } | null = existing;

      if (!thread) {
        const opened = await openThread(
          {
            kind: "feedback",
            userId: String(doc.userId),
            userName: doc.userName || "",
            userEmail: doc.userEmail,
            templateType: doc.templateSlug || "",
            templateLabel: doc.templateLabel || "",
          },
          subject
        );
        thread = { _id: opened._id as mongoose.Types.ObjectId };

        // The creator's own feedback comment opens the conversation, so the
        // reply reads as an answer to something rather than as the first
        // thing anybody said.
        if (doc.comment && doc.comment.trim()) {
          await appendMessage(thread._id, {
            direction: "inbound",
            subject,
            body: doc.comment.trim(),
            at: doc.createdAt || new Date(),
            source: "manual",
          });
        }
      }

      await appendMessage(thread._id, {
        direction: "outbound",
        subject,
        body,
        byEmail: req.userEmail || "",
        // Answered by the mailer rather than repeated here, so the conversation
        // can say which address the creator actually saw. Feedback replies go
        // out as support@, not the feedback@ that conversation replies default
        // to, and that difference was previously invisible in the panel.
        fromAddress: sent.fromAddress,
        aiAssisted,
        // ── The id of what we just sent, when we know it ────────────────────
        //
        // This used to be hardcoded to "" because feedback replies went via
        // Resend, which reports no Message-ID. That cost the top rung of the
        // inbound matching ladder: with no id to point `In-Reply-To` at, a
        // creator's reply could only be matched by their account email, so
        // anyone replying from a different address landed in Unmatched.
        //
        // Feedback replies now go via SES first, which returns an id that
        // reconstructs the real header exactly. It is still "" on the Resend
        // fallback path — honestly empty rather than a guess.
        rfcMessageId: sent.rfcMessageId,
        rfcMessageIdSource: sent.rfcMessageId ? "reconstructed" : "",
        source: sent.via === "ses" ? "ses" : "resend",
      });
    } catch (error) {
      console.error("Sent the feedback reply but failed to record the conversation:", error);
    }

    // Staff acting on a customer, so it is audited — the same line the page
    // password controller draws between ordinary use and privileged action.
    await audit(req, {
      action: "feedback.reply_sent",
      targetUserId: String(doc.userId),
      targetUserEmail: doc.userEmail,
      targetTemplateType: doc.templateSlug,
      reason: aiAssisted ? "AI-assisted draft, approved and sent" : "Written by hand",
    });

    res.json({
      success: true,
      message: `Sent to ${doc.userEmail}`,
      data: { replies: doc.replies, status: doc.status },
    });
  } catch (error) {
    console.error("Send feedback reply error:", error);
    res.status(500).json({ success: false, error: "Failed to send the reply" });
  }
};
