// ─── Who a broadcast can go to ───────────────────────────────────────────────
//
// One row per account, carrying everything the /admin/outreach filters ask
// about: is the email verified, how many pages they made and published, what
// stars they gave, whether they ever paid, and when we last wrote to them.
//
// ── WHY IT IS BUILT IN MEMORY ───────────────────────────────────────────────
//
// Pages live in 43 collections, one per template, so "users with 5+ pages who
// rated 1–3 stars" cannot be one Mongo query. Each collection is grouped by
// `userId` once (indexed, cheap), feedback, payments and broadcasts once each,
// and the results are merged onto the user list. At today's size that is a
// few thousand small objects — well inside what one process holds — and it is
// cached for a minute so paging and flipping filters do not redo the fan-out.
//
// ── THE FILTER RUNS HERE, NOT IN THE BROWSER ────────────────────────────────
//
// "Select all 412 matching" must mean the same 412 on the server that the
// panel counted. So the filter is one function, `applyFilters`, and both the
// list route and the send route call it. The browser never sends a list of
// people it worked out itself unless the super admin ticked them one by one.
//
// ── WHO CAN NEVER BE SELECTED ───────────────────────────────────────────────
//
// `isSendable` is applied on every send regardless of the filter: an email
// address nobody has proven they own, a suspended or banned account, and
// anybody who asked us to stop. The "verified" chip in the panel only changes
// what is SHOWN; it cannot make an unverified address receive mail.

import mongoose from "mongoose";
import User from "../models/User";
import PageFeedback from "../models/PageFeedback";
import PaymentOrder from "../models/PaymentOrder";
import Broadcast from "../models/Broadcast";
import Wishlist, { WISHLIST_CAMPAIGNS } from "../models/Wishlist";
import { TEMPLATE_LOOKUPS } from "../controllers/share.controller";
import { templateLabel } from "../config/templateCatalog";

export interface AudienceRow {
  userId: string;
  name: string;
  email: string;
  /** Proved they own the address: a verified code, or a Google sign-in. */
  verified: boolean;
  provider: "local" | "google";
  status: string;
  optedOut: boolean;
  joinedAt: string;
  pages: number;
  published: number;
  templates: { type: string; label: string; count: number }[];
  lastPageAt: string | null;
  feedbackCount: number;
  avgRating: number | null;
  ratings: number[];
  lastRating: number | null;
  commentCount: number;
  paidOrders: number;
  lastEmailedAt: string | null;
  /** Wishlists joined (campaign keys), e.g. ["valentine-2027"]. */
  wishlists: string[];
}

export interface AudienceFilters {
  q: string;
  verified: "verified" | "all";
  /** Gave at least one rating among these. Empty = no rating filter. */
  ratings: number[];
  feedback: "any" | "given" | "none" | "comment";
  pages: "any" | "0" | "1" | "2-4" | "5+" | "1+";
  published: "any" | "yes" | "no";
  template: string;
  joined: "any" | "7" | "30" | "90" | "365";
  active: "any" | "7" | "30" | "90" | "idle30" | "idle90";
  provider: "any" | "google" | "local";
  paid: "any" | "yes" | "no";
  emailed: "any" | "never" | "not14" | "not30";
  /** "any" | "none" | a campaign key — joined that wishlist. */
  wishlist: string;
  optout: "hide" | "only";
  sort: "joined" | "pages" | "rating" | "active" | "name";
  order: "asc" | "desc";
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], dflt: T): T =>
  (allowed as readonly string[]).includes(String(v)) ? (String(v) as T) : dflt;

/** Accepts a query string object or a JSON body — the send route gets the latter. */
export function parseFilters(src: Record<string, unknown> = {}): AudienceFilters {
  const rawRatings = Array.isArray(src.ratings) ? src.ratings : String(src.ratings ?? "").split(",");
  const ratings = [...new Set(rawRatings.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5))].sort();
  return {
    q: String(src.q ?? "").trim().toLowerCase().slice(0, 120),
    verified: pick(src.verified, ["verified", "all"] as const, "verified"),
    ratings,
    feedback: pick(src.feedback, ["any", "given", "none", "comment"] as const, "any"),
    pages: pick(src.pages, ["any", "0", "1", "2-4", "5+", "1+"] as const, "any"),
    published: pick(src.published, ["any", "yes", "no"] as const, "any"),
    template: /^[a-z0-9-]{1,60}$/.test(String(src.template ?? "")) ? String(src.template) : "",
    joined: pick(src.joined, ["any", "7", "30", "90", "365"] as const, "any"),
    active: pick(src.active, ["any", "7", "30", "90", "idle30", "idle90"] as const, "any"),
    provider: pick(src.provider, ["any", "google", "local"] as const, "any"),
    paid: pick(src.paid, ["any", "yes", "no"] as const, "any"),
    emailed: pick(src.emailed, ["any", "never", "not14", "not30"] as const, "any"),
    wishlist: /^(any|none|[a-z0-9-]{1,40})$/.test(String(src.wishlist ?? "")) ? String(src.wishlist) : "any",
    optout: pick(src.optout, ["hide", "only"] as const, "hide"),
    sort: pick(src.sort, ["joined", "pages", "rating", "active", "name"] as const, "joined"),
    order: pick(src.order, ["asc", "desc"] as const, "desc"),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The rule no filter can override. See the header. */
export function isSendable(r: AudienceRow): boolean {
  return r.verified && r.status === "active" && !r.optedOut && EMAIL_RE.test(r.email);
}

// ─── Building the rows ───────────────────────────────────────────────────────

const CACHE_MS = 60_000;
let cache: { at: number; rows: AudienceRow[] } | null = null;
let inflight: Promise<AudienceRow[]> | null = null;

/** Drop the cache — after a send, so "last emailed" is right on the next look. */
export function invalidateAudience(): void {
  cache = null;
}

interface PageAgg { _id: mongoose.Types.ObjectId | null; n: number; pub: number; last: Date | null }

async function build(): Promise<AudienceRow[]> {
  const [users, perTemplate, feedback, paid, emailed, wished] = await Promise.all([
    User.find({})
      .select("name email provider status isVerified emailOptOut createdAt")
      .lean(),
    Promise.all(
      TEMPLATE_LOOKUPS.map(async ({ model, templateType }) => {
        const rows = (await (model as mongoose.Model<unknown>).aggregate([
          { $match: { userId: { $ne: null } } },
          {
            $group: {
              _id: "$userId",
              n: { $sum: 1 },
              pub: { $sum: { $cond: [{ $eq: ["$isPublished", true] }, 1, 0] } },
              last: { $max: "$createdAt" },
            },
          },
        ])) as PageAgg[];
        return { templateType, rows };
      })
    ),
    PageFeedback.aggregate([
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: "$userId",
          n: { $sum: 1 },
          avg: { $avg: "$rating" },
          ratings: { $addToSet: "$rating" },
          last: { $last: "$rating" },
          comments: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$comment", ""] } }, 0] }, 1, 0] } },
        },
      },
    ]) as Promise<{ _id: mongoose.Types.ObjectId; n: number; avg: number; ratings: number[]; last: number; comments: number }[]>,
    PaymentOrder.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ]) as Promise<{ _id: mongoose.Types.ObjectId; n: number }[]>,
    Broadcast.aggregate([
      { $unwind: "$recipients" },
      { $match: { "recipients.status": "sent" } },
      { $group: { _id: "$recipients.userId", last: { $max: "$recipients.sentAt" } } },
    ]) as Promise<{ _id: mongoose.Types.ObjectId; last: Date }[]>,
    Wishlist.find({}).select("userId campaign").lean(),
  ]);

  type Acc = { pages: number; published: number; last: number; templates: AudienceRow["templates"] };
  const pageMap = new Map<string, Acc>();
  for (const { templateType, rows } of perTemplate) {
    for (const r of rows) {
      if (!r._id) continue;
      const k = String(r._id);
      const a = pageMap.get(k) || { pages: 0, published: 0, last: 0, templates: [] };
      a.pages += r.n;
      a.published += r.pub;
      a.last = Math.max(a.last, r.last ? new Date(r.last).getTime() : 0);
      a.templates.push({ type: templateType, label: templateLabel(templateType), count: r.n });
      pageMap.set(k, a);
    }
  }
  const fbMap = new Map(feedback.map((f) => [String(f._id), f]));
  const paidMap = new Map(paid.map((p) => [String(p._id), p.n]));
  const mailMap = new Map(emailed.map((e) => [String(e._id), e.last]));
  const wishMap = new Map<string, string[]>();
  for (const w of wished) wishMap.set(w.userId, [...(wishMap.get(w.userId) || []), w.campaign]);

  return users.map((u) => {
    const id = String(u._id);
    const p = pageMap.get(id);
    const f = fbMap.get(id);
    const mailed = mailMap.get(id);
    return {
      userId: id,
      name: u.name || "",
      email: u.email,
      verified: Boolean(u.isVerified) || u.provider === "google",
      provider: u.provider,
      status: u.status || "active",
      optedOut: Boolean((u as { emailOptOut?: boolean }).emailOptOut),
      joinedAt: new Date(u.createdAt).toISOString(),
      pages: p?.pages || 0,
      published: p?.published || 0,
      templates: (p?.templates || []).sort((a, b) => b.count - a.count),
      lastPageAt: p?.last ? new Date(p.last).toISOString() : null,
      feedbackCount: f?.n || 0,
      avgRating: f ? Math.round(f.avg * 10) / 10 : null,
      ratings: f ? [...f.ratings].sort() : [],
      lastRating: f ? f.last : null,
      commentCount: f?.comments || 0,
      paidOrders: paidMap.get(id) || 0,
      lastEmailedAt: mailed ? new Date(mailed).toISOString() : null,
      wishlists: wishMap.get(id) || [],
    };
  });
}

export async function loadAudience(): Promise<AudienceRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  // Two tabs opening the panel at once share one fan-out instead of two.
  if (!inflight) {
    inflight = build()
      .then((rows) => {
        cache = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// ─── Filtering ───────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const within = (iso: string | null, days: number) => Boolean(iso) && Date.now() - new Date(iso as string).getTime() <= days * DAY;

export function applyFilters(rows: AudienceRow[], f: AudienceFilters): AudienceRow[] {
  const out = rows.filter((r) => {
    if (f.optout === "only" ? !r.optedOut : r.optedOut) return false;
    if (f.verified === "verified" && !r.verified) return false;
    if (f.q && !r.email.includes(f.q) && !r.name.toLowerCase().includes(f.q)) return false;

    if (f.ratings.length && !r.ratings.some((x) => f.ratings.includes(x))) return false;
    if (f.feedback === "given" && r.feedbackCount === 0) return false;
    if (f.feedback === "none" && r.feedbackCount > 0) return false;
    if (f.feedback === "comment" && r.commentCount === 0) return false;

    if (f.pages === "0" && r.pages !== 0) return false;
    if (f.pages === "1" && r.pages !== 1) return false;
    if (f.pages === "1+" && r.pages < 1) return false;
    if (f.pages === "2-4" && (r.pages < 2 || r.pages > 4)) return false;
    if (f.pages === "5+" && r.pages < 5) return false;

    if (f.published === "yes" && r.published === 0) return false;
    // "Only drafts": made something, published none of it.
    if (f.published === "no" && (r.pages === 0 || r.published > 0)) return false;

    if (f.template && !r.templates.some((t) => t.type === f.template)) return false;

    if (f.joined !== "any" && !within(r.joinedAt, Number(f.joined))) return false;

    if (f.active === "7" || f.active === "30" || f.active === "90") {
      if (!within(r.lastPageAt, Number(f.active))) return false;
    }
    if (f.active === "idle30" && (!r.lastPageAt || within(r.lastPageAt, 30))) return false;
    if (f.active === "idle90" && (!r.lastPageAt || within(r.lastPageAt, 90))) return false;

    if (f.provider !== "any" && r.provider !== f.provider) return false;
    if (f.paid === "yes" && r.paidOrders === 0) return false;
    if (f.paid === "no" && r.paidOrders > 0) return false;

    if (f.emailed === "never" && r.lastEmailedAt) return false;
    if (f.emailed === "not14" && within(r.lastEmailedAt, 14)) return false;
    if (f.emailed === "not30" && within(r.lastEmailedAt, 30)) return false;

    if (f.wishlist === "none" && r.wishlists.length) return false;
    if (f.wishlist !== "any" && f.wishlist !== "none" && !r.wishlists.includes(f.wishlist)) return false;
    return true;
  });

  const dir = f.order === "asc" ? 1 : -1;
  const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
  out.sort((a, b) => {
    switch (f.sort) {
      case "pages": return dir * (a.pages - b.pages) || dir * (t(a.joinedAt) - t(b.joinedAt));
      case "rating": return dir * ((a.avgRating ?? -1) - (b.avgRating ?? -1)) || b.feedbackCount - a.feedbackCount;
      case "active": return dir * (t(a.lastPageAt) - t(b.lastPageAt));
      case "name": return dir * (a.name || a.email).localeCompare(b.name || b.email);
      default: return dir * (t(a.joinedAt) - t(b.joinedAt));
    }
  });
  return out;
}

/** A short human line for the history: "Rated 1–3★ · 5+ pages · verified". */
export function describeFilters(f: AudienceFilters): string {
  const parts: string[] = [];
  if (f.ratings.length) parts.push(`Rated ${f.ratings.join(", ")}★`);
  if (f.feedback === "given") parts.push("Left feedback");
  if (f.feedback === "none") parts.push("No feedback yet");
  if (f.feedback === "comment") parts.push("Wrote a comment");
  if (f.pages !== "any") parts.push(f.pages === "0" ? "No pages yet" : `${f.pages} pages`);
  if (f.published === "yes") parts.push("Has published");
  if (f.published === "no") parts.push("Drafts only");
  if (f.template) parts.push(templateLabel(f.template));
  if (f.joined !== "any") parts.push(`Joined in ${f.joined}d`);
  if (f.active.startsWith("idle")) parts.push(`Idle ${f.active.slice(4)}d+`);
  else if (f.active !== "any") parts.push(`Active in ${f.active}d`);
  if (f.provider !== "any") parts.push(f.provider === "google" ? "Google sign-in" : "Email sign-in");
  if (f.paid === "yes") parts.push("Paid");
  if (f.paid === "no") parts.push("Never paid");
  if (f.emailed === "never") parts.push("Never emailed");
  if (f.emailed !== "any" && f.emailed !== "never") parts.push(`Not emailed in ${f.emailed.slice(3)}d`);
  if (f.wishlist === "none") parts.push("Not on a wishlist");
  else if (f.wishlist !== "any") parts.push(`On the ${WISHLIST_CAMPAIGNS[f.wishlist]?.label ?? f.wishlist} wishlist`);
  if (f.q) parts.push(`“${f.q}”`);
  return parts.length ? parts.join(" · ") : "Everyone";
}
