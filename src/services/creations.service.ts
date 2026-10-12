// ─── Creations: who made which page, and when ───────────────────────────────
//
// What the super admin's /admin/creations page reads. One range — today, 7, 30
// or 90 days, or a custom span of IST days — and optionally one template. The
// answer is: how many pages were made, by how many people, on which days, of
// which templates, and the people themselves, each with what they made.
//
// ── WHY THE ROWS ARE GROUPED IN NODE ────────────────────────────────────────
//
// Pages live in ~45 collections, one per template. Grouping by user ACROSS
// collections would need a $unionWith chain 45 deep. Instead every collection
// returns its small lean rows for the window (four fields each) and the
// grouping below is plain JavaScript — `groupCreations` is pure, so it is
// tested without Mongo. The widest window (366 days + the previous period) is
// a few thousand rows at this site's volume.
//
// Days are IST days, the same `resolveRange` the revenue page uses, so "today"
// on both screens is the same midnight.

import mongoose from "mongoose";
import User from "../models/User";
import { TEMPLATE_REGISTRY, templateByType, type TemplateEntry } from "./templateRegistry";
import {
  enumerateDays,
  escapeRegex,
  istDate,
  resolveRange,
  RangeInputError,
  type DayRange,
  type ResolvedRange,
} from "./revenueMath";
import { rangeOut } from "./revenue.service";

/** One page, as little of it as the report needs. */
export interface CreationRow {
  _id: string;
  userId: string;
  templateType: string;
  label: string;
  /** Builder route without the slash — the client's key for the cover image. */
  slug: string;
  shareId: string | null;
  isPublished: boolean;
  createdAt: Date;
}

const slugOf = (e: TemplateEntry) => e.editorRoute.replace(/^\//, "");

/** Every page created in [start, end), optionally of one template, newest first. */
async function rowsBetween(start: Date, end: Date, only?: TemplateEntry): Promise<CreationRow[]> {
  const entries = only ? [only] : TEMPLATE_REGISTRY;
  const groups = await Promise.all(
    entries.map(async (e) => {
      const docs = (await e.model
        .find({ createdAt: { $gte: start, $lt: end } })
        .select("userId shareId isPublished createdAt")
        .lean()) as Array<{ _id: unknown; userId?: unknown; shareId?: string; isPublished?: boolean; createdAt?: Date }>;
      return docs
        .filter((d) => d.userId && d.createdAt)
        .map<CreationRow>((d) => ({
          _id: String(d._id),
          userId: String(d.userId),
          templateType: e.templateType,
          label: e.label,
          slug: slugOf(e),
          shareId: d.shareId || null,
          isPublished: !!d.isPublished,
          createdAt: d.createdAt as Date,
        }));
    })
  );
  return groups.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

const inRange = (r: DayRange) => (row: CreationRow) => row.createdAt >= r.start && row.createdAt < r.end;

export interface CreatorAgg {
  userId: string;
  pages: number;
  published: number;
  firstAt: Date;
  lastAt: Date;
  templates: { templateType: string; label: string; slug: string; count: number }[];
}

/**
 * The pure half: rows already inside the range → totals, a zero-filled daily
 * series, a per-template table and a per-person table (busiest first).
 */
export function groupCreations(rows: CreationRow[], range: DayRange) {
  const daily = new Map(
    enumerateDays(range.from, range.to).map((date) => [date, { date, pages: 0, creators: new Set<string>() }])
  );
  const byTemplate = new Map<string, { templateType: string; label: string; slug: string; pages: number; creators: Set<string>; published: number }>();
  const byUser = new Map<string, CreatorAgg & { tpl: Map<string, CreatorAgg["templates"][number]> }>();
  let published = 0;

  for (const r of rows) {
    if (r.isPublished) published++;
    const d = daily.get(istDate(r.createdAt));
    if (d) { d.pages++; d.creators.add(r.userId); }

    const t = byTemplate.get(r.templateType) ?? { templateType: r.templateType, label: r.label, slug: r.slug, pages: 0, creators: new Set<string>(), published: 0 };
    t.pages++;
    t.creators.add(r.userId);
    if (r.isPublished) t.published++;
    byTemplate.set(r.templateType, t);

    const u = byUser.get(r.userId) ?? { userId: r.userId, pages: 0, published: 0, firstAt: r.createdAt, lastAt: r.createdAt, templates: [], tpl: new Map() };
    u.pages++;
    if (r.isPublished) u.published++;
    if (r.createdAt < u.firstAt) u.firstAt = r.createdAt;
    if (r.createdAt > u.lastAt) u.lastAt = r.createdAt;
    const ut = u.tpl.get(r.templateType) ?? { templateType: r.templateType, label: r.label, slug: r.slug, count: 0 };
    ut.count++;
    u.tpl.set(r.templateType, ut);
    byUser.set(r.userId, u);
  }

  const creators: CreatorAgg[] = [...byUser.values()]
    .map(({ tpl, ...u }) => ({ ...u, templates: [...tpl.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) }))
    .sort((a, b) => b.pages - a.pages || b.lastAt.getTime() - a.lastAt.getTime());

  return {
    totals: { pages: rows.length, creators: byUser.size, published },
    daily: [...daily.values()].map((d) => ({ date: d.date, pages: d.pages, creators: d.creators.size })),
    byTemplate: [...byTemplate.values()]
      .map(({ creators: c, ...t }) => ({ ...t, creators: c.size }))
      .sort((a, b) => b.pages - a.pages || a.label.localeCompare(b.label)),
    creators,
  };
}

/** For each user, when they made their very first page (any template, ever). */
async function firstPageAt(userIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!userIds.length) return out;
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const groups = await Promise.all(
    TEMPLATE_REGISTRY.map((e) =>
      e.model.aggregate<{ _id: mongoose.Types.ObjectId; first: Date }>([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: "$userId", first: { $min: "$createdAt" } } },
      ])
    )
  );
  for (const g of groups)
    for (const r of g) {
      const k = String(r._id);
      const cur = out.get(k);
      if (r.first && (!cur || r.first < cur)) out.set(k, r.first);
    }
  return out;
}

const SORTS = ["pages", "recent"] as const;

/**
 * GET /admin/super/creations?range=&from=&to=&template=&q=&sort=pages|recent&page=&limit=
 *
 * `template` narrows everything to one template. `q` narrows only the people
 * list (name / email), never the totals — the headline is about the range.
 */
export async function creationsReport(query: Record<string, unknown>, now = new Date()) {
  const range: ResolvedRange = resolveRange({ range: query.range ?? "today", from: query.from, to: query.to }, now);
  const templateType = typeof query.template === "string" ? query.template.trim() : "";
  const only = templateType ? templateByType(templateType) : undefined;
  if (templateType && !only) throw new RangeInputError("Unknown template");

  const sort = SORTS.includes(query.sort as (typeof SORTS)[number]) ? (query.sort as (typeof SORTS)[number]) : "pages";
  const page = Math.max(1, parseInt(String(query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit ?? "24"), 10) || 24));
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";

  const quick = {
    today: resolveRange({ range: "today" }, now),
    last7: resolveRange({ range: "7d" }, now),
    last30: resolveRange({ range: "30d" }, now),
    last90: resolveRange({ range: "90d" }, now),
  };
  // One read covers the range, its previous period and the 90-day quick strip.
  const windowStart = new Date(Math.min(range.previous.start.getTime(), quick.last90.start.getTime()));
  const windowEnd = new Date(Math.max(range.end.getTime(), quick.today.end.getTime()));
  const all = await rowsBetween(windowStart, windowEnd, only);

  const cur = all.filter(inRange(range));
  const prevRows = all.filter(inRange(range.previous));
  const g = groupCreations(cur, range);
  const prevCreators = new Set(prevRows.map((r) => r.userId)).size;

  const count = (r: DayRange) => {
    const rows = all.filter(inRange(r));
    return { pages: rows.length, creators: new Set(rows.map((x) => x.userId)).size };
  };

  // People: decorate every creator (needed for the search and "new" badge),
  // then sort, filter and page.
  const ids = g.creators.map((c) => c.userId);
  const [users, first] = await Promise.all([
    ids.length
      ? User.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
          .select("name email avatar createdAt status")
          .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string; avatar?: string; createdAt?: Date; status?: string }>>()
      : Promise.resolve([]),
    firstPageAt(ids),
  ]);
  const userBy = new Map(users.map((u) => [String(u._id), u]));

  let people = g.creators.map((c) => {
    const u = userBy.get(c.userId);
    const f = first.get(c.userId);
    return {
      userId: c.userId,
      name: u?.name || "Deleted user",
      email: u?.email || "",
      avatar: u?.avatar || "",
      joinedAt: u?.createdAt ?? null,
      status: u?.status || (u ? "active" : "deleted"),
      exists: !!u,
      pages: c.pages,
      published: c.published,
      firstAt: c.firstAt,
      lastAt: c.lastAt,
      /** Their first page EVER is inside this range — a first-time creator. */
      firstTime: !!f && f >= range.start && f < range.end,
      /** Joined inside this range. */
      newUser: !!u?.createdAt && u.createdAt >= range.start && u.createdAt < range.end,
      templates: c.templates,
    };
  });
  const firstTimeCreators = people.filter((p) => p.firstTime).length;

  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    people = people.filter((p) => re.test(p.name) || re.test(p.email));
  }
  if (sort === "recent") people.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  const total = people.length;
  const items = people.slice((page - 1) * limit, page * limit);

  // The newest pages of the range, with their maker — the live feed.
  const recent = cur.slice(0, 40).map((r) => {
    const u = userBy.get(r.userId);
    return {
      _id: r._id,
      templateType: r.templateType,
      label: r.label,
      slug: r.slug,
      shareId: r.shareId,
      isPublished: r.isPublished,
      createdAt: r.createdAt,
      user: { userId: r.userId, name: u?.name || "Deleted user", avatar: u?.avatar || "", exists: !!u },
    };
  });

  return {
    range: rangeOut(range),
    template: only ? { templateType: only.templateType, label: only.label, slug: slugOf(only) } : null,
    totals: { ...g.totals, firstTimeCreators },
    previous: { pages: prevRows.length, creators: prevCreators },
    quick: { today: count(quick.today), last7: count(quick.last7), last30: count(quick.last30), last90: count(quick.last90) },
    daily: g.daily,
    byTemplate: g.byTemplate,
    creators: { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    recent,
    /** Every template, for the picker — so a template nobody used is still choosable. */
    templates: TEMPLATE_REGISTRY.map((e) => ({ templateType: e.templateType, label: e.label, slug: slugOf(e) })).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  };
}
