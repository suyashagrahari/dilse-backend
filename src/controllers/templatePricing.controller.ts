// ─── Super-admin pricing endpoints ───────────────────────────────────────────
//
// `requireSuperAdmin`, not `requireAdmin`. Template VISIBILITY is an admin
// decision — staff decide what is in the gallery. Template PRICE decides what
// users are charged, so it goes to the tier that already holds the money and
// identity capabilities rather than quietly widening what `admin` means for
// everyone who already has it.
//
// Every write is audited. A price is the kind of change where "who set this, and
// when" is the first question asked after a customer complaint.

import { Request, Response } from "express";
import TemplatePricing from "../models/TemplatePricing";
import { allPricing, invalidatePricingCache } from "../config/templatePricing";
import { validatePricingInput, derivePricing, type PricingRow } from "../config/pricingMath";
import { audit } from "../services/adminAudit";

/** A slug is a URL segment. Anything else is a client bug or an attack. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Guard against a bulk request large enough to be a denial of service. */
const MAX_BULK = 200;

interface StoredRow {
  slug: unknown;
  isFree: unknown;
  finalPricePaise: unknown;
  discountPercent: unknown;
  pointsCost: unknown;
  usdPriceCents?: unknown;
  updatedByEmail?: unknown;
  updatedAt?: unknown;
}

/**
 * GET /api/admin/template-pricing
 *
 * Every decision on record, plus the resolved view so the panel renders exactly
 * what the paywall will. A slug absent from `rows` has no decision and is free.
 */
export const getAdminTemplatePricing = async (_req: Request, res: Response): Promise<void> => {
  try {
    const docs = await TemplatePricing.find({})
      .select("slug isFree finalPricePaise discountPercent pointsCost usdPriceCents updatedByEmail updatedAt")
      .sort({ slug: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        rows: (docs as unknown as StoredRow[]).map((d) => ({
          slug:            String(d.slug),
          isFree:          Boolean(d.isFree),
          finalPricePaise: Number(d.finalPricePaise) || 0,
          discountPercent: Number(d.discountPercent) || 0,
          pointsCost:      Number(d.pointsCost) || 0,
          usdPriceCents:   typeof d.usdPriceCents === "number" ? d.usdPriceCents : null,
          updatedByEmail:  d.updatedByEmail ? String(d.updatedByEmail) : "",
          updatedAt:       d.updatedAt ?? null,
        })),
        /** Resolved, so the panel does not recompute the MRP and risk disagreeing. */
        resolved: await allPricing(),
      },
    });
  } catch (error) {
    console.error("Admin template pricing read error:", error);
    res.status(500).json({ success: false, error: "Could not read pricing" });
  }
};

type WriteResult =
  | { ok: true; before: PricingRow | null; after: PricingRow }
  | { ok: false; status: number; error: string };

/**
 * Validate and upsert one row, and audit it.
 *
 * Does NOT invalidate the cache — the caller does that once, after all its
 * writes, so a bulk update cannot leave the cache reflecting a half-applied set.
 */
async function writeOne(req: Request, slug: string, body: unknown): Promise<WriteResult> {
  if (!SLUG_RE.test(slug)) {
    return { ok: false, status: 400, error: `Invalid slug: ${slug}` };
  }

  const parsed = validatePricingInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };

  const prev = await TemplatePricing.findOne({ slug })
    .select("slug isFree finalPricePaise discountPercent pointsCost usdPriceCents")
    .lean();

  const before: PricingRow | null = prev
    ? {
        slug,
        isFree: Boolean((prev as unknown as StoredRow).isFree),
        finalPricePaise: Number((prev as unknown as StoredRow).finalPricePaise) || 0,
        discountPercent: Number((prev as unknown as StoredRow).discountPercent) || 0,
        pointsCost: Number((prev as unknown as StoredRow).pointsCost) || 0,
        usdPriceCents:
          typeof (prev as unknown as StoredRow).usdPriceCents === "number"
            ? ((prev as unknown as StoredRow).usdPriceCents as number)
            : null,
      }
    : null;

  // A client that does not send `usdPriceCents` at all (an older admin panel, a
  // bulk INR edit) must not silently erase the USD price somebody set. Only an
  // explicit value — a number, or null to go back to "derived" — changes it.
  const usdProvided =
    typeof body === "object" && body !== null && Object.prototype.hasOwnProperty.call(body, "usdPriceCents");
  const after: PricingRow = {
    ...parsed.value,
    slug,
    usdPriceCents: parsed.value.isFree
      ? null
      : usdProvided
        ? parsed.value.usdPriceCents ?? null
        : before?.usdPriceCents ?? null,
  };

  await TemplatePricing.findOneAndUpdate(
    { slug },
    {
      slug,
      isFree:          after.isFree,
      finalPricePaise: after.finalPricePaise,
      discountPercent: after.discountPercent,
      pointsCost:      after.pointsCost,
      usdPriceCents:   after.usdPriceCents ?? null,
      updatedByEmail:  req.userEmail || "",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await audit(req, {
    action: "template.set_pricing",
    targetTemplateType: slug,
    changes: {
      isFree:          { from: before?.isFree ?? true,       to: after.isFree },
      finalPricePaise: { from: before?.finalPricePaise ?? 0, to: after.finalPricePaise },
      discountPercent: { from: before?.discountPercent ?? 0, to: after.discountPercent },
      pointsCost:      { from: before?.pointsCost ?? 0,      to: after.pointsCost },
      usdPriceCents:   { from: before?.usdPriceCents ?? null, to: after.usdPriceCents ?? null },
    },
  });

  return { ok: true, before, after };
}

/** PATCH /api/admin/template-pricing/:slug */
export const setTemplatePricing = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const result = await writeOne(req, slug, req.body);

    if (!result.ok) {
      res.status(result.status).json({ success: false, error: result.error });
      return;
    }

    invalidatePricingCache();

    res.json({
      success: true,
      data: {
        slug,
        updatedByEmail: req.userEmail || "",
        // Hand back the resolved row so the panel shows the derived MRP the
        // server computed, rather than trusting its own copy of the formula.
        pricing: derivePricing(result.after),
      },
    });
  } catch (error) {
    console.error("Set template pricing error:", error);
    res.status(500).json({ success: false, error: "Could not save pricing" });
  }
};

/**
 * PATCH /api/admin/template-pricing  — bulk.
 *
 * Validates EVERY update before writing ANY of them. A partial write across a
 * price list is worse than a rejection: the panel would show some templates
 * repriced and some not, with no indication which — and one of them is live and
 * charging.
 */
export const setTemplatePricingBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    const { updates } = req.body as { updates?: unknown };

    if (!Array.isArray(updates) || updates.length === 0) {
      res.status(400).json({ success: false, error: "updates must be a non-empty array" });
      return;
    }
    if (updates.length > MAX_BULK) {
      res.status(400).json({ success: false, error: `At most ${MAX_BULK} updates in one request` });
      return;
    }

    // ── Pass 1: validate everything, write nothing ──────────────────────────
    const seen = new Set<string>();
    for (const u of updates as Array<Record<string, unknown>>) {
      const slug = String(u?.slug || "").trim().toLowerCase();
      if (!SLUG_RE.test(slug)) {
        res.status(400).json({ success: false, error: `Invalid slug: ${String(u?.slug)}` });
        return;
      }
      // Two updates for one slug in one request means the caller does not know
      // what it wants, and the outcome would depend on array order.
      if (seen.has(slug)) {
        res.status(400).json({ success: false, error: `${slug} appears twice in one request` });
        return;
      }
      seen.add(slug);

      const parsed = validatePricingInput(u);
      if (!parsed.ok) {
        res.status(400).json({ success: false, error: `${slug}: ${parsed.error}` });
        return;
      }
    }

    // ── Pass 2: write ───────────────────────────────────────────────────────
    let written = 0;
    try {
      for (const u of updates as Array<Record<string, unknown>>) {
        const result = await writeOne(req, String(u.slug).trim().toLowerCase(), u);
        if (!result.ok) {
          // Pass 1 validated all of these, so reaching here means a database
          // failure rather than bad input. Report how far it got — the caller
          // needs to know the set is half applied.
          res.status(500).json({
            success: false,
            error: `Saved ${written} of ${updates.length}, then failed on ${String(u.slug)}: ${result.error}`,
          });
          return;
        }
        written++;
      }
    } finally {
      // Even a half-applied set must not leave the cache serving pre-write data.
      invalidatePricingCache();
    }

    res.json({ success: true, data: { count: written } });
  } catch (error) {
    console.error("Bulk template pricing error:", error);
    invalidatePricingCache();
    res.status(500).json({ success: false, error: "Could not save pricing" });
  }
};

/**
 * DELETE /api/admin/template-pricing/:slug
 *
 * Drops the decision, so the template is free again by default. Deleting rather
 * than writing `isFree: true` keeps the collection a list of decisions — which is
 * what makes it small enough to read.
 */
export const clearTemplatePricing = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ success: false, error: `Invalid slug: ${slug}` });
      return;
    }

    const before = await TemplatePricing.findOne({ slug })
      .select("isFree finalPricePaise discountPercent pointsCost")
      .lean();

    const result = await TemplatePricing.deleteOne({ slug });

    // Report honestly rather than pretending: a 200 for a slug that had no row
    // reads to the panel as "cleared" and hides a typo in the slug.
    if (result.deletedCount === 0) {
      res.status(404).json({
        success: false,
        error: `${slug} has no pricing decision to clear — it is already free by default.`,
      });
      return;
    }

    await audit(req, {
      action: "template.clear_pricing",
      targetTemplateType: slug,
      changes: {
        isFree:          { from: Boolean((before as unknown as StoredRow)?.isFree), to: true },
        finalPricePaise: { from: Number((before as unknown as StoredRow)?.finalPricePaise) || 0, to: 0 },
      },
      reason: "pricing decision cleared — template is free by default",
    });

    invalidatePricingCache();

    res.json({ success: true, data: { slug } });
  } catch (error) {
    console.error("Clear template pricing error:", error);
    res.status(500).json({ success: false, error: "Could not clear pricing" });
  }
};
