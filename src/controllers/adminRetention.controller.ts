import { Request, Response } from "express";
import mongoose from "mongoose";

import User from "../models/User";
import { TEMPLATE_REGISTRY } from "../services/templateRegistry";

/**
 * Who came back?
 *
 * ── WHAT "RECURRING" MEANS HERE ─────────────────────────────────────────────
 *
 * Somebody who created a page on one calendar day and then came back on a
 * DIFFERENT calendar day and created another. Not "made two pages" — a person
 * who makes three cards for three cousins in one sitting is one visit, and
 * counting them as returning would flatter the number until it meant nothing.
 * Distinct days is the honest measure of "they came back".
 *
 * ── WHY THE DAY IS COMPUTED IN IST ──────────────────────────────────────────
 *
 * `createdAt` is UTC. Almost everyone using this is in India, where evening —
 * when people actually make these — is after 18:30 UTC. Grouping by UTC day
 * would split a single Tuesday-evening sitting across two "days" and report a
 * one-visit user as recurring. The timezone is applied inside Mongo so the
 * boundary is the user's midnight, not the server's.
 *
 * ── WHY THIS COSTS 44 AGGREGATIONS ──────────────────────────────────────────
 *
 * There is no central record of "a page was created". Every template owns its
 * own collection, so the only truthful answer walks all of them. They run in
 * parallel, each returns one small row per user (not per page), and this is an
 * admin screen behind a super-admin gate — so the cost lands on one person
 * looking at a dashboard, never on a visitor.
 */

const TZ = "Asia/Kolkata";

/** What one template collection reports back about one user. */
interface Row {
  _id: mongoose.Types.ObjectId;
  days: string[];
  pages: number;
  firstAt: Date;
  lastAt: Date;
}

interface Merged {
  days: Set<string>;
  pages: number;
  firstAt: Date;
  lastAt: Date;
  templates: Map<string, number>;
}

const dayDiff = (a: Date, b: Date): number =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));

export const getRecurringUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25));
    const search = String(req.query.search || "").trim();
    // "How many separate days before I call them a regular?" 2 is the default
    // because that is the definition of coming back at all.
    const minDays = Math.min(30, Math.max(1, parseInt(String(req.query.minDays || "2"), 10) || 2));
    const segment = String(req.query.segment || "recurring"); // recurring | once | all
    const sort = String(req.query.sort || "lastAt"); // lastAt | days | pages | gap

    // ── 1. Ask every template collection about its creators ─────────────────
    const perTemplate = await Promise.all(
      TEMPLATE_REGISTRY.map(async (entry) => {
        if (!entry.model.schema.path("userId")) return { slug: entry.templateType, rows: [] as Row[] };
        const rows = (await entry.model.aggregate([
          { $match: { userId: { $ne: null } } },
          {
            $group: {
              _id: "$userId",
              days: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } } },
              pages: { $sum: 1 },
              firstAt: { $min: "$createdAt" },
              lastAt: { $max: "$createdAt" },
            },
          },
        ])) as Row[];
        return { slug: entry.templateType, rows };
      })
    );

    // ── 2. Merge the per-template answers into one row per person ───────────
    const byUser = new Map<string, Merged>();
    for (const { slug, rows } of perTemplate) {
      for (const r of rows) {
        const key = String(r._id);
        const cur =
          byUser.get(key) ??
          { days: new Set<string>(), pages: 0, firstAt: r.firstAt, lastAt: r.lastAt, templates: new Map<string, number>() };
        for (const d of r.days) cur.days.add(d);
        cur.pages += r.pages;
        if (r.firstAt < cur.firstAt) cur.firstAt = r.firstAt;
        if (r.lastAt > cur.lastAt) cur.lastAt = r.lastAt;
        cur.templates.set(slug, (cur.templates.get(slug) || 0) + r.pages);
        byUser.set(key, cur);
      }
    }

    // ── 3. Headline numbers, computed over EVERYONE ─────────────────────────
    //
    // Deliberately not over the current filter: "43% of creators come back" is
    // a reading of the product, and a rate that changes when you tighten a
    // filter is a reading of the filter.
    const creators = byUser.size;
    const recurringAll = [...byUser.values()].filter((u) => u.days.size >= 2);
    const gaps = recurringAll.map((u) => dayDiff(u.firstAt, u.lastAt)).sort((a, b) => a - b);
    const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

    // ── 4. Apply the segment ────────────────────────────────────────────────
    let selected = [...byUser.entries()];
    if (segment === "recurring") selected = selected.filter(([, u]) => u.days.size >= minDays);
    else if (segment === "once") selected = selected.filter(([, u]) => u.days.size === 1);

    // ── 5. Attach identity ──────────────────────────────────────────────────
    //
    // One query for the whole page rather than one per row. A page whose owner
    // has since deleted their account still exists in the collection, so a row
    // with no matching user is dropped rather than rendered as a blank name.
    const ids = selected.map(([id]) => new mongoose.Types.ObjectId(id));
    const userQuery: Record<string, unknown> = { _id: { $in: ids } };
    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    const users = await User.find(userQuery)
      .select("name email avatar role status createdAt subdomain")
      .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const merged = selected
      .filter(([id]) => userById.has(id))
      .map(([id, u]) => {
        const acct = userById.get(id)!;
        return {
          userId: id,
          name: acct.name || "",
          email: acct.email || "",
          avatar: acct.avatar || "",
          role: acct.role,
          status: acct.status,
          joinedAt: acct.createdAt,
          subdomain: acct.subdomain || "",
          pages: u.pages,
          /** Separate days on which they created something. The whole point. */
          activeDays: u.days.size,
          firstPageAt: u.firstAt,
          lastPageAt: u.lastAt,
          /** Days between their first page and their most recent one. */
          spanDays: dayDiff(u.firstAt, u.lastAt),
          /** Days since they were last seen creating. */
          daysSinceLast: dayDiff(u.lastAt, new Date()),
          templates: [...u.templates.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([slug, count]) => ({ slug, count })),
        };
      });

    merged.sort((a, b) => {
      if (sort === "days") return b.activeDays - a.activeDays;
      if (sort === "pages") return b.pages - a.pages;
      if (sort === "gap") return b.spanDays - a.spanDays;
      return new Date(b.lastPageAt).getTime() - new Date(a.lastPageAt).getTime();
    });

    const total = merged.length;
    const start = (page - 1) * limit;

    res.json({
      success: true,
      data: {
        users: merged.slice(start, start + limit),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        summary: {
          creators,
          recurring: recurringAll.length,
          oneTime: creators - recurringAll.length,
          // One decimal: "43.2%" is a number somebody can act on, "43%" hides
          // a move of fifty people on a base this size.
          recurringRate: creators ? Number(((recurringAll.length / creators) * 100).toFixed(1)) : 0,
          medianGapDays: medianGap,
        },
        meta: { minDays, segment, sort, timezone: TZ },
      },
    });
  } catch (error) {
    console.error("Recurring users error:", error);
    res.status(500).json({ success: false, error: "Failed to load recurring users" });
  }
};
