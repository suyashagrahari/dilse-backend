// ─── Why did this draft never get published? ─────────────────────────────────
//
// Two things, both computed from data we already hold, and both handed to the
// email drafter so it writes from fact instead of invention:
//
//   · `classifyStall` — the reason the page stalled, as one of a small set of
//     named cases, with the evidence that decided it.
//   · `summarizeDraft` — how far through the person got, as SHAPE only.
//
// ── WHY THE MODEL IS NOT SHOWN THE DRAFT ITSELF ─────────────────────────────
//
// The obvious implementation hands the whole page document to the model: it is
// the most information, so it should give the best email. It is the wrong call.
//
// These drafts are the most private documents on the platform. An unpublished
// apology page, a proposal, a letter to a brother — written by somebody who has
// not decided to show it to ANYONE yet, not even the person it is addressed to.
// Sending that text to a third-party API to compose a marketing-adjacent nudge
// is a serious thing to do quietly, and it buys almost nothing: to write "you
// got to the paywall on your Rakhi page and stopped — what happened?", the model
// needs the template, the progress and the reason. It does not need the letter.
//
// So `summarizeDraft` returns counts and FIELD NAMES, never field values. The
// recipient's name is withheld too — that is a third party who never used the
// product — which is why the generated email says "your Rakhi page" and not
// "your Rakhi page for Rohit". The creator's own first name is passed, exactly
// as the feedback drafter already does, because we are writing to them.
//
// If a summary ever needs to carry real content, that is a product decision with
// a privacy consequence and it belongs in front of a human, not in a refactor.

import mongoose from "mongoose";
import type { TemplateEntry } from "./templateRegistry";

/** Never counted towards completeness, and never named in a summary. */
const INTERNAL_PATHS = new Set([
  "_id",
  "__v",
  "userId",
  "createdAt",
  "updatedAt",
  "isPublished",
  "publishedAt",
  "shareId",
  "password",
  "passwordRaw",
  "viewCount",
  "installCount",
  "shareCount",
]);

/**
 * Field names that identify somebody other than the creator.
 *
 * Excluded from the summary by name as well as by value: "recipientName is
 * filled" is harmless, but the list is short and being able to say the summary
 * contains nothing about a third party at all is worth more than the signal.
 */
const THIRD_PARTY_PATHS = /name$|^to$|^from$|email|phone|mobile|address|whatsapp/i;

export type StallReason =
  /** Paid template, and they opened checkout without finishing. */
  | "paywall_abandoned"
  /** Paid template, and they never opened checkout at all. */
  | "price_not_attempted"
  /** Free template, barely filled in. They left early. */
  | "just_started"
  /** Free template, partly filled. Ran out of time or hit something. */
  | "unfinished"
  /** Free template, essentially complete, never published. */
  | "ready_not_published";

export interface StallVerdict {
  reason: StallReason;
  /** One line of plain English for the panel, and for the model's prompt. */
  detail: string;
  /** Did money stand in the way? Decides the email's whole shape. */
  blockedByPrice: boolean;
}

export interface DraftSummary {
  /** 0–100. Fraction of the template's own fields that hold something. */
  completeness: number;
  filledFields: number;
  totalFields: number;
  /** Names of filled fields, minus anything identifying a third party. */
  filledFieldNames: string[];
  /** How much they actually wrote, across every text field. */
  wordCount: number;
  photoCount: number;
}

const isEmptyValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Map) return v.size === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
};

const looksLikeMedia = (v: unknown): boolean =>
  typeof v === "string" && /^(https?:\/\/|data:image|blob:)/.test(v) === true;

/**
 * How far through the template this person got, without reading what they wrote.
 *
 * Field names come from the compiled schema rather than a per-template list, so
 * all 43 are described without anybody maintaining anything — the same reasoning
 * as `supportsPassword` in the registry.
 */
export function summarizeDraft(
  entry: TemplateEntry,
  doc: Record<string, unknown>
): DraftSummary {
  const paths = Object.keys(entry.model.schema.paths).filter((p) => {
    if (INTERNAL_PATHS.has(p)) return false;
    // Sub-paths of an array of subdocuments ("memories.0.caption") explode the
    // denominator and say nothing useful; the array itself is counted instead.
    return !p.includes(".");
  });

  let filled = 0;
  let words = 0;
  let photos = 0;
  const filledNames: string[] = [];

  for (const path of paths) {
    const value = doc[path];
    if (isEmptyValue(value)) continue;

    filled++;
    if (!THIRD_PARTY_PATHS.test(path)) filledNames.push(path);

    if (typeof value === "string") {
      if (looksLikeMedia(value)) photos++;
      // A URL is not prose. Counting it inflates "how much they wrote" by
      // hundreds of characters of S3 key.
      else words += value.trim().split(/\s+/).filter(Boolean).length;
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          if (looksLikeMedia(item)) photos++;
          else words += item.trim().split(/\s+/).filter(Boolean).length;
        } else if (item && typeof item === "object") {
          for (const inner of Object.values(item as Record<string, unknown>)) {
            if (typeof inner === "string") {
              if (looksLikeMedia(inner)) photos++;
              else words += inner.trim().split(/\s+/).filter(Boolean).length;
            }
          }
        }
      }
    }
  }

  return {
    completeness: paths.length === 0 ? 0 : Math.round((filled / paths.length) * 100),
    filledFields: filled,
    totalFields: paths.length,
    filledFieldNames: filledNames.slice(0, 40),
    wordCount: words,
    photoCount: photos,
  };
}

export interface StallInputs {
  /** Does this template cost anything right now? */
  isPaid: boolean;
  finalPricePaise: number;
  /** Payment orders for THIS page, any status. */
  orderStatuses: string[];
  summary: DraftSummary;
}

/**
 * Name the reason, in priority order.
 *
 * Price beats progress. Somebody who filled in every field and then met a
 * paywall is a pricing story, not a completion story, and an email that asks
 * "did you run out of time?" when the truth is "they would not pay ₹99" is
 * worse than sending nothing — it tells the recipient we are not paying
 * attention.
 */
export function classifyStall(input: StallInputs): StallVerdict {
  const rupees = Math.round(input.finalPricePaise / 100);

  if (input.isPaid) {
    const tried = input.orderStatuses.some((s) => s === "created" || s === "failed");
    if (tried) {
      return {
        reason: "paywall_abandoned",
        detail: `Opened the ₹${rupees} checkout for this page and did not complete it.`,
        blockedByPrice: true,
      };
    }
    return {
      reason: "price_not_attempted",
      detail: `Reached a paid template (₹${rupees}) and never opened checkout.`,
      blockedByPrice: true,
    };
  }

  // Free template: the only remaining story is how far they got.
  const { completeness, wordCount } = input.summary;

  if (completeness < 25 && wordCount < 15) {
    return {
      reason: "just_started",
      detail: `Free template, only ${completeness}% filled in. Left almost immediately.`,
      blockedByPrice: false,
    };
  }
  if (completeness >= 70 || wordCount >= 120) {
    return {
      reason: "ready_not_published",
      detail: `Free template, ${completeness}% filled and ${wordCount} words written — finished building but never pressed Publish.`,
      blockedByPrice: false,
    };
  }
  return {
    reason: "unfinished",
    detail: `Free template, ${completeness}% filled with ${wordCount} words. Stopped partway.`,
    blockedByPrice: false,
  };
}

/** Whole days since a date, floored. Used for "idle for N days". */
export function daysSince(when: Date | string | undefined, now: Date = new Date()): number {
  if (!when) return 0;
  const then = new Date(when).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** Payment order statuses recorded against one page, newest first. */
export async function orderStatusesForPage(pageId: string): Promise<string[]> {
  if (!mongoose.Types.ObjectId.isValid(pageId)) return [];
  const PaymentOrder = mongoose.model("PaymentOrder");
  const orders = await PaymentOrder.find({ pageId: new mongoose.Types.ObjectId(pageId) })
    .select("status")
    .sort({ createdAt: -1 })
    .lean();
  return (orders as Array<{ status?: string }>).map((o) => String(o.status || ""));
}
