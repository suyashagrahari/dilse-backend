// ─── Super-admin: who gets a template before everybody else ──────────────────
//
// `requireSuperAdmin`, not `requireAdmin`. Flipping a template's visibility is a
// staff decision and lives on `/admin/templates`. Deciding that one named person
// may use something the public cannot — and, per the publish gate's rule 4,
// without paying for it — is a different kind of power, and it goes to the tier
// that already holds the money and identity capabilities.
//
// Every write is audited. "Who gave this client access, and when" is the first
// question asked when a pre-release turns up somewhere it should not have.

import { Request, Response } from "express";
import mongoose from "mongoose";
import TemplateGrant from "../models/TemplateGrant";
import User from "../models/User";
import { invalidateGrantCache } from "../config/templateAccess";
import { audit } from "../services/adminAudit";
import { allTemplateTypeSlugPairs } from "../config/templateSlugs";

/** A slug is a URL segment. Anything else is a client bug or an attack. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * Every slug a grant may name.
 *
 * A grant on a slug that does not exist is a grant that silently does nothing —
 * the super admin sees it saved, the client still cannot open the template, and
 * nothing anywhere reports a problem. So the slug is checked against the
 * catalogue and not merely against a regex.
 *
 * Derived from `TEMPLATE_LOOKUPS`, which is already the list of which templates
 * exist, so a new template is grantable the moment it is shareable.
 */
const KNOWN_SLUGS: ReadonlySet<string> = new Set(
  allTemplateTypeSlugPairs().map((p) => p.slug)
);

interface GrantRow {
  userId: unknown;
  slug: unknown;
  grantedByEmail?: unknown;
  note?: unknown;
  createdAt?: unknown;
}

/**
 * GET /api/admin/template-grants
 *
 * How many people have early access to each template. Drives the index, which
 * lists every template in the catalogue — so this returns only the counts and
 * lets the client join against the catalogue it already imports.
 */
export const getTemplateGrantCounts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await TemplateGrant.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$slug", count: { $sum: 1 } } },
    ]);

    const counts: Record<string, number> = {};
    for (const r of rows) counts[String(r._id)] = r.count;

    res.json({ success: true, data: { counts } });
  } catch (error) {
    console.error("Template grant counts error:", error);
    res.status(500).json({ success: false, error: "Could not read grants" });
  }
};

/**
 * GET /api/admin/template-grants/:slug — who can use this template early.
 */
export const getTemplateGrantsForSlug = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: `Invalid slug: ${slug}` });
      return;
    }

    const rows = await TemplateGrant.find({ slug })
      .populate<{ userId: { _id: mongoose.Types.ObjectId; email: string; name: string; status: string } }>(
        "userId",
        "email name status"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        slug,
        grants: rows.map((r) => {
          // A user deleted after being granted leaves a row whose populate comes
          // back null. Shown rather than dropped, so the super admin can clear it.
          const u = r.userId as unknown as { _id?: unknown; email?: string; name?: string; status?: string } | null;
          return {
            userId: u?._id ? String(u._id) : "",
            email: u?.email || "(deleted user)",
            name: u?.name || "",
            status: u?.status || "",
            grantedByEmail: (r as unknown as GrantRow).grantedByEmail || "",
            note: (r as unknown as GrantRow).note || "",
            createdAt: (r as unknown as GrantRow).createdAt ?? null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Template grants for slug error:", error);
    res.status(500).json({ success: false, error: "Could not read grants" });
  }
};

/**
 * GET /api/admin/template-grants/user/:userId — what one person can use early.
 *
 * For the user-detail screen: the question there is "what can this client see",
 * which the per-slug view answers only by scanning every template.
 */
export const getTemplateGrantsForUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = String(req.params.userId || "");
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, error: "Invalid userId" });
      return;
    }

    const rows = await TemplateGrant.find({ userId })
      .select("slug grantedByEmail note createdAt")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        userId,
        grants: rows.map((r) => ({
          slug: String(r.slug),
          grantedByEmail: (r as unknown as GrantRow).grantedByEmail || "",
          note: (r as unknown as GrantRow).note || "",
          createdAt: (r as unknown as GrantRow).createdAt ?? null,
          /** So the screen can flag a grant on a template that no longer ships. */
          known: KNOWN_SLUGS.has(String(r.slug)),
        })),
      },
    });
  } catch (error) {
    console.error("Template grants for user error:", error);
    res.status(500).json({ success: false, error: "Could not read grants" });
  }
};

/**
 * POST /api/admin/template-grants — `{ userId, slug, note? }`
 *
 * Idempotent by upsert on the unique `(userId, slug)` index, so granting twice is
 * one row and not a race between a read and a write.
 */
export const createTemplateGrant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, slug: rawSlug, note } = req.body as {
      userId?: string;
      slug?: string;
      note?: string;
    };

    const slug = String(rawSlug || "").trim().toLowerCase();

    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      res.status(400).json({ success: false, error: "A valid userId is required" });
      return;
    }
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: `Invalid slug: ${String(rawSlug)}` });
      return;
    }
    if (!KNOWN_SLUGS.has(slug)) {
      res.status(400).json({
        success: false,
        error: `No template called "${slug}". A grant on an unknown slug would never take effect.`,
      });
      return;
    }
    if (note !== undefined && (typeof note !== "string" || note.length > 200)) {
      res.status(400).json({ success: false, error: "note must be text of 200 characters or fewer" });
      return;
    }

    // The grant must name a real account. Checked here rather than left to the
    // ref, because mongoose does not verify a ref exists and a grant pointing at
    // nothing is invisible until somebody wonders why access never worked.
    const target = await User.findById(userId).select("email name status").lean();
    if (!target) {
      res.status(404).json({ success: false, error: "That user does not exist" });
      return;
    }
    const targetStatus = String((target as unknown as { status?: string }).status || "");
    if (targetStatus === "banned" || targetStatus === "closed") {
      // `protect` would refuse them anyway, so the grant could never be used.
      // Refusing here says so, instead of storing something that cannot work.
      res.status(400).json({
        success: false,
        error: `That account is ${targetStatus} — reinstate it before granting access.`,
      });
      return;
    }

    await TemplateGrant.findOneAndUpdate(
      { userId, slug },
      {
        userId,
        slug,
        grantedBy: req.userId,
        grantedByEmail: req.userEmail || "",
        ...(note !== undefined ? { note: note.trim() } : {}),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, {
      action: "template.grant_access",
      targetUserId: String(userId),
      targetUserEmail: String((target as unknown as { email?: string }).email || ""),
      targetTemplateType: slug,
      reason: note ? String(note).trim() : undefined,
    });

    invalidateGrantCache(String(userId));

    res.status(201).json({
      success: true,
      data: {
        userId: String(userId),
        slug,
        email: (target as unknown as { email?: string }).email || "",
        name: (target as unknown as { name?: string }).name || "",
        grantedByEmail: req.userEmail || "",
        note: note ? String(note).trim() : "",
      },
    });
  } catch (error) {
    console.error("Create template grant error:", error);
    res.status(500).json({ success: false, error: "Could not grant access" });
  }
};

/**
 * DELETE /api/admin/template-grants/:slug/:userId — revoke.
 *
 * Deletes the row; the audit log keeps the history. See the note on the model for
 * why this is not a `revoked: true` tombstone.
 */
export const deleteTemplateGrant = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const userId = String(req.params.userId || "");

    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: `Invalid slug: ${slug}` });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ success: false, error: "Invalid userId" });
      return;
    }

    const result = await TemplateGrant.deleteOne({ userId, slug });

    // 404 rather than a cheerful 200: a revoke that removed nothing usually means
    // the wrong slug or the wrong user, and reporting success hides that.
    if (result.deletedCount === 0) {
      res.status(404).json({ success: false, error: "That grant does not exist" });
      return;
    }

    const target = await User.findById(userId).select("email").lean();

    await audit(req, {
      action: "template.revoke_access",
      targetUserId: userId,
      targetUserEmail: String((target as unknown as { email?: string } | null)?.email || ""),
      targetTemplateType: slug,
    });

    invalidateGrantCache(userId);

    res.json({ success: true, data: { userId, slug } });
  } catch (error) {
    console.error("Delete template grant error:", error);
    res.status(500).json({ success: false, error: "Could not revoke access" });
  }
};
