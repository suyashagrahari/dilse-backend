// ─── POST /admin/contacts/:id/draft-reply ─────────────────────────────────────
//
// Builds the context for one Contact-page message — who wrote it, what they
// have made with us, which template they are most likely writing about — and
// asks the model for a reply. Returns {subject, body, reading, context}; it
// sends nothing and saves nothing. A human edits and presses Send.

import type { Request, Response } from "express";
import mongoose from "mongoose";
import ContactInquiry from "../models/ContactInquiry";
import User from "../models/User";
import PageFeedback from "../models/PageFeedback";
import PaymentOrder from "../models/PaymentOrder";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";
import { getPricing } from "../config/templatePricing";
import { UNKNOWN_COUNTRY_AUDIENCE } from "../config/seasonSale"; // only `isFree` is read: the same on both sides of the season split
import {
  draftContactReply,
  ContactAiRefusedError,
  ContactAiUnavailableError,
  type ContactAiContext,
  type ContactPageForAi,
} from "../services/contactReplyAi.service";

interface PageRow extends ContactPageForAi {
  pageId: string;
  templateType: string;
}

/** Every page this user made, newest first, with how each was unlocked. */
async function pagesFor(userId: mongoose.Types.ObjectId): Promise<PageRow[]> {
  const groups = await Promise.all(
    TEMPLATE_REGISTRY.map(async (entry) => {
      const docs = (await entry.model
        .find({ userId })
        .select("isPublished createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()) as unknown as { _id: unknown; isPublished?: boolean; createdAt: Date }[];
      return docs.map((d) => ({ ...d, templateType: entry.templateType, templateLabel: entry.label }));
    })
  );
  const rows = groups.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
  if (!rows.length) return [];

  const orders = await PaymentOrder.find({ userId, status: { $in: ["paid", "points_used"] } }).select("pageId status").lean();
  const byPage = new Map(orders.map((o) => [String(o.pageId), o.status]));
  const pricing = new Map<string, boolean>();
  for (const t of new Set(rows.map((r) => r.templateType))) pricing.set(t, (await getPricing(t, UNKNOWN_COUNTRY_AUDIENCE)).isFree);

  return rows.map((r) => {
    const status = byPage.get(String(r._id));
    const access: ContactPageForAi["access"] =
      status === "paid" ? "paid" : status === "points_used" ? "points" : pricing.get(r.templateType) === false && !r.isPublished ? "unpaid" : "free";
    return {
      pageId: String(r._id),
      templateType: r.templateType,
      templateLabel: r.templateLabel,
      createdAt: r.createdAt,
      isPublished: !!r.isPublished,
      access,
    };
  });
}

/**
 * The template the message is most likely about: a template name written in
 * the message wins (longest match, so "Birthday GF" beats "Birthday"); else
 * their most recent page if it was made within two weeks before the message.
 */
function likelyTemplate(message: string, pages: PageRow[], receivedAt: Date): string | null {
  const text = message.toLowerCase();
  const named = TEMPLATE_REGISTRY.map((t) => t.label)
    .filter((label) => label && label.length >= 4 && text.includes(label.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (named) return named;
  const recent = pages[0];
  if (recent && receivedAt.getTime() - new Date(recent.createdAt).getTime() < 14 * 86_400_000) {
    return `${recent.templateLabel} (their most recent page — not named in the message)`;
  }
  return null;
}

export const draftContactReplyHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: "Invalid id" });
      return;
    }
    const item = await ContactInquiry.findById(id).lean();
    if (!item) {
      res.status(404).json({ success: false, error: "Inquiry not found" });
      return;
    }

    const user = await User.findOne({ email: String(item.email || "").toLowerCase().trim() }).select("name createdAt").lean();
    const pages = user ? await pagesFor(user._id) : [];
    const feedback = user
      ? await PageFeedback.find({ userEmail: String(item.email).toLowerCase() })
          .sort({ createdAt: -1 })
          .limit(5)
          .select("templateLabel rating comment")
          .lean()
      : [];
    const receivedAt = new Date(item.createdAt);

    const ctx: ContactAiContext = {
      name: item.name || user?.name || "",
      message: item.message || "",
      receivedAt,
      previousReplies: (item.replies || []).map((r) => ({ body: r.body, sentAt: r.sentAt })),
      account: user
        ? {
            memberSince: user.createdAt,
            pages,
            feedback: feedback.map((f) => ({ templateLabel: f.templateLabel || "a page", rating: f.rating, comment: f.comment || "" })),
          }
        : null,
      likelyTemplate: likelyTemplate(item.message || "", pages, receivedAt),
    };

    const draft = await draftContactReply(ctx);
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      data: {
        ...draft,
        // What the draft was based on — shown to the admin so they can sanity-check it.
        context: {
          hasAccount: !!user,
          userId: user ? String(user._id) : null,
          pages: pages.slice(0, 8).map((p) => ({ templateLabel: p.templateLabel, isPublished: p.isPublished, access: p.access, createdAt: p.createdAt })),
          likelyTemplate: ctx.likelyTemplate,
        },
      },
    });
  } catch (error) {
    if (error instanceof ContactAiUnavailableError) {
      res.status(503).json({ success: false, error: error.message });
      return;
    }
    if (error instanceof ContactAiRefusedError) {
      res.status(422).json({ success: false, error: error.message });
      return;
    }
    console.error("Contact draft-reply error:", error);
    res.status(500).json({ success: false, error: "Could not draft a reply" });
  }
};
