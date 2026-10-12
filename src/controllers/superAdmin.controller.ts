import { Request, Response } from "express";
import { orderInrPaise } from "../config/currency";
import mongoose from "mongoose";
import User from "../models/User";
import PointTransaction from "../models/PointTransaction";
import Contribution from "../models/Contribution";
import Favorite from "../models/Favorite";
import ReferralRecord from "../models/ReferralRecord";
import PaymentOrder from "../models/PaymentOrder";
import PageView from "../models/PageView";
import AdminAuditLog from "../models/AdminAuditLog";
import { audit, diff } from "../services/adminAudit";
import { invalidateUser } from "../services/accountStatus";
import { rebuildBannedContent } from "../services/bannedContent";
import {
  TEMPLATE_REGISTRY,
  templateByType,
  supportsPassword,
  supportsPasswordRaw,
} from "../services/templateRegistry";
import { generateImpersonationToken, IMPERSONATION_TTL_SECONDS } from "../utils/jwt";
import { isSuperAdminEmail } from "../config/roles";

/**
 * Super-admin surfaces: the complete view of one user, and the small set of
 * actions that can be taken on them.
 *
 * Every handler here is mounted behind `protect` + `requireSuperAdmin`, so none
 * of them re-checks the role. Each one that reads personal data or changes
 * anything writes an audit entry BEFORE reporting success.
 */

/** Loads the target and refuses the cases no super admin may act on. */
async function loadTarget(
  req: Request,
  res: Response,
  { mutating }: { mutating: boolean }
) {
  const userId = String(req.params.userId);
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    res.status(400).json({ success: false, error: "Invalid user id" });
    return null;
  }
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ success: false, error: "User not found" });
    return null;
  }
  // The super admin is not a target. Suspending, demoting or impersonating the
  // only account that can undo those things is a one-way door — and an admin
  // account that can be seized by impersonating it is not an admin account.
  if (mutating && isSuperAdminEmail(user.email)) {
    res.status(403).json({
      success: false,
      error: "The super admin account cannot be modified or impersonated.",
    });
    return null;
  }
  return user;
}

// ─── COMPLETE PROFILE ───────────────────────────────────────────────────────

/**
 * Everything the platform knows about one user, in one response.
 *
 * Fans out across all ~43 page collections plus the six satellite collections.
 * That is ~50 parallel queries for a screen a super admin opens a few times a
 * day — chosen over a maintained aggregation because the registry guarantees a
 * new template is included automatically, and correctness matters more than
 * milliseconds on this particular screen.
 *
 * Page CONTENT is deliberately not included; this returns metadata only. The
 * content of a single page is a separate, separately-audited request, so
 * opening a profile does not silently log a read of forty private messages.
 */
export const getFullUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: false });
    if (!user) return;

    const userId = user._id;

    const [pageGroups, contributions, favorites, points, referralsMade, referredBy, payments, viewAgg] =
      await Promise.all([
        Promise.all(
          TEMPLATE_REGISTRY.map(async (entry) => {
            const docs = (await entry.model
              .find({ userId })
              .select("shareId isPublished viewCount installCount password createdAt updatedAt")
              .sort({ createdAt: -1 })
              .lean()) as Record<string, unknown>[];
            return docs.map((d) => ({
              _id: String(d._id),
              templateType: entry.templateType,
              templateLabel: entry.label,
              editorRoute: entry.editorRoute,
              shareId: d.shareId as string | undefined,
              isPublished: !!d.isPublished,
              viewCount: (d.viewCount as number) || 0,
              installCount: (d.installCount as number) || 0,
              // Whether a password exists, never the password itself.
              hasPassword: !!d.password,
              supportsPassword: supportsPassword(entry),
              createdAt: d.createdAt,
              updatedAt: d.updatedAt,
            }));
          })
        ),
        Contribution.find({ ownerId: userId }).sort({ createdAt: -1 }).limit(200).lean(),
        Favorite.find({ userId: String(userId) }).sort({ createdAt: -1 }).lean(),
        PointTransaction.find({ user: userId }).sort({ createdAt: -1 }).limit(200).lean(),
        ReferralRecord.find({ referrer: userId }).populate("referee", "email name createdAt").lean(),
        ReferralRecord.findOne({ referee: userId }).populate("referrer", "email name").lean(),
        PaymentOrder.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
        PageView.aggregate([
          { $match: { pageOwnerId: new mongoose.Types.ObjectId(String(userId)) } },
          { $group: { _id: null, total: { $sum: 1 } } },
        ]),
      ]);

    const pages = pageGroups
      .flat()
      .sort(
        (a, b) =>
          new Date(String(b.createdAt || 0)).getTime() -
          new Date(String(a.createdAt || 0)).getTime()
      );

    const safeUser = user.toObject() as unknown as Record<string, unknown>;
    delete safeUser.password;
    delete safeUser.refreshToken;
    delete safeUser.otp;

    await audit(req, {
      action: "user.view_profile",
      targetUserId: String(userId),
      targetUserEmail: user.email,
    });

    res.json({
      success: true,
      data: {
        user: safeUser,
        pages,
        contributions,
        favorites,
        points,
        referrals: { made: referralsMade, referredBy },
        payments,
        stats: {
          totalPages: pages.length,
          publishedPages: pages.filter((p) => p.isPublished).length,
          passwordProtectedPages: pages.filter((p) => p.hasPassword).length,
          totalViews: viewAgg[0]?.total || 0,
          totalContributions: contributions.length,
          // INR paise across currencies, at each order's frozen rate.
          totalSpent: payments
            .filter((p) => (p as { status?: string }).status === "paid")
            .reduce((s, p) => s + orderInrPaise(p as { amount?: number; currency?: string; amountInrPaise?: number }), 0),
        },
      },
    });
  } catch (error) {
    console.error("Super admin profile error:", error);
    res.status(500).json({ success: false, error: "Failed to load profile" });
  }
};

// ─── PAGE CONTENT + PASSWORD ────────────────────────────────────────────────

async function loadPage(req: Request, res: Response) {
  const templateType = String(req.params.templateType);
  const pageId = String(req.params.pageId);
  const entry = templateByType(templateType);
  if (!entry) {
    res.status(404).json({ success: false, error: `Unknown template "${templateType}"` });
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(pageId)) {
    res.status(400).json({ success: false, error: "Invalid page id" });
    return null;
  }
  const doc = await entry.model.findById(pageId).select("+passwordRaw");
  if (!doc) {
    res.status(404).json({ success: false, error: "Page not found" });
    return null;
  }
  return { entry, doc, pageId };
}

/** The full stored document for one page. Audited — this is private content. */
export const getPageContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadPage(req, res);
    if (!found) return;
    const { entry, doc, pageId } = found;

    const obj = doc.toObject() as Record<string, unknown>;
    const hasPassword = !!obj.password;
    // The hash and the plaintext are both withheld here; revealing the
    // password is its own endpoint so that it is its own audit entry.
    delete obj.password;
    delete obj.passwordRaw;

    await audit(req, {
      action: "page.view_content",
      targetUserId: String(obj.userId || ""),
      targetPageId: pageId,
      targetTemplateType: entry.templateType,
    });

    res.json({
      success: true,
      data: { page: obj, hasPassword, templateType: entry.templateType, label: entry.label },
    });
  } catch (error) {
    console.error("Super admin page content error:", error);
    res.status(500).json({ success: false, error: "Failed to load page" });
  }
};

/** Reveals the recipient password in plaintext. Always audited. */
export const revealPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadPage(req, res);
    if (!found) return;
    const { entry, doc, pageId } = found;
    const obj = doc.toObject() as Record<string, unknown>;

    if (!obj.password) {
      res.json({ success: true, data: { hasPassword: false, password: null } });
      return;
    }
    if (!supportsPasswordRaw(entry) || !obj.passwordRaw) {
      // Pages written before `passwordRaw` existed hold the hash and nothing
      // else, and bcrypt is one way — so it genuinely cannot be shown yet.
      //
      // "Yet" is the part worth saying. `services/pagePasswordRecovery` keeps
      // the plaintext the first time a recipient proves it correct, so this
      // resolves itself the next time the page is actually opened. Telling the
      // admin that is the difference between a dead end and a wait, and stops
      // a password being reset — which breaks the link the sender already sent
      // — when simply waiting would have answered it.
      res.json({
        success: true,
        data: {
          hasPassword: true,
          password: null,
          reason:
            "Created before passwords were kept in readable form, so only the one-way hash exists. " +
            "It will appear here the first time the recipient opens the page with it. " +
            "Reset it only if they cannot.",
        },
      });
      return;
    }

    await audit(req, {
      action: "user.reveal_password",
      targetUserId: String(obj.userId || ""),
      targetPageId: pageId,
      targetTemplateType: entry.templateType,
    });

    res.json({ success: true, data: { hasPassword: true, password: obj.passwordRaw } });
  } catch (error) {
    console.error("Super admin reveal password error:", error);
    res.status(500).json({ success: false, error: "Failed to reveal password" });
  }
};

/**
 * Sets or clears a page's share password.
 *
 * ── WHY `.save()` AND NEVER `updateOne` ─────────────────────────────────────
 *
 * Every page model hashes its password in a `pre("save")` hook. `updateOne`,
 * `findByIdAndUpdate` and the rest of the query-level helpers DO NOT run that
 * hook, so writing the password through any of them stores it in plaintext
 * while `comparePassword` keeps bcrypt-comparing against it — every subsequent
 * unlock attempt fails, and the stored secret is readable to anyone with
 * database access. Assign to the document and call `.save()`.
 */
export const setPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadPage(req, res);
    if (!found) return;
    const { entry, doc, pageId } = found;

    if (!supportsPassword(entry)) {
      res.status(400).json({
        success: false,
        error: `"${entry.label}" pages do not support passwords.`,
      });
      return;
    }

    const raw = typeof req.body?.password === "string" ? req.body.password.trim() : "";
    const clearing = raw === "";
    const obj = doc.toObject() as Record<string, unknown>;
    const had = !!obj.password;

    const d = doc as unknown as Record<string, unknown>;
    if (clearing) {
      d.password = "";
      if (supportsPasswordRaw(entry)) d.passwordRaw = "";
    } else {
      if (raw.length > 128) {
        res.status(400).json({ success: false, error: "Password is too long (max 128)." });
        return;
      }
      // Assignment + save, so the model's pre-save hook hashes it.
      d.password = raw;
    }
    await doc.save();

    await audit(req, {
      action: clearing ? "page.clear_password" : "page.reset_password",
      targetUserId: String(obj.userId || ""),
      targetPageId: pageId,
      targetTemplateType: entry.templateType,
      changes: { hasPassword: { from: had, to: !clearing } },
      reason: req.body?.reason,
    });

    res.json({
      success: true,
      data: { hasPassword: !clearing },
      message: clearing ? "Password removed — the page opens without one." : "Password updated.",
    });
  } catch (error) {
    console.error("Super admin set password error:", error);
    res.status(500).json({ success: false, error: "Failed to update password" });
  }
};

/**
 * Edits the content a user wrote on one of their pages.
 *
 * ── WHAT IS EDITABLE, AND WHY ONLY THAT ─────────────────────────────────────
 *
 * Scalars only — the strings, numbers, booleans and dates the user typed. Not
 * arrays, not nested objects, not media. Those are galleries, quiz banks and
 * track lists whose shape differs in all 43 templates; a generic editor over
 * them would be a JSON textarea that corrupts a page on one bad keystroke, and
 * the real editor already handles them properly.
 *
 * Fixing a typo, a wrong name or a wrong date is what support actually needs,
 * and that is exactly the scalar case.
 *
 * Keys are checked against the compiled schema, so a caller cannot introduce a
 * field the model does not define, and PROTECTED keys are refused outright:
 * `userId` would reassign the page to someone else, `shareId` would break every
 * link already sent, and `password` must go through the password route so it is
 * hashed by the pre-save hook rather than written raw.
 */
const PROTECTED_FIELDS = new Set([
  "_id", "__v", "userId", "shareId", "password", "passwordRaw", "contribToken",
  "viewCount", "installCount", "createdAt", "updatedAt",
  "quizAttempts", "quizAnswers", "gameResponses",
]);

export const updatePageContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadPage(req, res);
    if (!found) return;
    const { entry, doc, pageId } = found;

    const updates = req.body?.updates;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      res.status(400).json({ success: false, error: "updates must be an object of field -> value" });
      return;
    }

    const before = doc.toObject() as Record<string, unknown>;
    const d = doc as unknown as Record<string, unknown>;
    const applied: string[] = [];
    const rejected: string[] = [];

    for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
      if (PROTECTED_FIELDS.has(key)) { rejected.push(key); continue; }

      const path = entry.model.schema.path(key);
      if (!path) { rejected.push(key); continue; }

      // Scalars only. Anything whose schema type is an array or a subdocument
      // is left to the real editor.
      const t = path.instance;
      if (!["String", "Number", "Boolean", "Date"].includes(t)) { rejected.push(key); continue; }

      if (value === null || value === undefined) { d[key] = undefined; applied.push(key); continue; }
      if (t === "Number") {
        const n = Number(value);
        if (!Number.isFinite(n)) { rejected.push(key); continue; }
        d[key] = n;
      } else if (t === "Boolean") {
        d[key] = value === true || value === "true";
      } else if (t === "Date") {
        const dt = new Date(String(value));
        if (isNaN(dt.getTime())) { rejected.push(key); continue; }
        d[key] = dt;
      } else {
        d[key] = String(value);
      }
      applied.push(key);
    }

    if (applied.length === 0) {
      res.status(400).json({
        success: false,
        error: rejected.length
          ? `Nothing editable in that request. Refused: ${rejected.join(", ")}`
          : "No fields supplied.",
      });
      return;
    }

    await doc.save();
    const after = doc.toObject() as Record<string, unknown>;

    await audit(req, {
      action: "page.edit_content",
      targetUserId: String(before.userId || ""),
      targetPageId: pageId,
      targetTemplateType: entry.templateType,
      changes: diff(
        Object.fromEntries(applied.map((k) => [k, before[k]])),
        Object.fromEntries(applied.map((k) => [k, after[k]]))
      ),
      reason: req.body?.reason,
    });

    res.json({
      success: true,
      data: { applied, rejected },
      message: `Updated ${applied.length} field${applied.length > 1 ? "s" : ""}.`,
    });
  } catch (error) {
    console.error("Super admin edit page error:", error);
    res.status(500).json({ success: false, error: "Failed to update the page" });
  }
};

/** Permanently deletes a page. Its share link 404s for everyone afterwards. */
export const deletePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const found = await loadPage(req, res);
    if (!found) return;
    const { entry, doc, pageId } = found;
    const obj = doc.toObject() as Record<string, unknown>;

    await audit(req, {
      action: "page.delete",
      targetUserId: String(obj.userId || ""),
      targetPageId: pageId,
      targetTemplateType: entry.templateType,
      changes: {
        shareId: { from: obj.shareId, to: null },
        isPublished: { from: obj.isPublished, to: null },
      },
      reason: req.body?.reason,
    });

    await entry.model.deleteOne({ _id: pageId });
    res.json({ success: true, message: `${entry.label} page deleted.` });
  } catch (error) {
    console.error("Super admin delete page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};

// ─── POINTS ─────────────────────────────────────────────────────────────────

/**
 * Adjusts a balance and records WHY in the same ledger the rest of the points
 * system writes to. A bare balance edit leaves a number nobody can explain
 * later; the ledger row is what makes the adjustment auditable and reversible.
 */
export const adjustPoints = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;

    const delta = Number(req.body?.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ success: false, error: "delta must be a non-zero number" });
      return;
    }
    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      res.status(400).json({ success: false, error: "A reason is required for a points adjustment." });
      return;
    }

    const before = user.points || 0;
    // Balances never go negative: a -50 against a balance of 20 lands on 0.
    const after = Math.max(0, before + delta);
    const applied = after - before;

    user.points = after;
    if (applied > 0) user.totalPointsEarned = (user.totalPointsEarned || 0) + applied;
    await user.save();

    await PointTransaction.create({
      user: user._id,
      type: "admin_grant",
      delta: applied,
      balance: after,
      meta: { reason, actorEmail: req.userEmail, requestedDelta: delta },
    });

    await audit(req, {
      action: "user.adjust_points",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
      changes: { points: { from: before, to: after } },
      reason,
    });

    res.json({ success: true, data: { points: after, applied } });
  } catch (error) {
    console.error("Super admin adjust points error:", error);
    res.status(500).json({ success: false, error: "Failed to adjust points" });
  }
};

// ─── ACCOUNT STATUS ─────────────────────────────────────────────────────────

/**
 * Suspend, ban, or reinstate.
 *
 * `suspended` blocks sign-in but LEAVES published pages reachable: the
 * recipients holding those links are not the party being sanctioned. `banned`
 * additionally hides the pages. Both are reversible with `active`.
 */
export const setAccountStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;

    const status = String(req.body?.status || "");
    if (!["active", "suspended", "banned"].includes(status)) {
      res.status(400).json({ success: false, error: "status must be active, suspended or banned" });
      return;
    }
    const reason = String(req.body?.reason || "").trim();
    if (status !== "active" && !reason) {
      res.status(400).json({ success: false, error: "A reason is required to suspend or ban." });
      return;
    }

    // A "delete" closure removed the pages and anonymised the account: its
    // email is a placeholder and there is nobody left to let back in. A
    // "hide" closure is reversible, and reinstating it is exactly this call.
    if (user.status === "closed" && user.closureMode === "delete") {
      res.status(400).json({
        success: false,
        error: "This account was closed and its data deleted — it cannot be reinstated.",
      });
      return;
    }
    // Moving a closed account to suspended/banned would silently drop the
    // record of the owner's request. Reinstate it first if that is really meant.
    if (user.status === "closed" && status !== "active") {
      res.status(400).json({
        success: false,
        error: "This account is closed. Reinstate it (active) before suspending or banning.",
      });
      return;
    }

    const before = user.status || "active";
    if (before === "closed" && status === "active") {
      // The closure is over; the audit entry below keeps its history.
      user.closedAt = undefined;
      user.closedBy = undefined;
      user.closureReason = undefined;
      user.closureMode = undefined;
    }
    user.status = status as "active" | "suspended" | "banned";
    user.statusReason = status === "active" ? undefined : reason;
    user.statusChangedAt = new Date();
    user.statusChangedBy = new mongoose.Types.ObjectId(String(req.userId));
    user.suspendedUntil =
      status === "suspended" && req.body?.until ? new Date(req.body.until) : undefined;

    // A ban must end the sessions it is banning, not wait a day for the access
    // token to lapse.
    if (status !== "active") user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    invalidateUser(String(user._id));
    // Recompute which share links are hidden. Awaited so the response is not
    // sent until a ban is actually in force.
    await rebuildBannedContent();

    await audit(req, {
      action: status === "active" ? "user.reinstate" : status === "banned" ? "user.ban" : "user.suspend",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
      changes: { status: { from: before, to: status } },
      reason,
    });

    res.json({ success: true, data: { status: user.status, suspendedUntil: user.suspendedUntil } });
  } catch (error) {
    console.error("Super admin set status error:", error);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
};

/** Invalidates every token the user holds, on every device. */
export const forceLogout = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.refreshToken = undefined;
    await user.save();
    invalidateUser(String(user._id));

    await audit(req, {
      action: "user.force_logout",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
    });

    res.json({ success: true, message: "All sessions for this user have been signed out." });
  } catch (error) {
    console.error("Super admin force logout error:", error);
    res.status(500).json({ success: false, error: "Failed to sign out sessions" });
  }
};

// ─── IMPERSONATION ──────────────────────────────────────────────────────────

/**
 * Mints a short-lived token that authenticates AS the target user.
 *
 * The admin's own credentials are untouched and the user's are never read —
 * this is a separate token carrying both identities, so every request made
 * with it records who was really behind it. It cannot be refreshed and expires
 * in fifteen minutes; `blockImpersonation` refuses credential changes, account
 * deletion and all admin routes for the duration.
 */
export const startImpersonation = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadTarget(req, res, { mutating: true });
    if (!user) return;

    if (user.status !== "active") {
      res.status(400).json({
        success: false,
        error: `Cannot view as a ${user.status} account. Reinstate it first.`,
      });
      return;
    }

    const token = generateImpersonationToken({
      targetUserId: String(user._id),
      targetEmail: user.email,
      targetTokenVersion: user.tokenVersion || 0,
      actorId: String(req.userId),
      actorEmail: req.userEmail || "",
    });

    await audit(req, {
      action: "impersonation.start",
      targetUserId: String(user._id),
      targetUserEmail: user.email,
      reason: req.body?.reason,
    });

    res.json({
      success: true,
      data: {
        token,
        expiresInSeconds: IMPERSONATION_TTL_SECONDS,
        user: { _id: user._id, name: user.name, email: user.email },
      },
    });
  } catch (error) {
    console.error("Start impersonation error:", error);
    res.status(500).json({ success: false, error: "Failed to start session" });
  }
};

/**
 * Records the end of a session. Called with the impersonation token still
 * attached, so it is the one super-admin route reachable while impersonating —
 * it is mounted outside `requireSuperAdmin` for exactly that reason and takes
 * its identities from the token rather than the body.
 */
export const endImpersonation = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.impersonatorId) {
      res.status(400).json({ success: false, error: "Not an impersonation session." });
      return;
    }
    await audit(req, {
      action: "impersonation.end",
      targetUserId: req.userId,
      targetUserEmail: req.userEmail,
    });
    res.json({ success: true, message: "Impersonation ended." });
  } catch (error) {
    console.error("End impersonation error:", error);
    res.status(500).json({ success: false, error: "Failed to end session" });
  }
};

// ─── AUDIT LOG ──────────────────────────────────────────────────────────────

export const getAuditLog = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(parseInt(String(req.query.page)) || 1, 1);
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 200);
    const q: Record<string, unknown> = {};
    if (req.query.targetUserId) q.targetUserId = req.query.targetUserId;
    if (req.query.action) q.action = req.query.action;

    const [entries, total] = await Promise.all([
      AdminAuditLog.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AdminAuditLog.countDocuments(q),
    ]);

    res.json({
      success: true,
      data: { entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    console.error("Audit log error:", error);
    res.status(500).json({ success: false, error: "Failed to load audit log" });
  }
};
