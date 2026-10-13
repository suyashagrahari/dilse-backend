// ─── Closing an account at its owner's request ──────────────────────────────
//
// A user writes in asking for their account to be closed; a super admin
// carries it out from the Danger tab. Two modes:
//
//   hide    Reversible. status → "closed": every share link is hidden through
//           the same blocked set a ban uses (bannedContent.ts) and every session
//           ends. The pages themselves are not touched — not even unpublished.
//           The person's IDENTITY is released (releaseIdentity): the email and
//           Google id move to closedEmail / closedGoogleId and the account keeps
//           a placeholder address, so the next time they sign in — Google,
//           password or code — they get a brand-new, empty account. Reinstating
//           (setAccountStatus "active") gives the identity back if no new
//           account has claimed it since (reclaimIdentity), and with it the
//           pages, exactly as they were.
//
//   delete  Permanent. Every page across the template registry is deleted,
//           with the satellite data that only exists for this user, and the
//           user document is anonymised in place: no name, no email, no way to
//           sign in. The document itself survives because accounting records
//           point at it.
//
// ── WHAT IS NEVER DELETED ───────────────────────────────────────────────────
//
// PaymentOrder, PointTransaction, ReferralRecord, InfluencerEarning,
// InfluencerPayout, BillingStatement and AdminAuditLog. These are financial
// and tax records (and the record of this closure); the law that lets a person
// ask for their data to be erased also requires the business to keep its books.
// They keep their userId, which now resolves to "Closed account", so the
// revenue reports still add up and show who paid as "Closed account".
//
// Also kept: PageView (aggregate traffic that platform analytics count) and
// support correspondence (EmailThread), which is the business's own record of
// what was asked and answered — including, usually, this request.

import crypto from "crypto";
import mongoose from "mongoose";
import User, { type IUser } from "../models/User";
import PaymentOrder from "../models/PaymentOrder";
import BillingStatement from "../models/BillingStatement";
import Contribution from "../models/Contribution";
import Favorite from "../models/Favorite";
import UserContent from "../models/UserContent";
import Wishlist from "../models/Wishlist";
import StoryProfile from "../models/StoryProfile";
import SharedAccess from "../models/SharedAccess";
import PageFeedback from "../models/PageFeedback";
import TemplateGrant from "../models/TemplateGrant";
import DraftNudge from "../models/DraftNudge";
import { TEMPLATE_REGISTRY } from "./templateRegistry";
import { invalidateUser } from "./accountStatus";
import { rebuildBannedContent } from "./bannedContent";

export type ClosureMode = "hide" | "delete";

export class ClosureError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ClosureRequest {
  mode: ClosureMode;
  reason: string;
}

const MAX_REASON = 500;

/**
 * Validates the close body against the account. Pure.
 *
 * `confirmEmail` must be the account's own address (case and surrounding
 * spaces ignored) — typing it is the admin's proof they have the right person
 * open, the same friction GitHub puts in front of deleting a repository.
 */
export function checkClosureRequest(body: unknown, accountEmail: string): ClosureRequest {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const mode = String(b.mode || "");
  if (mode !== "hide" && mode !== "delete") throw new ClosureError('mode must be "hide" or "delete".');
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (!reason) throw new ClosureError("A reason is required to close an account.");
  if (reason.length > MAX_REASON) throw new ClosureError(`The reason can be at most ${MAX_REASON} characters.`);
  const typed = typeof b.confirmEmail === "string" ? b.confirmEmail.trim().toLowerCase() : "";
  if (!typed || typed !== String(accountEmail || "").trim().toLowerCase()) {
    throw new ClosureError("Type the account's email address exactly to confirm.");
  }
  return { mode, reason };
}

/** The placeholder address a deleted account is left with. Never deliverable (.invalid, RFC 2606). */
export function anonymisedEmail(userId: string): string {
  return `closed+${userId}@closed.subhsandesh.invalid`;
}

export function emailHash(email: string): string {
  return crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
}

/**
 * Detach a closed account from the person who owned it: their email and Google
 * id move aside and the account keeps a placeholder, so signing in again with
 * either creates a NEW account instead of meeting the closed one. Query-level
 * update — no save hooks on an account that is being closed. Idempotent: an
 * account already released keeps the address it released first.
 */
export async function releaseIdentity(user: Pick<IUser, "_id" | "email" | "googleId" | "closedEmail">): Promise<void> {
  const id = String(user._id);
  const placeholder = anonymisedEmail(id);
  if (user.email === placeholder) return;
  const original = String(user.email || "").trim().toLowerCase();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        email: placeholder,
        closedEmail: user.closedEmail || original,
        closedEmailHash: emailHash(original),
        ...(user.googleId ? { closedGoogleId: user.googleId } : {}),
      },
      $unset: { googleId: 1, refreshToken: 1, otp: 1, otpExpiry: 1 },
    }
  );
  invalidateUser(id);
}

/**
 * The reverse of releaseIdentity, for a reinstated "hide" closure. Refuses —
 * leaving the account closed — when a new account already uses the address:
 * two accounts cannot share one, and the new one is the person's choice.
 */
export async function reclaimIdentity(
  user: Pick<IUser, "_id" | "email" | "closedEmail" | "closedGoogleId">
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!user.closedEmail) return { ok: true }; // never released (closed before this existed)
  const taken = await User.exists({ email: user.closedEmail, _id: { $ne: user._id } });
  if (taken) {
    return {
      ok: false,
      error: `${user.closedEmail} now belongs to a new account the person created after the closure, so this one cannot be reinstated with it.`,
    };
  }
  const googleTaken = user.closedGoogleId
    ? await User.exists({ googleId: user.closedGoogleId, _id: { $ne: user._id } })
    : null;
  await User.updateOne(
    { _id: user._id },
    {
      $set: { email: user.closedEmail, ...(user.closedGoogleId && !googleTaken ? { googleId: user.closedGoogleId } : {}) },
      $unset: { closedEmail: 1, closedGoogleId: 1, closedEmailHash: 1 },
    }
  );
  invalidateUser(String(user._id));
  return { ok: true };
}

/**
 * For the sign-in doors: a closed account found by email or Google id is
 * released on the spot and treated as absent, so the person gets a new
 * account. Every closure releases the identity when it happens; this covers
 * accounts closed before that was so.
 */
export async function releaseIfClosed<T extends Pick<IUser, "_id" | "email" | "googleId" | "closedEmail" | "status"> | null>(
  user: T
): Promise<T | null> {
  if (!user || user.status !== "closed") return user;
  await releaseIdentity(user);
  return null;
}

interface Satellite {
  model: mongoose.Model<unknown>;
  filter: (id: mongoose.Types.ObjectId, idStr: string) => Record<string, unknown>;
}

/**
 * Data that exists only because of this user, keyed by each model's real owner
 * field. Favorite, UserContent and Wishlist store the user id as a STRING; the
 * rest as an ObjectId. Contributions are keyed on the PAGE owner (`ownerId`) —
 * they are messages written onto this user's pages, which are going too.
 */
const SATELLITES: Satellite[] = [
  { model: Contribution as unknown as mongoose.Model<unknown>, filter: (id) => ({ ownerId: id }) },
  { model: Favorite as unknown as mongoose.Model<unknown>, filter: (_id, s) => ({ userId: s }) },
  { model: UserContent as unknown as mongoose.Model<unknown>, filter: (_id, s) => ({ userId: s }) },
  { model: Wishlist as unknown as mongoose.Model<unknown>, filter: (_id, s) => ({ userId: s }) },
  { model: StoryProfile as unknown as mongoose.Model<unknown>, filter: (id) => ({ userId: id }) },
  {
    model: SharedAccess as unknown as mongoose.Model<unknown>,
    filter: (id) => ({ $or: [{ senderUserId: id }, { recipientUserId: id }] }),
  },
  { model: PageFeedback as unknown as mongoose.Model<unknown>, filter: (id) => ({ userId: id }) },
  { model: TemplateGrant as unknown as mongoose.Model<unknown>, filter: (id) => ({ userId: id }) },
  { model: DraftNudge as unknown as mongoose.Model<unknown>, filter: (id) => ({ userId: id }) },
];

const collectionOf = (m: mongoose.Model<unknown>) => m.collection.collectionName;

/** What a close would hide or delete, and the accounting records it keeps. Read-only. */
export async function closurePreview(user: IUser) {
  const id = user._id;
  const idStr = String(id);
  const [pageCounts, satelliteCounts, paidOrders, pointsOrders, statements] = await Promise.all([
    Promise.all(
      TEMPLATE_REGISTRY.map(async (t) => {
        const [total, published, shareLinks] = await Promise.all([
          t.model.countDocuments({ userId: id }),
          t.model.countDocuments({ userId: id, isPublished: true }),
          t.model.countDocuments({ userId: id, shareId: { $exists: true, $nin: [null, ""] } }),
        ]);
        return { t, total, published, shareLinks };
      })
    ),
    Promise.all(SATELLITES.map(async (s) => ({ s, n: await s.model.countDocuments(s.filter(id, idStr)) }))),
    PaymentOrder.countDocuments({ userId: id, status: "paid" }),
    PaymentOrder.countDocuments({ userId: id, status: "points_used" }),
    BillingStatement.countDocuments({ userId: id }),
  ]);

  const wouldDelete: Record<string, number> = {};
  for (const p of pageCounts) if (p.total) wouldDelete[collectionOf(p.t.model)] = p.total;
  for (const { s, n } of satelliteCounts) if (n) wouldDelete[collectionOf(s.model)] = n;

  return {
    user: { _id: idStr, email: user.closedEmail || user.email, name: user.name, status: user.status, closureMode: user.closureMode ?? null },
    pages: {
      total: pageCounts.reduce((s, p) => s + p.total, 0),
      published: pageCounts.reduce((s, p) => s + p.published, 0),
      byTemplate: pageCounts
        .filter((p) => p.total)
        .map((p) => ({ templateType: p.t.templateType, label: p.t.label, total: p.total, published: p.published })),
    },
    /** `hide`: every share link of the account stops resolving. */
    hiddenShareLinks: pageCounts.reduce((s, p) => s + p.shareLinks, 0),
    /** `delete`: documents removed, per collection. */
    wouldDelete,
    kept: { paidOrders, pointsOrders, billingStatements: statements },
  };
}

/**
 * Carries out the close. The account is blocked FIRST (status, tokenVersion,
 * cache) so nothing the user does mid-deletion can create new data, and so a
 * failure halfway through leaves a closed account rather than an open one.
 */
export async function closeAccount(user: IUser, req: ClosureRequest, actorId: string) {
  const id = user._id;
  const idStr = String(id);
  // An account already closed with "hide" holds a placeholder; its real address is closedEmail.
  const previousEmail = user.closedEmail || user.email;

  if (user.status === "closed" && user.closureMode === "delete") {
    throw new ClosureError("This account has already been closed and its data deleted.", 409);
  }

  user.status = "closed";
  user.closedAt = new Date();
  user.closedBy = new mongoose.Types.ObjectId(actorId);
  user.closureReason = req.reason;
  user.closureMode = req.mode;
  user.statusReason = req.reason;
  user.statusChangedAt = user.closedAt;
  user.statusChangedBy = user.closedBy;
  user.suspendedUntil = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.refreshToken = undefined;
  await user.save();
  invalidateUser(idStr);

  if (req.mode === "hide") {
    await releaseIdentity({ _id: id, email: previousEmail, googleId: user.googleId, closedEmail: user.closedEmail });
    await rebuildBannedContent();
    const preview = await closurePreview(user);
    return { mode: req.mode, deleted: {} as Record<string, number>, hiddenShareLinks: preview.hiddenShareLinks };
  }

  const deleted: Record<string, number> = {};
  for (const t of TEMPLATE_REGISTRY) {
    const r = await t.model.deleteMany({ userId: id });
    if (r.deletedCount) deleted[collectionOf(t.model)] = (deleted[collectionOf(t.model)] || 0) + r.deletedCount;
  }
  for (const s of SATELLITES) {
    const r = await s.model.deleteMany(s.filter(id, idStr));
    if (r.deletedCount) deleted[collectionOf(s.model)] = (deleted[collectionOf(s.model)] || 0) + r.deletedCount;
  }

  // Anonymise in place with a query-level update: no pre-save hook should run
  // on a document that is being emptied (the referral-code and password hooks
  // have nothing useful to do here).
  await User.updateOne(
    { _id: id },
    {
      $set: {
        email: anonymisedEmail(idStr),
        name: "Closed account",
        avatar: "",
        emailOptOut: true,
        closedEmailHash: emailHash(previousEmail),
      },
      $unset: {
        // Delete forgets the person: not even the released address is kept.
        closedEmail: 1,
        closedGoogleId: 1,
        googleId: 1,
        password: 1,
        refreshToken: 1,
        otp: 1,
        otpExpiry: 1,
        pendingReferralCode: 1,
        subdomain: 1,
      },
    }
  );
  invalidateUser(idStr);
  // The pages are gone, so their links 404 on their own; rebuilt anyway so the
  // blocked set does not hold share ids that no longer exist.
  await rebuildBannedContent();

  return { mode: req.mode, deleted, hiddenShareLinks: 0 };
}
