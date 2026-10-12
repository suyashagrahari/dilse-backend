// ─── Revenue: the pure half ──────────────────────────────────────────────────
//
// No database and no Express — date-range math in IST, and the per-order
// readings (when was it paid, what was it worth in rupees, what discount did
// it carry) that every revenue report and billing statement shares. Kept apart
// from revenue.service.ts so the arithmetic is tested without Mongo, and so the
// ledger, the summary and the email can never disagree about one order.
//
// ── IST, ALWAYS ─────────────────────────────────────────────────────────────
//
// The owner reads "today" as an Indian calendar day. A UTC day boundary would
// put an order paid at 01:00 IST on the previous day's revenue. India has no
// daylight saving, so IST is a fixed +05:30 and a day boundary is plain
// arithmetic — no timezone database needed. Mongo-side day buckets use
// `timezone: "Asia/Kolkata"` (admin.controller.ts does the same).

import { orderInrPaise } from "../config/currency";

export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The longest custom range a report will compute. */
export const MAX_CUSTOM_DAYS = 366;

export type RangeKey = "today" | "7d" | "30d" | "90d" | "custom";
export const RANGE_KEYS: readonly RangeKey[] = ["today", "7d", "30d", "90d", "custom"];

export interface DayRange {
  /** First IST day, YYYY-MM-DD. */
  from: string;
  /** Last IST day, YYYY-MM-DD — inclusive. */
  to: string;
  /** 00:00 IST on `from`, as an instant. */
  start: Date;
  /** 00:00 IST on the day AFTER `to` — exclusive upper bound for queries. */
  end: Date;
  days: number;
}

export interface ResolvedRange extends DayRange {
  key: RangeKey;
  label: string;
  /** The equal-length period immediately before, for "▲ 12% vs previous". */
  previous: DayRange;
}

/** A bad `range` / `from` / `to`. The controller turns it into a 400. */
export class RangeInputError extends Error {}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** The IST calendar day an instant falls on, as YYYY-MM-DD. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 IST on `ymd`, as an instant. */
export function istDayStart(ymd: string): Date {
  const m = YMD_RE.exec(ymd);
  if (!m) throw new RangeInputError(`"${ymd}" is not a YYYY-MM-DD date`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - IST_OFFSET_MS);
}

/** `ymd` moved by `n` calendar days. */
export function addDays(ymd: string, n: number): string {
  return istDate(new Date(istDayStart(ymd).getTime() + n * DAY_MS));
}

/** Days from `from` to `to`, both included. */
export function daysInclusive(from: string, to: string): number {
  return Math.round((istDayStart(to).getTime() - istDayStart(from).getTime()) / DAY_MS) + 1;
}

/** Every IST day from `from` to `to`, inclusive, oldest first. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayRange(from: string, to: string): DayRange {
  return {
    from,
    to,
    start: istDayStart(from),
    end: istDayStart(addDays(to, 1)),
    days: daysInclusive(from, to),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct 2026" — the human form of an IST day. */
export function formatYmd(ymd: string): string {
  const m = YMD_RE.exec(ymd);
  if (!m) return ymd;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

/** "12 Oct 2026" for one day, "1 Oct 2026 – 12 Oct 2026" for a span. */
export function formatPeriod(from: string, to: string): string {
  return from === to ? formatYmd(from) : `${formatYmd(from)} – ${formatYmd(to)}`;
}

/**
 * The report window for `?range=`.
 *
 * Rolling ranges END TODAY and include it: `7d` on 12 Oct is 6 Oct … 12 Oct —
 * the seven days the owner would count on a calendar, today's partial day
 * included. `custom` takes `from` and `to` (IST days, inclusive) and may not
 * exceed MAX_CUSTOM_DAYS. A missing range is `7d`, the page's default.
 */
export function resolveRange(
  input: { range?: unknown; from?: unknown; to?: unknown },
  now: Date = new Date()
): ResolvedRange {
  const key = (input.range === undefined || input.range === "" ? "7d" : String(input.range)) as RangeKey;
  if (!RANGE_KEYS.includes(key)) {
    throw new RangeInputError(`range must be one of ${RANGE_KEYS.join(", ")}`);
  }
  const today = istDate(now);

  let from: string;
  let to: string;
  let label: string;
  if (key === "custom") {
    if (!isYmd(input.from) || !isYmd(input.to)) {
      throw new RangeInputError("A custom range needs from and to as YYYY-MM-DD");
    }
    from = input.from;
    to = input.to;
    if (from > to) throw new RangeInputError("from must be on or before to");
    if (daysInclusive(from, to) > MAX_CUSTOM_DAYS) {
      throw new RangeInputError(`A custom range can be at most ${MAX_CUSTOM_DAYS} days`);
    }
    label = formatPeriod(from, to);
  } else {
    const n = key === "today" ? 1 : parseInt(key, 10);
    to = today;
    from = addDays(today, -(n - 1));
    label = key === "today" ? "Today" : `Last ${n} days`;
  }

  const current = dayRange(from, to);
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(current.days - 1));
  return { key, label, ...current, previous: dayRange(prevFrom, prevTo) };
}

// ── ONE ORDER, READ THE SAME WAY EVERYWHERE ─────────────────────────────────

/** The PaymentOrder fields the reports read (a lean document). */
export interface LedgerOrder {
  _id?: unknown;
  userId?: unknown;
  templateType?: string;
  pageId?: unknown;
  status?: string;
  amount?: number;
  currency?: string;
  country?: string | null;
  fxRateToINR?: number;
  amountInrPaise?: number | null;
  listAmount?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountSource?: string;
  seasonMode?: string | null;
  templateLabel?: string;
  pointsUsed?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  invoiceNumber?: string;
  paidAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export const SETTLED_STATUSES = ["paid", "points_used"] as const;

const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

/**
 * When the order settled: `paidAt`, or — for rows written before paidAt
 * existed — `updatedAt`, which is when the status last changed. Null for an
 * order that never settled (created / failed).
 */
export function effectivePaidAt(o: LedgerOrder): Date | null {
  if (o.status !== "paid" && o.status !== "points_used") return null;
  return asDate(o.paidAt) ?? asDate(o.updatedAt);
}

/** The order's money in INR paise at its frozen rate — the one definition, from config/currency. */
export { orderInrPaise };

/** The undiscounted price, minor units; old rows have only `amount`. */
export function orderListAmount(o: LedgerOrder): number {
  return typeof o.listAmount === "number" ? o.listAmount : Math.max(0, o.amount || 0);
}

/** The discount, minor units of the order's currency; 0 on old rows. */
export function orderDiscountAmount(o: LedgerOrder): number {
  return typeof o.discountAmount === "number" ? Math.max(0, o.discountAmount) : 0;
}

/** "none" | "admin" | "season_sale", or "unknown" for rows from before the snapshot. */
export function orderDiscountSource(o: LedgerOrder): string {
  return o.discountSource || "unknown";
}

/** The discount in INR paise, at the order's frozen rate (0 when the rate is missing). */
export function orderDiscountInrPaise(o: LedgerOrder): number {
  const d = orderDiscountAmount(o);
  if (d === 0) return 0;
  if ((o.currency || "INR") === "INR") return d;
  const rate = Number(o.fxRateToINR);
  return Number.isFinite(rate) && rate > 0 ? Math.round(d * rate) : 0;
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Season sale — Dandiya 30%", "Discount 20%", or "—". */
export function discountLabel(o: LedgerOrder): string {
  const pct = Math.round(Number(o.discountPercent) || 0);
  if (pct <= 0 || orderDiscountAmount(o) <= 0) return "—";
  if (o.discountSource === "season_sale") {
    return o.seasonMode ? `Season sale — ${titleCase(String(o.seasonMode))} ${pct}%` : `Season sale ${pct}%`;
  }
  return `Discount ${pct}%`;
}

/** ₹1,234.50 / $12.99 — minor units in, display string out. */
export function formatMinor(amount: number, currency: string): string {
  const major = (Number(amount) || 0) / 100;
  if (currency === "USD") {
    return `$${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const whole = Number.isInteger(major);
  return `₹${major.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── TOTALS ──────────────────────────────────────────────────────────────────

export interface RangeTotals {
  revenueInrPaise: number;
  orders: number;
  payingUsers: number;
  pointsUnlocks: number;
  pointsSpent: number;
  discountGivenInrPaise: number;
}

/**
 * Money and points for the settled orders whose paid time falls in
 * [start, end). Money is `paid` only: a points unlock is counted as an unlock
 * and its points, never as revenue — points are not rupees.
 */
export function totalsFor(orders: LedgerOrder[], start: Date, end: Date): RangeTotals & { payingUserIds: Set<string> } {
  const t = {
    revenueInrPaise: 0,
    orders: 0,
    payingUsers: 0,
    pointsUnlocks: 0,
    pointsSpent: 0,
    discountGivenInrPaise: 0,
    payingUserIds: new Set<string>(),
  };
  for (const o of orders) {
    const at = effectivePaidAt(o);
    if (!at || at < start || at >= end) continue;
    if (o.status === "paid") {
      t.revenueInrPaise += orderInrPaise(o);
      t.orders += 1;
      t.discountGivenInrPaise += orderDiscountInrPaise(o);
      t.payingUserIds.add(String(o.userId));
    } else if (o.status === "points_used") {
      t.pointsUnlocks += 1;
      t.pointsSpent += Math.max(0, o.pointsUsed || 0);
    }
  }
  t.payingUsers = t.payingUserIds.size;
  return t;
}

// ── INVOICE NUMBERS ─────────────────────────────────────────────────────────

/**
 * `SS-YYYYMM-000123`: the IST month the number was ISSUED (the statement went
 * out), and a single sequence that never resets — so numbers are unique for
 * ever and sort in issue order within and across months.
 */
export function formatInvoiceNumber(issuedAt: Date, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`invalid invoice sequence ${seq}`);
  const ym = istDate(issuedAt).slice(0, 7).replace("-", "");
  return `SS-${ym}-${String(seq).padStart(6, "0")}`;
}

export const INVOICE_NUMBER_RE = /^SS-\d{6}-\d{6,}$/;

/** Sorted, de-duplicated ids joined — "the same set of orders" for the resend guard. */
export function orderSetKey(ids: Array<string | { toString(): string }>): string {
  return [...new Set(ids.map(String))].sort().join(",");
}

/** Escapes a user-supplied search string for a Mongo `$regex`. */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
