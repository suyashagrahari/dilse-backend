import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import { audit } from "../services/adminAudit";
import { invalidateEntitlement, parseFreeAccessBody, parsePaysBody } from "../config/freeAccess";

/**
 * Who publishes priced templates free — the two super-admin switches.
 *
 * Mounted under /admin/super (protect + requireSuperAdmin, which also refuses
 * impersonated sessions), so none of these re-check the role. Every change is
 * audited before success is reported, and drops the cached entitlement so the
 * gate agrees on the very next request.
 */

/** GET /admin/super/me/pays — the caller's own "Pay like a customer" switch. */
export const getMyPays = async (req: Request, res: Response): Promise<void> => {
  try {
    const me = await User.findById(req.userId).select("paysAsCustomer").lean<{ paysAsCustomer?: boolean }>();
    if (!me) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: { paysAsCustomer: !!me.paysAsCustomer } });
  } catch (error) {
    console.error("Get pays-as-customer error:", error);
    res.status(500).json({ success: false, error: "Failed to load the setting" });
  }
};

/**
 * PUT /admin/super/me/pays `{ paysAsCustomer: boolean }`
 *
 * Off (default): this super admin publishes every priced template free.
 * On: the paywall and a real checkout, exactly like a customer — for testing.
 * Only ever changes the CALLER's own account.
 */
export const setMyPays = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = parsePaysBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    const me = await User.findById(req.userId);
    if (!me) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    const before = !!me.paysAsCustomer;
    const after = parsed.value.paysAsCustomer;
    if (before !== after) {
      me.paysAsCustomer = after;
      await me.save();
      invalidateEntitlement(String(me._id));
      await audit(req, {
        action: "superadmin.pays_as_customer",
        targetUserId: String(me._id),
        targetUserEmail: me.email,
        changes: { paysAsCustomer: { from: before, to: after } },
      });
    }
    res.json({ success: true, data: { paysAsCustomer: after } });
  } catch (error) {
    console.error("Set pays-as-customer error:", error);
    res.status(500).json({ success: false, error: "Failed to save the setting" });
  }
};

/**
 * PUT /admin/super/users/:userId/free-access `{ enabled: boolean, note?: string }`
 *
 * "All templates free" for one account (influencers, or anybody). The grant
 * record is kept on revoke — `enabled: false` with the original granter — so the
 * history is still readable on the user page; the audit log has every change.
 */
export const setFreeAccess = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = String(req.params.userId);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, error: "Invalid user id" });
      return;
    }
    const parsed = parseFreeAccessBody(req.body);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    if (user.role === "superadmin") {
      res.status(400).json({
        success: false,
        error: "Super admins already publish free — use “Pay like a customer” on the Pricing page instead.",
        code: "SUPER_ADMIN_TARGET",
      });
      return;
    }

    const before = !!user.freeAccess?.enabled;
    const { enabled, note } = parsed.value;

    if (enabled) {
      user.freeAccess = {
        enabled: true,
        grantedBy: new mongoose.Types.ObjectId(String(req.userId)),
        grantedByEmail: req.userEmail,
        grantedAt: before && user.freeAccess?.grantedAt ? user.freeAccess.grantedAt : new Date(),
        note: note || (before ? user.freeAccess?.note : undefined) || undefined,
      };
    } else if (user.freeAccess) {
      user.freeAccess = {
        enabled: false,
        grantedBy: user.freeAccess.grantedBy,
        grantedByEmail: user.freeAccess.grantedByEmail,
        grantedAt: user.freeAccess.grantedAt,
        note: user.freeAccess.note,
      };
    }
    user.markModified("freeAccess");
    await user.save();
    invalidateEntitlement(userId);

    if (before !== enabled) {
      await audit(req, {
        action: enabled ? "user.grant_free_access" : "user.revoke_free_access",
        targetUserId: userId,
        targetUserEmail: user.email,
        changes: { freeAccess: { from: before, to: enabled } },
        reason: note || undefined,
      });
    }

    res.json({
      success: true,
      data: {
        freeAccess: user.freeAccess
          ? {
              enabled: !!user.freeAccess.enabled,
              grantedByEmail: user.freeAccess.grantedByEmail ?? null,
              grantedAt: user.freeAccess.grantedAt ?? null,
              note: user.freeAccess.note ?? null,
            }
          : { enabled: false, grantedByEmail: null, grantedAt: null, note: null },
      },
    });
  } catch (error) {
    console.error("Set free access error:", error);
    res.status(500).json({ success: false, error: "Failed to update free access" });
  }
};
