import { Request, Response } from "express";
import mongoose from "mongoose";
import User from "../models/User";
import InfluencerPayout from "../models/InfluencerPayout";
import { validateSubdomain, firstFreeVariant } from "./auth.controller";
import {
  buildInfluencerDashboard,
  findActiveInfluencerByCode,
  getInfluencerSettings,
  listInfluencersSummary,
  recordClick,
  updateInfluencerSettings,
} from "../services/influencer.service";
import { clampPercent } from "../config/influencerMath";
import { audit } from "../services/adminAudit";
import { parseInstagramHandle, profileInstagramUpdate } from "../config/instagramHandle";

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,32}$/i;

function cleanUpi(v: unknown): string | undefined | null {
  if (v === undefined) return undefined;
  const s = String(v || "").trim();
  if (!s) return "";
  return UPI_RE.test(s) ? s : null;
}

// ─── Influencer (self) ───────────────────────────────────────────────────────

/**
 * POST /influencer/register — instant: no approval step. The link name is the
 * user's subdomain, so a user without one picks it here.
 */
export const registerInfluencer = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    if (user.influencer) {
      if (user.influencer.status === "suspended") {
        res.status(403).json({ success: false, code: "INFLUENCER_SUSPENDED", error: "Your influencer account is paused. Contact support." });
        return;
      }
      res.json({ success: true, data: { subdomain: user.subdomain, influencer: { status: user.influencer.status } } });
      return;
    }

    // Compulsory since 2026-10: the handle is what tells followers the invite
    // page is really theirs.
    const ig = parseInstagramHandle(req.body.instagram);
    if (!ig.ok) {
      res.status(400).json({ success: false, field: "instagram", error: ig.message });
      return;
    }
    const instagram = ig.handle;
    const upiId = cleanUpi(req.body.upiId);
    if (upiId === null) {
      res.status(400).json({ success: false, field: "upiId", error: "Enter a UPI ID like name@okaxis" });
      return;
    }

    if (!user.subdomain) {
      const name = String(req.body.subdomain || "").toLowerCase().trim();
      const err = validateSubdomain(name);
      if (err) {
        res.status(400).json({ success: false, field: "subdomain", error: err });
        return;
      }
      const taken = await User.exists({ subdomain: name, _id: { $ne: user._id } });
      if (taken) {
        res.status(409).json({ success: false, field: "subdomain", error: "This name is already taken", alternative: await firstFreeVariant(name, String(user._id)) });
        return;
      }
      user.subdomain = name;
    }

    user.influencer = { status: "active", instagram, upiId: upiId || undefined, commissionPercent: null, joinedAt: new Date() };
    try {
      await user.save();
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        res.status(409).json({ success: false, field: "subdomain", error: "Someone just claimed this name", alternative: await firstFreeVariant(String(user.subdomain), String(user._id)) });
        return;
      }
      throw err;
    }
    res.status(201).json({ success: true, data: { subdomain: user.subdomain, influencer: { status: "active" } } });
  } catch (error) {
    console.error("Register influencer error:", error);
    res.status(500).json({ success: false, error: "Could not create your influencer account" });
  }
};

/** GET /influencer/dashboard */
export const getMyInfluencerDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await buildInfluencerDashboard(String(req.userId));
    if (!data) {
      res.status(404).json({ success: false, code: "NOT_INFLUENCER", error: "You are not registered as an influencer" });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error("Influencer dashboard error:", error);
    res.status(500).json({ success: false, error: "Failed to load dashboard" });
  }
};

/** PUT /influencer/profile — Instagram handle and UPI ID. */
export const updateMyInfluencerProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.userId);
    if (!user?.influencer) {
      res.status(404).json({ success: false, code: "NOT_INFLUENCER", error: "You are not registered as an influencer" });
      return;
    }
    const ig = profileInstagramUpdate(req.body.instagram, user.influencer.instagram);
    const upiId = cleanUpi(req.body.upiId);
    if (!ig.ok) {
      res.status(400).json({ success: false, field: "instagram", error: ig.message });
      return;
    }
    if (upiId === null) {
      res.status(400).json({ success: false, field: "upiId", error: "Enter a UPI ID like name@okaxis" });
      return;
    }
    if (ig.value !== undefined) user.influencer.instagram = ig.value;
    if (upiId !== undefined) user.influencer.upiId = upiId || undefined;
    user.markModified("influencer");
    await user.save();
    res.json({ success: true, data: { instagram: user.influencer.instagram, upiId: user.influencer.upiId } });
  } catch (error) {
    console.error("Update influencer profile error:", error);
    res.status(500).json({ success: false, error: "Failed to save" });
  }
};

// ─── Public (landing page) ───────────────────────────────────────────────────

/** GET /influencer/program — the public terms shown on the signup screen. */
export const getProgramTerms = async (_req: Request, res: Response): Promise<void> => {
  try {
    const s = await getInfluencerSettings();
    res.set("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: { defaultCommissionPercent: s.defaultCommissionPercent, attributionDays: s.attributionDays } });
  } catch (error) {
    console.error("Influencer program error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};

/** GET /influencer/public/:code — who invited you. 404 for unknown or paused. */
export const getPublicInfluencer = async (req: Request, res: Response): Promise<void> => {
  try {
    const inf = await findActiveInfluencerByCode(String(req.params.code));
    if (!inf) {
      res.status(404).json({ success: false, code: "INFLUENCER_NOT_FOUND", error: "This invite link isn't active" });
      return;
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({
      success: true,
      data: {
        name: inf.name,
        avatar: inf.avatar || undefined,
        instagram: inf.influencer?.instagram,
        code: inf.subdomain || inf.referralCode,
        attributionDays: (await getInfluencerSettings()).attributionDays,
      },
    });
  } catch (error) {
    console.error("Public influencer error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};

/** POST /influencer/click/:code — the client calls this at most once a day per browser. */
export const trackInfluencerClick = async (req: Request, res: Response): Promise<void> => {
  try {
    const inf = await findActiveInfluencerByCode(String(req.params.code));
    if (inf) await recordClick(inf._id);
    res.status(204).end();
  } catch (error) {
    console.error("Influencer click error:", error);
    res.status(204).end();
  }
};

// ─── Super admin ─────────────────────────────────────────────────────────────

/** GET /admin/super/influencers */
export const adminListInfluencers = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: await listInfluencersSummary() });
  } catch (error) {
    console.error("Admin list influencers error:", error);
    res.status(500).json({ success: false, error: "Failed to load influencers" });
  }
};

/** PUT /admin/super/influencers/settings */
export const adminUpdateInfluencerSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const patch: { defaultCommissionPercent?: number; attributionDays?: number } = {};
    if (req.body.defaultCommissionPercent !== undefined) {
      const p = Number(req.body.defaultCommissionPercent);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        res.status(400).json({ success: false, error: "Commission must be between 0 and 100" });
        return;
      }
      patch.defaultCommissionPercent = clampPercent(p);
    }
    if (req.body.attributionDays !== undefined) {
      const d = Math.round(Number(req.body.attributionDays));
      if (!Number.isFinite(d) || d < 1 || d > 365) {
        res.status(400).json({ success: false, error: "Days must be between 1 and 365" });
        return;
      }
      patch.attributionDays = d;
    }
    const before = await getInfluencerSettings(true);
    const after = await updateInfluencerSettings(patch, req.userEmail);
    await audit(req, {
      action: "influencer.settings",
      changes: {
        defaultCommissionPercent: { from: before.defaultCommissionPercent, to: after.defaultCommissionPercent },
        attributionDays: { from: before.attributionDays, to: after.attributionDays },
      },
    });
    res.json({ success: true, data: after });
  } catch (error) {
    console.error("Admin influencer settings error:", error);
    res.status(500).json({ success: false, error: "Failed to save settings" });
  }
};

function validId(req: Request, res: Response): string | null {
  const id = String(req.params.userId);
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, error: "Invalid user id" });
    return null;
  }
  return id;
}

/** GET /admin/super/influencers/:userId — the influencer's own dashboard, emails unmasked. */
export const adminGetInfluencer = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = validId(req, res);
    if (!id) return;
    const data = await buildInfluencerDashboard(id, { revealEmails: true });
    if (!data) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    console.error("Admin get influencer error:", error);
    res.status(500).json({ success: false, error: "Failed to load influencer" });
  }
};

/** PATCH /admin/super/influencers/:userId — { status?, commissionPercent? (number | null = default) } */
export const adminUpdateInfluencer = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = validId(req, res);
    if (!id) return;
    const user = await User.findById(id);
    if (!user?.influencer) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (req.body.status !== undefined) {
      if (!["active", "suspended"].includes(req.body.status)) {
        res.status(400).json({ success: false, error: "Status must be active or suspended" });
        return;
      }
      changes.status = { from: user.influencer.status, to: req.body.status };
      user.influencer.status = req.body.status;
    }
    if (req.body.commissionPercent !== undefined) {
      const raw = req.body.commissionPercent;
      let next: number | null = null;
      if (raw !== null && raw !== "") {
        const p = Number(raw);
        if (!Number.isFinite(p) || p < 0 || p > 100) {
          res.status(400).json({ success: false, error: "Commission must be between 0 and 100" });
          return;
        }
        next = clampPercent(p);
      }
      changes.commissionPercent = { from: user.influencer.commissionPercent ?? null, to: next };
      user.influencer.commissionPercent = next;
    }
    user.markModified("influencer");
    await user.save();
    await audit(req, { action: "influencer.update", targetUserId: user._id, targetUserEmail: user.email, changes });
    res.json({ success: true, data: { status: user.influencer.status, commissionPercent: user.influencer.commissionPercent ?? null } });
  } catch (error) {
    console.error("Admin update influencer error:", error);
    res.status(500).json({ success: false, error: "Failed to update influencer" });
  }
};

/** POST /admin/super/influencers/:userId/payouts — { amountRupees, note?, paidAt? } */
export const adminRecordPayout = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = validId(req, res);
    if (!id) return;
    const user = await User.findById(id).select("email influencer");
    if (!user?.influencer) {
      res.status(404).json({ success: false, error: "Not an influencer" });
      return;
    }
    const amountPaise = Math.round(Number(req.body.amountRupees) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 1) {
      res.status(400).json({ success: false, error: "Enter an amount greater than ₹0" });
      return;
    }
    const dash = await buildInfluencerDashboard(id);
    const pending = dash?.totals.pendingPaise ?? 0;
    if (amountPaise > pending) {
      res.status(400).json({ success: false, error: `That's more than the ₹${(pending / 100).toFixed(2)} pending` });
      return;
    }
    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
    const payout = await InfluencerPayout.create({
      influencerId: user._id,
      amountPaise,
      note: req.body.note ? String(req.body.note).slice(0, 200) : undefined,
      paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      recordedByEmail: req.userEmail,
    });
    await audit(req, {
      action: "influencer.payout_recorded",
      targetUserId: user._id,
      targetUserEmail: user.email,
      changes: { amountPaise: { from: null, to: amountPaise } },
      reason: payout.note,
    });
    res.status(201).json({ success: true, data: { id: String(payout._id) } });
  } catch (error) {
    console.error("Admin record payout error:", error);
    res.status(500).json({ success: false, error: "Failed to record payout" });
  }
};

/** DELETE /admin/super/influencers/:userId/payouts/:payoutId — undo a mistaken entry. */
export const adminDeletePayout = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = validId(req, res);
    if (!id) return;
    const payoutId = String(req.params.payoutId);
    if (!mongoose.Types.ObjectId.isValid(payoutId)) {
      res.status(400).json({ success: false, error: "Invalid payout id" });
      return;
    }
    const payout = await InfluencerPayout.findOneAndDelete({ _id: payoutId, influencerId: id });
    if (!payout) {
      res.status(404).json({ success: false, error: "Payout not found" });
      return;
    }
    await audit(req, {
      action: "influencer.payout_deleted",
      targetUserId: id,
      changes: { amountPaise: { from: payout.amountPaise, to: null } },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete payout error:", error);
    res.status(500).json({ success: false, error: "Failed to delete payout" });
  }
};
