// ─── Revenue: the database half ─────────────────────────────────────────────
//
// What the super admin's /admin/revenue page and the per-user Billing tab read.
// All arithmetic lives in revenueMath.ts; this file only fetches and groups.
//
// ── WHY ORDERS ARE SUMMED IN NODE, NOT IN AN AGGREGATION ────────────────────
//
// The rules for one order — paid time falls back to updatedAt, INR value falls
// back to the amount for old INR rows, a points unlock is not money — already
// exist as functions (revenueMath.ts) that the ledger and the billing email
// also use. Re-expressing them as a $group pipeline would be a second copy of
// each rule, and the two would drift. The volume makes the simple version
// cheap: the widest window (a 366-day custom range plus its previous period)
// is a few thousand small lean documents. Counts that do not need the rules —
// signups, pages created — stay in Mongo.

import mongoose from "mongoose";
import PaymentOrder from "../models/PaymentOrder";
import User from "../models/User";
import BillingStatement from "../models/BillingStatement";
import { TEMPLATE_REGISTRY, templateByType } from "./templateRegistry";
import { templateLabel as catalogueLabel } from "../config/templateCatalog";
import { BUSINESS } from "../config/business";
import {
  IST_TZ,
  discountLabel,
  effectivePaidAt,
  enumerateDays,
  escapeRegex,
  istDate,
  orderDiscountAmount,
  orderDiscountInrPaise,
  orderDiscountSource,
  orderInrPaise,
  orderListAmount,
  resolveRange,
  totalsFor,
  type DayRange,
  type LedgerOrder,
  type ResolvedRange,
} from "./revenueMath";

const ORDER_FIELDS =
  "userId templateType pageId status amount currency country fxRateToINR amountInrPaise listAmount " +
  "discountAmount discountPercent discountSource seasonMode templateLabel pointsUsed razorpayOrderId " +
  "razorpayPaymentId invoiceNumber paidAt createdAt updatedAt";

/** The public link for a share id. Statements always link the live site. */
export function shareUrl(shareId: string | null | undefined): string | null {
  return shareId ? `${BUSINESS.website}/${encodeURIComponent(shareId)}` : null;
}

/**
 * Settled (paid or points) orders whose paid time is in [start, end).
 *
 * Two branches because rows from before `paidAt` existed are dated by
 * `updatedAt` — the `{ status, paidAt }` index serves the first, the
 * `{ status, createdAt }`/collection scan the (shrinking) second.
 */
export function settledBetween(start: Date, end: Date, statuses: string[] = ["paid", "points_used"]) {
  return {
    status: { $in: statuses },
    $or: [
      { paidAt: { $gte: start, $lt: end } },
      { paidAt: null, updatedAt: { $gte: start, $lt: end } },
    ],
  };
}

const oid = (id: unknown) => new mongoose.Types.ObjectId(String(id));

function labelFor(o: LedgerOrder): string {
  return o.templateLabel || catalogueLabel(String(o.templateType || "")) || String(o.templateType || "");
}

// ── SUMMARY ─────────────────────────────────────────────────────────────────

async function pagesCreatedBetween(start: Date, end: Date): Promise<number> {
  const counts = await Promise.all(
    TEMPLATE_REGISTRY.map((t) => t.model.countDocuments({ createdAt: { $gte: start, $lt: end } }))
  );
  return counts.reduce((s, n) => s + n, 0);
}

/** Users whose FIRST paid order (lifetime) is in [start, end). */
async function firstPaidMap(userIds: string[]): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const rows = await PaymentOrder.aggregate<{ _id: mongoose.Types.ObjectId; first: Date }>([
    { $match: { status: "paid", userId: { $in: userIds.map(oid) } } },
    { $group: { _id: "$userId", first: { $min: { $ifNull: ["$paidAt", "$updatedAt"] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.first]));
}

function countFirstIn(first: Map<string, Date>, ids: Set<string>, r: DayRange): number {
  let n = 0;
  for (const id of ids) {
    const f = first.get(id);
    if (f && f >= r.start && f < r.end) n++;
  }
  return n;
}

export async function revenueSummary(query: Record<string, unknown>, now = new Date()) {
  const range = resolveRange(query, now);
  const quickRanges = {
    today: resolveRange({ range: "today" }, now),
    last7: resolveRange({ range: "7d" }, now),
    last30: resolveRange({ range: "30d" }, now),
    last90: resolveRange({ range: "90d" }, now),
  };
  const windowStart = new Date(Math.min(range.previous.start.getTime(), quickRanges.last90.start.getTime()));
  const windowEnd = new Date(Math.max(range.end.getTime(), quickRanges.today.end.getTime()));

  const [orders, signupsCur, signupsPrev, pagesCur, pagesPrev, signupDays] = await Promise.all([
    PaymentOrder.find(settledBetween(windowStart, windowEnd)).select(ORDER_FIELDS).lean<LedgerOrder[]>(),
    User.countDocuments({ createdAt: { $gte: range.start, $lt: range.end } }),
    User.countDocuments({ createdAt: { $gte: range.previous.start, $lt: range.previous.end } }),
    pagesCreatedBetween(range.start, range.end),
    pagesCreatedBetween(range.previous.start, range.previous.end),
    User.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: range.start, $lt: range.end } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST_TZ } }, n: { $sum: 1 } } },
    ]),
  ]);

  const cur = totalsFor(orders, range.start, range.end);
  const prev = totalsFor(orders, range.previous.start, range.previous.end);
  const first = await firstPaidMap([...new Set([...cur.payingUserIds, ...prev.payingUserIds])]);

  const shape = (
    t: ReturnType<typeof totalsFor>,
    r: DayRange,
    signups: number,
    pagesCreated: number
  ) => ({
    revenueInrPaise: t.revenueInrPaise,
    orders: t.orders,
    payingUsers: t.payingUsers,
    newPayingUsers: countFirstIn(first, t.payingUserIds, r),
    avgOrderInrPaise: t.orders ? Math.round(t.revenueInrPaise / t.orders) : 0,
    pointsUnlocks: t.pointsUnlocks,
    pointsSpent: t.pointsSpent,
    discountGivenInrPaise: t.discountGivenInrPaise,
    signups,
    pagesCreated,
  });

  // Daily buckets, every day of the range present (zero-filled).
  const signupsByDay = new Map(signupDays.map((d) => [d._id, d.n]));
  const daily = new Map(
    enumerateDays(range.from, range.to).map((date) => [
      date,
      { date, revenueInrPaise: 0, orders: 0, payers: new Set<string>(), signups: signupsByDay.get(date) || 0 },
    ])
  );
  const byTemplate = new Map<string, { templateType: string; label: string; revenueInrPaise: number; orders: number }>();
  const byCurrency = new Map<string, { currency: string; amount: number; revenueInrPaise: number; orders: number }>();
  const byCountry = new Map<string, { country: string; revenueInrPaise: number; orders: number }>();

  for (const o of orders) {
    if (o.status !== "paid") continue;
    const at = effectivePaidAt(o);
    if (!at || at < range.start || at >= range.end) continue;
    const inr = orderInrPaise(o);
    const day = daily.get(istDate(at));
    if (day) {
      day.revenueInrPaise += inr;
      day.orders += 1;
      day.payers.add(String(o.userId));
    }
    const tt = String(o.templateType || "unknown");
    const bt = byTemplate.get(tt) ?? { templateType: tt, label: labelFor(o), revenueInrPaise: 0, orders: 0 };
    bt.revenueInrPaise += inr;
    bt.orders += 1;
    byTemplate.set(tt, bt);
    const cc = o.currency || "INR";
    const bc = byCurrency.get(cc) ?? { currency: cc, amount: 0, revenueInrPaise: 0, orders: 0 };
    bc.amount += Math.max(0, o.amount || 0);
    bc.revenueInrPaise += inr;
    bc.orders += 1;
    byCurrency.set(cc, bc);
    const co = o.country || "unknown";
    const bk = byCountry.get(co) ?? { country: co, revenueInrPaise: 0, orders: 0 };
    bk.revenueInrPaise += inr;
    bk.orders += 1;
    byCountry.set(co, bk);
  }

  const quick = Object.fromEntries(
    Object.entries(quickRanges).map(([k, r]) => {
      const t = totalsFor(orders, r.start, r.end);
      return [k, { revenueInrPaise: t.revenueInrPaise, orders: t.orders }];
    })
  ) as Record<keyof typeof quickRanges, { revenueInrPaise: number; orders: number }>;

  const byRevenue = <T extends { revenueInrPaise: number; orders: number }>(a: T, b: T) =>
    b.revenueInrPaise - a.revenueInrPaise || b.orders - a.orders;

  return {
    range: rangeOut(range),
    totals: shape(cur, range, signupsCur, pagesCur),
    previous: shape(prev, range.previous, signupsPrev, pagesPrev),
    daily: [...daily.values()].map(({ payers, ...d }) => ({ ...d, payingUsers: payers.size })),
    byTemplate: [...byTemplate.values()].sort(byRevenue),
    byCurrency: [...byCurrency.values()].sort(byRevenue),
    byCountry: [...byCountry.values()].sort(byRevenue),
    quick,
  };
}

export function rangeOut(r: ResolvedRange) {
  return {
    from: r.from,
    to: r.to,
    label: r.label,
    days: r.days,
    key: r.key,
    previous: { from: r.previous.from, to: r.previous.to, days: r.previous.days },
  };
}

// ── CUSTOMERS ───────────────────────────────────────────────────────────────

/** Lifetime paid revenue, order count and first/last paid time, per user. */
async function lifetimeByUser(userIds: string[]) {
  const map = new Map<string, { revenueInrPaise: number; orders: number; firstPaidAt: Date | null; lastPaidAt: Date | null }>();
  if (userIds.length === 0) return map;
  const orders = await PaymentOrder.find({ status: "paid", userId: { $in: userIds.map(oid) } })
    .select("userId status amount currency amountInrPaise paidAt updatedAt")
    .lean<LedgerOrder[]>();
  for (const o of orders) {
    const k = String(o.userId);
    const at = effectivePaidAt(o);
    const m = map.get(k) ?? { revenueInrPaise: 0, orders: 0, firstPaidAt: null, lastPaidAt: null };
    m.revenueInrPaise += orderInrPaise(o);
    m.orders += 1;
    if (at && (!m.firstPaidAt || at < m.firstPaidAt)) m.firstPaidAt = at;
    if (at && (!m.lastPaidAt || at > m.lastPaidAt)) m.lastPaidAt = at;
    map.set(k, m);
  }
  return map;
}

/** Pages each user has created (lifetime, every template). */
async function pagesByUser(userIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const ids = userIds.map(oid);
  const groups = await Promise.all(
    TEMPLATE_REGISTRY.map((t) =>
      t.model.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
        { $match: { userId: { $in: ids } } },
        { $group: { _id: "$userId", n: { $sum: 1 } } },
      ])
    )
  );
  for (const g of groups) for (const r of g) out.set(String(r._id), (out.get(String(r._id)) || 0) + r.n);
  return out;
}

function paging(query: Record<string, unknown>, defLimit = 50, maxLimit = 500) {
  const page = Math.max(parseInt(String(query.page)) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(query.limit)) || defLimit, 1), maxLimit);
  return { page, limit };
}

export async function revenueCustomers(query: Record<string, unknown>, now = new Date()) {
  const range = resolveRange(query, now);
  const { page, limit } = paging(query);
  const sort = ["revenue", "recent", "orders"].includes(String(query.sort)) ? String(query.sort) : "revenue";
  const q = String(query.q || "").trim().slice(0, 100);

  const orders = await PaymentOrder.find(settledBetween(range.start, range.end, ["paid"]))
    .select("userId status amount currency amountInrPaise paidAt updatedAt")
    .lean<LedgerOrder[]>();

  const inRange = new Map<string, { revenueInrPaise: number; orders: number; lastPaidAt: Date | null }>();
  for (const o of orders) {
    const k = String(o.userId);
    const at = effectivePaidAt(o);
    const m = inRange.get(k) ?? { revenueInrPaise: 0, orders: 0, lastPaidAt: null };
    m.revenueInrPaise += orderInrPaise(o);
    m.orders += 1;
    if (at && (!m.lastPaidAt || at > m.lastPaidAt)) m.lastPaidAt = at;
    inRange.set(k, m);
  }

  const userFilter: Record<string, unknown> = { _id: { $in: [...inRange.keys()].map(oid) } };
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    userFilter.$or = [{ name: re }, { email: re }];
  }
  const users = await User.find(userFilter)
    .select("name email avatar createdAt status signupCountry lastSeenCountry")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string; avatar?: string; createdAt?: Date; status?: string; signupCountry?: string | null; lastSeenCountry?: string | null }>>();

  const rows = users.map((u) => ({ u, r: inRange.get(String(u._id))! }));
  rows.sort((a, b) => {
    if (sort === "recent") return (b.r.lastPaidAt?.getTime() || 0) - (a.r.lastPaidAt?.getTime() || 0);
    if (sort === "orders") return b.r.orders - a.r.orders || b.r.revenueInrPaise - a.r.revenueInrPaise;
    return b.r.revenueInrPaise - a.r.revenueInrPaise || b.r.orders - a.r.orders;
  });
  const total = rows.length;
  const slice = rows.slice((page - 1) * limit, page * limit);
  const ids = slice.map((x) => String(x.u._id));
  const [life, pages] = await Promise.all([lifetimeByUser(ids), pagesByUser(ids)]);

  return {
    range: rangeOut(range),
    items: slice.map(({ u, r }) => {
      const id = String(u._id);
      const l = life.get(id);
      return {
        userId: id,
        name: u.name || "",
        email: u.email || "",
        avatar: u.avatar || "",
        joinedAt: u.createdAt ?? null,
        country: u.lastSeenCountry || u.signupCountry || null,
        status: u.status || "active",
        revenueInrPaise: r.revenueInrPaise,
        lifetimeRevenueInrPaise: l?.revenueInrPaise ?? r.revenueInrPaise,
        orders: r.orders,
        lifetimeOrders: l?.orders ?? r.orders,
        pagesCreated: pages.get(id) || 0,
        firstPaidAt: l?.firstPaidAt ?? null,
        lastPaidAt: l?.lastPaidAt ?? r.lastPaidAt,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ── THE LEDGER ──────────────────────────────────────────────────────────────

interface PageInfo { shareId: string | null; isPublished: boolean }

/** shareId / published state for the pages these orders unlocked. */
async function pagesFor(orders: LedgerOrder[]): Promise<Map<string, PageInfo>> {
  const byType = new Map<string, string[]>();
  for (const o of orders) {
    const t = String(o.templateType || "");
    if (!o.pageId || !templateByType(t)) continue;
    byType.set(t, [...(byType.get(t) || []), String(o.pageId)]);
  }
  const out = new Map<string, PageInfo>();
  await Promise.all(
    [...byType.entries()].map(async ([t, ids]) => {
      const docs = (await templateByType(t)!.model
        .find({ _id: { $in: ids.map(oid) } })
        .select("shareId isPublished")
        .lean()) as Array<{ _id: unknown; shareId?: string; isPublished?: boolean }>;
      for (const d of docs) out.set(String(d._id), { shareId: d.shareId || null, isPublished: !!d.isPublished });
    })
  );
  return out;
}

async function usersFor(orders: LedgerOrder[]) {
  const ids = [...new Set(orders.map((o) => String(o.userId)))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const users = await User.find({ _id: { $in: ids.map(oid) } })
    .select("name email")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string }>>();
  return new Map(users.map((u) => [String(u._id), u]));
}

export type LedgerItem = ReturnType<typeof ledgerItem>;

export function ledgerItem(
  o: LedgerOrder,
  users: Map<string, { name?: string; email?: string }>,
  pages: Map<string, PageInfo>
) {
  const u = users.get(String(o.userId));
  const p = pages.get(String(o.pageId));
  return {
    _id: String(o._id),
    invoiceNumber: o.invoiceNumber || null,
    userId: String(o.userId),
    userName: u?.name || "",
    userEmail: u?.email || "",
    templateType: String(o.templateType || ""),
    templateLabel: labelFor(o),
    pageId: o.pageId ? String(o.pageId) : null,
    pageShareId: p?.shareId ?? null,
    pageExists: !!p,
    /** Additive: whether that page is live right now (the email links only live pages). */
    pagePublished: !!p?.isPublished,
    status: String(o.status || ""),
    currency: o.currency || "INR",
    amount: Math.max(0, o.amount || 0),
    listAmount: orderListAmount(o),
    discountAmount: orderDiscountAmount(o),
    discountPercent: Math.round(Number(o.discountPercent) || 0),
    discountSource: orderDiscountSource(o),
    /** Additive: the ready-made label ("Season sale — Dandiya 30%" / "Discount 20%" / "—"). */
    discountLabel: discountLabel(o),
    seasonMode: o.seasonMode ?? null,
    amountInrPaise: o.status === "paid" ? orderInrPaise(o) : 0,
    /** Additive: the discount in INR paise at the order's rate. */
    discountInrPaise: orderDiscountInrPaise(o),
    pointsUsed: o.pointsUsed || 0,
    razorpayOrderId: o.razorpayOrderId || null,
    razorpayPaymentId: o.razorpayPaymentId || null,
    country: o.country || null,
    createdAt: o.createdAt ?? null,
    paidAt: effectivePaidAt(o),
  };
}

export async function toLedgerItems(orders: LedgerOrder[]) {
  const [users, pages] = await Promise.all([usersFor(orders), pagesFor(orders)]);
  return orders.map((o) => ledgerItem(o, users, pages));
}

const LEDGER_STATUSES = ["paid", "points_used", "failed", "created", "all"];

export async function revenueOrders(query: Record<string, unknown>, now = new Date()) {
  const { page, limit } = paging(query);
  const status = LEDGER_STATUSES.includes(String(query.status)) ? String(query.status) : "paid";
  const userId = query.userId ? String(query.userId) : "";
  if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
    throw new RangeError("Invalid userId");
  }
  // No range with a user = their whole history; `range=all` asks for it explicitly.
  const allTime = query.range === "all" || (!query.range && !!userId);
  const range = allTime ? null : resolveRange(query, now);

  const settled = status === "paid" || status === "points_used" ? [status] : ["paid", "points_used"];
  const unsettled = status === "failed" || status === "created" ? [status] : ["failed", "created"];
  const clauses: Record<string, unknown>[] = [];
  if (status !== "failed" && status !== "created") {
    clauses.push(range ? settledBetween(range.start, range.end, settled) : { status: { $in: settled } });
  }
  if (status === "all" || status === "failed" || status === "created") {
    clauses.push(
      range
        ? { status: { $in: unsettled }, createdAt: { $gte: range.start, $lt: range.end } }
        : { status: { $in: unsettled } }
    );
  }
  const filter: Record<string, unknown> = clauses.length === 1 ? clauses[0] : { $or: clauses };
  if (userId) Object.assign(filter, { userId: oid(userId) });

  const [orders, total] = await Promise.all([
    PaymentOrder.find(filter)
      .select(ORDER_FIELDS)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<LedgerOrder[]>(),
    PaymentOrder.countDocuments(filter),
  ]);

  return {
    range: range ? rangeOut(range) : null,
    items: await toLedgerItems(orders),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ── ONE USER'S BILLING ──────────────────────────────────────────────────────

export async function userBilling(userId: string) {
  const id = oid(userId);
  const [user, orders, pageGroups, statements] = await Promise.all([
    User.findById(id)
      .select("name email avatar createdAt status signupCountry lastSeenCountry provider freeAccess closedAt closureMode")
      .lean<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>(),
    PaymentOrder.find({ userId: id }).select(ORDER_FIELDS).sort({ createdAt: -1 }).limit(1000).lean<LedgerOrder[]>(),
    Promise.all(
      TEMPLATE_REGISTRY.map(async (entry) => {
        const docs = (await entry.model
          .find({ userId: id })
          .select("shareId isPublished viewCount createdAt")
          .sort({ createdAt: -1 })
          .lean()) as Array<{ _id: unknown; shareId?: string; isPublished?: boolean; viewCount?: number; createdAt?: Date }>;
        return docs.map((d) => ({ entry, d }));
      })
    ),
    BillingStatement.find({ userId: id }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  if (!user) return null;

  const pageMap = new Map<string, PageInfo>();
  for (const g of pageGroups) for (const { d } of g) pageMap.set(String(d._id), { shareId: d.shareId || null, isPublished: !!d.isPublished });
  const users = new Map([[String(user._id), { name: user.name as string, email: user.email as string }]]);
  const items = orders.map((o) => ledgerItem(o, users, pageMap));

  // The order that unlocked each page: a paid one if any, else a points one.
  const unlockByPage = new Map<string, LedgerItem>();
  for (const it of items) {
    if (!it.pageId || (it.status !== "paid" && it.status !== "points_used")) continue;
    const had = unlockByPage.get(it.pageId);
    if (!had || (had.status !== "paid" && it.status === "paid")) unlockByPage.set(it.pageId, it);
  }

  const pages = pageGroups
    .flat()
    .map(({ entry, d }) => {
      const pay = unlockByPage.get(String(d._id));
      return {
        _id: String(d._id),
        templateType: entry.templateType,
        templateLabel: entry.label,
        shareId: d.shareId || null,
        isPublished: !!d.isPublished,
        createdAt: d.createdAt ?? null,
        viewCount: d.viewCount || 0,
        payment: pay
          ? {
              orderId: pay._id,
              status: pay.status,
              amount: pay.amount,
              currency: pay.currency,
              amountInrPaise: pay.amountInrPaise,
              listAmount: pay.listAmount,
              discountAmount: pay.discountAmount,
              discountPercent: pay.discountPercent,
              discountSource: pay.discountSource,
              discountLabel: pay.discountLabel,
              seasonMode: pay.seasonMode,
              pointsUsed: pay.pointsUsed,
              paidAt: pay.paidAt,
              razorpayPaymentId: pay.razorpayPaymentId,
              invoiceNumber: pay.invoiceNumber,
            }
          : null,
      };
    })
    .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime());

  const paid = items.filter((i) => i.status === "paid");
  const points = items.filter((i) => i.status === "points_used");
  const paidTimes = paid.map((i) => i.paidAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());

  const dayMap = new Map<string, { date: string; orders: number; revenueInrPaise: number }>();
  for (const it of [...paid, ...points]) {
    if (!it.paidAt) continue;
    const date = istDate(it.paidAt);
    const d = dayMap.get(date) ?? { date, orders: 0, revenueInrPaise: 0 };
    d.orders += 1;
    d.revenueInrPaise += it.amountInrPaise;
    dayMap.set(date, d);
  }

  const freeAccess = user.freeAccess as { enabled?: boolean } | undefined;
  return {
    user: {
      _id: String(user._id),
      name: (user.name as string) || "",
      email: (user.email as string) || "",
      avatar: (user.avatar as string) || "",
      joinedAt: (user.createdAt as Date) ?? null,
      status: (user.status as string) || "active",
      country: (user.lastSeenCountry as string) || (user.signupCountry as string) || null,
      provider: (user.provider as string) || "local",
      freeAccess: !!freeAccess?.enabled,
      closedAt: (user.closedAt as Date) ?? null,
      closureMode: (user.closureMode as string) ?? null,
    },
    totals: {
      lifetimeRevenueInrPaise: paid.reduce((s, i) => s + i.amountInrPaise, 0),
      paidOrders: paid.length,
      pointsUnlocks: points.length,
      pointsSpent: points.reduce((s, i) => s + i.pointsUsed, 0),
      discountGivenInrPaise: paid.reduce((s, i) => s + i.discountInrPaise, 0),
      pagesCreated: pages.length,
      pagesPublished: pages.filter((p) => p.isPublished).length,
      paidPages: pages.filter((p) => p.payment?.status === "paid").length,
      firstPaidAt: paidTimes[0] ?? null,
      lastPaidAt: paidTimes[paidTimes.length - 1] ?? null,
    },
    pages,
    orders: items,
    days: [...dayMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
    statementsSent: statements.map((s) => ({
      _id: String(s._id),
      sentAt: s.createdAt,
      sentByEmail: s.sentByEmail,
      period: { from: s.period?.from, to: s.period?.to },
      orderCount: s.orderCount,
      totalInrPaise: s.totalInrPaise,
      to: s.to,
      messageId: s.messageId ?? null,
      status: s.status,
      error: s.error ?? null,
    })),
  };
}
