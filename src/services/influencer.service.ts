import mongoose from "mongoose";
import User, { type IUser } from "../models/User";
import InfluencerSettings from "../models/InfluencerSettings";
import InfluencerEarning from "../models/InfluencerEarning";
import InfluencerPayout from "../models/InfluencerPayout";
import InfluencerClick from "../models/InfluencerClick";
import PaymentOrder, { type IPaymentOrder } from "../models/PaymentOrder";
import { orderInrPaise } from "../config/currency";
import { TEMPLATE_REGISTRY } from "./templateRegistry";
import {
  commissionPaise,
  effectiveCommissionPercent,
  maskEmail,
  pendingPaise,
  utcDay,
} from "../config/influencerMath";

// ─── Influencer programme ────────────────────────────────────────────────────
//
// The whole money path, in order:
//
//   1. A visitor opens priya.subhsandesh.in or /r/priya. The client stores the
//      code in a cookie on the root domain (so it survives the hop from a
//      subdomain to the apex) and pings `recordClick`.
//   2. They sign up. `attachInfluencerReferral` runs BEFORE the points-based
//      Refer & Earn: if the code belongs to an active influencer, the new user
//      is tied to them forever and no points change hands.
//   3. Whenever that user's Razorpay payment verifies, `recordEarningForOrder`
//      writes one InfluencerEarning at the rate in force right then.
//
// Points-unlocked and free pages never reach step 3 — there is no money to
// share — but they still show on the dashboard as "created".

// ── Settings ─────────────────────────────────────────────────────────────────

export interface InfluencerSettingsView {
  defaultCommissionPercent: number;
  attributionDays: number;
  updatedByEmail?: string;
  updatedAt?: Date;
}

const DEFAULT_SETTINGS: InfluencerSettingsView = { defaultCommissionPercent: 30, attributionDays: 60 };
let settingsCache: { at: number; value: InfluencerSettingsView } | null = null;
const SETTINGS_TTL_MS = 30_000;

export async function getInfluencerSettings(fresh = false): Promise<InfluencerSettingsView> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const row = await InfluencerSettings.findOne({ key: "global" }).lean();
  const value: InfluencerSettingsView = row
    ? {
        defaultCommissionPercent: row.defaultCommissionPercent,
        attributionDays: row.attributionDays,
        updatedByEmail: row.updatedByEmail,
        updatedAt: row.updatedAt,
      }
    : { ...DEFAULT_SETTINGS };
  settingsCache = { at: Date.now(), value };
  return value;
}

export async function updateInfluencerSettings(
  patch: Partial<Pick<InfluencerSettingsView, "defaultCommissionPercent" | "attributionDays">>,
  byEmail?: string
): Promise<InfluencerSettingsView> {
  await InfluencerSettings.findOneAndUpdate(
    { key: "global" },
    { $set: { ...patch, updatedByEmail: byEmail }, $setOnInsert: { key: "global" } },
    { upsert: true, runValidators: true }
  );
  settingsCache = null;
  return getInfluencerSettings(true);
}

export async function commissionPercentFor(influencer: Pick<IUser, "influencer">): Promise<number> {
  const { defaultCommissionPercent } = await getInfluencerSettings();
  return effectiveCommissionPercent(influencer.influencer?.commissionPercent, defaultCommissionPercent);
}

// ── Resolving a code ─────────────────────────────────────────────────────────

/**
 * An influencer's link name is their subdomain; their 8-character Refer & Earn
 * code also resolves to them, so links shared before they switched keep paying
 * commission rather than points. Only ACTIVE influencers on active accounts
 * resolve — a suspended influencer's link quietly stops attributing.
 */
export async function findActiveInfluencerByCode(code: string | undefined | null) {
  const raw = String(code || "").trim();
  if (!raw || raw.length > 40) return null;
  return User.findOne({
    "influencer.status": "active",
    status: "active",
    $or: [{ subdomain: raw.toLowerCase() }, { referralCode: raw.toUpperCase() }],
  });
}

/**
 * Ties a brand-new user to the influencer behind `code`. Returns true when the
 * code was an influencer's — the caller must then skip the points referral,
 * because influencer links grant no points to anyone.
 */
export async function attachInfluencerReferral(newUserId: string, code: string | undefined): Promise<boolean> {
  if (!code) return false;
  try {
    const influencer = await findActiveInfluencerByCode(code);
    if (!influencer) return false;
    if (String(influencer._id) === newUserId) return true; // own link: no attribution, no points
    // Conditional update: attribution is set once and never overwritten.
    await User.updateOne(
      { _id: newUserId, referredByInfluencer: null, referredBy: null },
      { $set: { referredByInfluencer: influencer._id } }
    );
    return true;
  } catch (err) {
    console.error("attachInfluencerReferral error (non-fatal):", err);
    return false;
  }
}

// ── Clicks ───────────────────────────────────────────────────────────────────

export async function recordClick(influencerId: mongoose.Types.ObjectId | string): Promise<void> {
  await InfluencerClick.updateOne(
    { influencerId, day: utcDay() },
    { $inc: { count: 1 } },
    { upsert: true }
  );
}

// ── Earnings ─────────────────────────────────────────────────────────────────

/**
 * Called after a PaymentOrder flips to "paid". Idempotent: the unique index on
 * paymentOrderId turns a second call into a no-op. Never throws — a commission
 * bookkeeping failure must not fail the customer's payment verification.
 */
export async function recordEarningForOrder(order: IPaymentOrder): Promise<void> {
  try {
    if (order.status !== "paid" || !order.amount || order.amount <= 0) return;
    // Commission is on the INR value frozen on the order, so a $1.99 PayPal
    // sale and a ₹149 UPI sale are paid out on the same basis.
    const inrPaise = orderInrPaise(order);
    if (inrPaise <= 0) return;
    const payer = await User.findById(order.userId).select("referredByInfluencer").lean();
    const influencerId = payer?.referredByInfluencer;
    if (!influencerId || String(influencerId) === String(order.userId)) return;

    const influencer = await User.findById(influencerId).select("influencer status").lean();
    if (!influencer?.influencer || influencer.influencer.status !== "active") return;

    const percent = await commissionPercentFor(influencer);
    await InfluencerEarning.create({
      influencerId,
      referredUserId: order.userId,
      paymentOrderId: order._id,
      templateType: order.templateType,
      pageId: order.pageId,
      amountPaise: inrPaise,
      currency: order.currency || "INR",
      originalAmount: order.amount,
      commissionPercent: percent,
      commissionPaise: commissionPaise(inrPaise, percent),
    });
  } catch (err) {
    if ((err as { code?: number })?.code === 11000) return;
    console.error("recordEarningForOrder error (non-fatal):", err);
  }
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export type PageKind = "paid" | "points" | "free";

export interface ReferredPageView {
  id: string;
  templateType: string;
  templateLabel: string;
  isPublished: boolean;
  createdAt: Date;
  kind: PageKind;
  amountPaise: number;
  commissionPaise: number;
}

export interface ReferredUserView {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  joinedAt: Date;
  pages: ReferredPageView[];
  paidPages: number;
  spentPaise: number;
  earnedPaise: number;
}

export interface InfluencerDashboard {
  profile: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    subdomain?: string;
    referralCode: string;
    status: "active" | "suspended";
    instagram?: string;
    upiId?: string;
    commissionPercent: number;
    commissionOverride: number | null;
    joinedAt: Date;
  };
  totals: { earnedPaise: number; paidOutPaise: number; pendingPaise: number; revenuePaise: number };
  stats: {
    clicks: number;
    signups: number;
    creators: number;
    pages: number;
    paidPages: number;
    freePages: number;
    conversionPercent: number;
  };
  daily: { day: string; clicks: number; signups: number; earnedPaise: number }[];
  referrals: ReferredUserView[];
  earnings: {
    id: string;
    referredUserName: string;
    templateLabel: string;
    amountPaise: number;
    commissionPercent: number;
    commissionPaise: number;
    createdAt: Date;
  }[];
  payouts: { id: string; amountPaise: number; note?: string; paidAt: Date }[];
}

const LABELS = new Map(TEMPLATE_REGISTRY.map((t) => [t.templateType, t.label]));

/**
 * Everything one influencer's dashboard shows. `revealEmails` is for the super
 * admin's view; the influencer themself sees masked addresses.
 */
export async function buildInfluencerDashboard(
  influencerId: string,
  { revealEmails = false, days = 30 }: { revealEmails?: boolean; days?: number } = {}
): Promise<InfluencerDashboard | null> {
  const inf = await User.findById(influencerId).lean();
  if (!inf?.influencer) return null;
  const infObjectId = new mongoose.Types.ObjectId(influencerId);

  const referred = await User.find({ referredByInfluencer: infObjectId })
    .select("name email avatar createdAt")
    .sort({ createdAt: -1 })
    .lean();
  const ids = referred.map((u) => u._id);

  const [pageGroups, orders, earnings, payouts, clickRows, settings] = await Promise.all([
    ids.length
      ? Promise.all(
          TEMPLATE_REGISTRY.map(async (entry) => {
            const docs = (await entry.model
              .find({ userId: { $in: ids } })
              .select("userId isPublished createdAt")
              .lean()) as unknown as { _id: unknown; userId: unknown; isPublished?: boolean; createdAt: Date }[];
            return docs.map((d) => ({ ...d, templateType: entry.templateType, templateLabel: entry.label }));
          })
        )
      : Promise.resolve([]),
    ids.length
      ? PaymentOrder.find({ userId: { $in: ids }, status: { $in: ["paid", "points_used"] } })
          .select("userId pageId status amount currency amountInrPaise")
          .lean()
      : Promise.resolve([]),
    InfluencerEarning.find({ influencerId: infObjectId }).sort({ createdAt: -1 }).lean(),
    InfluencerPayout.find({ influencerId: infObjectId }).sort({ paidAt: -1 }).lean(),
    InfluencerClick.find({ influencerId: infObjectId }).lean(),
    getInfluencerSettings(),
  ]);

  const orderByPage = new Map<string, { status: string; amount: number }>();
  for (const o of orders) {
    const key = String(o.pageId);
    // A paid order outranks a points one for the same page.
    if (!orderByPage.has(key) || o.status === "paid") orderByPage.set(key, { status: o.status, amount: orderInrPaise(o) });
  }
  const earningByPage = new Map<string, number>();
  for (const e of earnings) earningByPage.set(String(e.pageId), (earningByPage.get(String(e.pageId)) || 0) + e.commissionPaise);

  const pagesByUser = new Map<string, ReferredPageView[]>();
  for (const p of pageGroups.flat()) {
    const order = orderByPage.get(String(p._id));
    const kind: PageKind = order?.status === "paid" ? "paid" : order?.status === "points_used" ? "points" : "free";
    const view: ReferredPageView = {
      id: String(p._id),
      templateType: p.templateType,
      templateLabel: p.templateLabel,
      isPublished: !!p.isPublished,
      createdAt: p.createdAt,
      kind,
      amountPaise: kind === "paid" ? order!.amount : 0,
      commissionPaise: earningByPage.get(String(p._id)) || 0,
    };
    const list = pagesByUser.get(String(p.userId)) || [];
    list.push(view);
    pagesByUser.set(String(p.userId), list);
  }

  const nameById = new Map(referred.map((u) => [String(u._id), u.name]));
  const referrals: ReferredUserView[] = referred.map((u) => {
    const pages = (pagesByUser.get(String(u._id)) || []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const userEarnings = earnings.filter((e) => String(e.referredUserId) === String(u._id));
    return {
      id: String(u._id),
      name: u.name,
      email: revealEmails ? u.email : maskEmail(u.email),
      avatar: u.avatar || undefined,
      joinedAt: u.createdAt,
      pages,
      paidPages: pages.filter((p) => p.kind === "paid").length,
      spentPaise: userEarnings.reduce((s, e) => s + e.amountPaise, 0),
      earnedPaise: userEarnings.reduce((s, e) => s + e.commissionPaise, 0),
    };
  });

  const earnedPaise = earnings.reduce((s, e) => s + e.commissionPaise, 0);
  const paidOutPaise = payouts.reduce((s, p) => s + p.amountPaise, 0);
  const allPages = referrals.flatMap((r) => r.pages);
  const clicks = clickRows.reduce((s, c) => s + c.count, 0);

  // Last `days` UTC days, oldest first, for the activity chart.
  const daily: InfluencerDashboard["daily"] = [];
  const clickByDay = new Map(clickRows.map((c) => [c.day, c.count]));
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(new Date(Date.now() - i * 86_400_000));
    daily.push({
      day,
      clicks: clickByDay.get(day) || 0,
      signups: referred.filter((u) => utcDay(new Date(u.createdAt)) === day).length,
      earnedPaise: earnings
        .filter((e) => utcDay(new Date(e.createdAt)) === day)
        .reduce((s, e) => s + e.commissionPaise, 0),
    });
  }

  return {
    profile: {
      id: String(inf._id),
      name: inf.name,
      email: inf.email,
      avatar: inf.avatar || undefined,
      subdomain: inf.subdomain,
      referralCode: inf.referralCode,
      status: inf.influencer.status,
      instagram: inf.influencer.instagram,
      upiId: inf.influencer.upiId,
      commissionPercent: effectiveCommissionPercent(inf.influencer.commissionPercent, settings.defaultCommissionPercent),
      commissionOverride:
        typeof inf.influencer.commissionPercent === "number" ? inf.influencer.commissionPercent : null,
      joinedAt: inf.influencer.joinedAt,
    },
    totals: {
      earnedPaise,
      paidOutPaise,
      pendingPaise: pendingPaise(earnedPaise, paidOutPaise),
      revenuePaise: earnings.reduce((s, e) => s + e.amountPaise, 0),
    },
    stats: {
      clicks,
      signups: referred.length,
      creators: referrals.filter((r) => r.pages.length > 0).length,
      pages: allPages.length,
      paidPages: allPages.filter((p) => p.kind === "paid").length,
      freePages: allPages.filter((p) => p.kind !== "paid").length,
      conversionPercent: clicks > 0 ? Math.round((referred.length / clicks) * 1000) / 10 : 0,
    },
    daily,
    referrals,
    earnings: earnings.slice(0, 200).map((e) => ({
      id: String(e._id),
      referredUserName: nameById.get(String(e.referredUserId)) || "A user",
      templateLabel: LABELS.get(e.templateType) || e.templateType,
      amountPaise: e.amountPaise,
      commissionPercent: e.commissionPercent,
      commissionPaise: e.commissionPaise,
      createdAt: e.createdAt,
    })),
    payouts: payouts.map((p) => ({ id: String(p._id), amountPaise: p.amountPaise, note: p.note, paidAt: p.paidAt })),
  };
}

/** One row per influencer for the admin list, without the per-page fan-out. */
export async function listInfluencersSummary() {
  const [influencers, settings] = await Promise.all([
    User.find({ influencer: { $exists: true, $ne: null } })
      .select("name email avatar subdomain influencer freeAccess role createdAt")
      .sort({ "influencer.joinedAt": -1 })
      .lean(),
    getInfluencerSettings(),
  ]);
  const ids = influencers.map((i) => i._id);
  const [signups, earned, paid, clicks] = await Promise.all([
    User.aggregate([{ $match: { referredByInfluencer: { $in: ids } } }, { $group: { _id: "$referredByInfluencer", n: { $sum: 1 } } }]),
    InfluencerEarning.aggregate([
      { $match: { influencerId: { $in: ids } } },
      { $group: { _id: "$influencerId", commission: { $sum: "$commissionPaise" }, revenue: { $sum: "$amountPaise" }, paidPages: { $sum: 1 } } },
    ]),
    InfluencerPayout.aggregate([{ $match: { influencerId: { $in: ids } } }, { $group: { _id: "$influencerId", total: { $sum: "$amountPaise" } } }]),
    InfluencerClick.aggregate([{ $match: { influencerId: { $in: ids } } }, { $group: { _id: "$influencerId", total: { $sum: "$count" } } }]),
  ]);
  const by = <T extends { _id: unknown }>(rows: T[]) => new Map(rows.map((r) => [String(r._id), r]));
  const S = by(signups), E = by(earned), P = by(paid), C = by(clicks);

  return {
    settings,
    influencers: influencers.map((i) => {
      const id = String(i._id);
      const earnedPaise = (E.get(id) as { commission?: number } | undefined)?.commission || 0;
      const paidOutPaise = (P.get(id) as { total?: number } | undefined)?.total || 0;
      return {
        id,
        name: i.name,
        email: i.email,
        avatar: i.avatar || undefined,
        subdomain: i.subdomain,
        status: i.influencer!.status,
        instagram: i.influencer!.instagram,
        upiId: i.influencer!.upiId,
        commissionOverride: typeof i.influencer!.commissionPercent === "number" ? i.influencer!.commissionPercent : null,
        commissionPercent: effectiveCommissionPercent(i.influencer!.commissionPercent, settings.defaultCommissionPercent),
        joinedAt: i.influencer!.joinedAt,
        /** "All templates free" is on for this influencer's account. */
        freeAccess: !!i.freeAccess?.enabled,
        /** A super admin already publishes free; the toggle does not apply. */
        isSuperAdmin: i.role === "superadmin",
        clicks: (C.get(id) as { total?: number } | undefined)?.total || 0,
        signups: (S.get(id) as { n?: number } | undefined)?.n || 0,
        paidPages: (E.get(id) as { paidPages?: number } | undefined)?.paidPages || 0,
        revenuePaise: (E.get(id) as { revenue?: number } | undefined)?.revenue || 0,
        earnedPaise,
        paidOutPaise,
        pendingPaise: pendingPaise(earnedPaise, paidOutPaise),
      };
    }),
  };
}
