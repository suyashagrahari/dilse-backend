// ─── Template meta: tiers + "most created" ranking ───────────────────────────
//
// Two things the gallery needs that the code cannot know on its own:
//
//  • TIERS — which templates a super admin moved into (or out of) the Premium
//    collection. Only overrides are sent; the client applies them over the
//    code default `PREMIUM_SLUGS`.
//  • RANKING — how many pages each template has had created, busiest first.
//    The gallery orders by it and badges the top five.
//  • ORDER — the slugs a super admin pulled to the front of the gallery, in
//    their order (/admin/template-order). Empty = the code's PINNED_FIRST.
//
// The public read is anonymous and edge-cached, like /template-visibility: it is
// on the first page a stranger loads. Both halves fail soft — an error sends
// empty data and the gallery falls back to registry order and code tiers.

import { Request, Response } from "express";
import mongoose from "mongoose";
import TemplateTier from "../models/TemplateTier";
import TemplateOrder from "../models/TemplateOrder";
import { TEMPLATE_LOOKUPS } from "./share.controller";
import { audit } from "../services/adminAudit";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

// ── Tiers (30s cache, invalidated on write) ──────────────────────────────────

let tierCache: { map: Record<string, boolean>; at: number } | null = null;

async function tierOverrides(): Promise<Record<string, boolean>> {
  if (tierCache && Date.now() - tierCache.at < 30_000) return tierCache.map;
  const docs = await TemplateTier.find({}).select("slug premium").lean();
  const map: Record<string, boolean> = {};
  for (const d of docs) map[String(d.slug)] = Boolean(d.premium);
  tierCache = { map, at: Date.now() };
  return map;
}

// ── Order (30s cache, invalidated on write) ──────────────────────────────────

let orderCache: { slugs: string[]; at: number } | null = null;

async function galleryOrder(): Promise<string[]> {
  if (orderCache && Date.now() - orderCache.at < 30_000) return orderCache.slugs;
  const doc = await TemplateOrder.findOne({ key: "gallery" }).select("slugs").lean();
  const slugs = (doc?.slugs ?? []).map(String);
  orderCache = { slugs, at: Date.now() };
  return slugs;
}

// ── Ranking (10 min cache) ───────────────────────────────────────────────────
//
// One countDocuments per page model. Birthday and Birthday GF share a builder
// route, so counts are summed per slug; a model listed twice under the same slug
// is counted once.

const RANK_TTL = 10 * 60_000;
let rankCache: { rows: { slug: string; created: number }[]; at: number } | null = null;
let rankInflight: Promise<{ slug: string; created: number }[]> | null = null;

async function ranking(): Promise<{ slug: string; created: number }[]> {
  if (rankCache && Date.now() - rankCache.at < RANK_TTL) return rankCache.rows;
  if (rankInflight) return rankInflight;
  rankInflight = (async () => {
    try {
      const seen = new Set<string>();
      const bySlug = new Map<string, number>();
      await Promise.all(
        (TEMPLATE_LOOKUPS ?? []).map(async ({ model, templateType, editorRoute }) => {
          const slug = String(editorRoute || "").replace(/^\/+/, "").toLowerCase();
          const m = model as mongoose.Model<unknown>;
          const key = `${m.modelName}:${slug}`;
          if (!slug || seen.has(key)) return;
          seen.add(key);
          void templateType;
          const n = await m.estimatedDocumentCount();
          bySlug.set(slug, (bySlug.get(slug) ?? 0) + n);
        })
      );
      const rows = [...bySlug.entries()]
        .map(([slug, created]) => ({ slug, created }))
        .sort((a, b) => b.created - a.created || a.slug.localeCompare(b.slug));
      rankCache = { rows, at: Date.now() };
      return rows;
    } finally {
      rankInflight = null;
    }
  })();
  return rankInflight;
}

/** GET /api/template-meta — public. `{ tiers: {slug: premium}, ranking: [{slug, created}], order: [slug] }` */
export const getTemplateMeta = async (_req: Request, res: Response): Promise<void> => {
  const [tiers, rank, order] = await Promise.all([
    tierOverrides().catch((e) => { console.error("[template-meta] tiers:", e); return {}; }),
    ranking().catch((e) => { console.error("[template-meta] ranking:", e); return []; }),
    galleryOrder().catch((e) => { console.error("[template-meta] order:", e); return [] as string[]; }),
  ]);
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  res.json({ success: true, data: { tiers, ranking: rank, order } });
};

// ── Super-admin writes ───────────────────────────────────────────────────────

/** GET /api/admin/template-tiers — every override on record. */
export const getAdminTemplateTiers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const docs = await TemplateTier.find({}).select("slug premium updatedByEmail updatedAt").sort({ slug: 1 }).lean();
    res.json({
      success: true,
      data: {
        rows: docs.map((d) => ({
          slug: String(d.slug),
          premium: Boolean(d.premium),
          updatedByEmail: d.updatedByEmail || "",
          updatedAt: d.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Admin template tiers error:", error);
    res.status(500).json({ success: false, error: "Failed to read template tiers" });
  }
};

/** PATCH /api/admin/template-tiers/:slug  `{ premium: boolean }` */
export const setTemplateTier = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    const { premium } = req.body as { premium?: unknown };
    if (!SLUG_RE.test(slug)) { res.status(400).json({ success: false, error: "Invalid slug" }); return; }
    if (typeof premium !== "boolean") { res.status(400).json({ success: false, error: "premium must be true or false" }); return; }

    const prev = await TemplateTier.findOne({ slug }).select("premium").lean();
    await TemplateTier.findOneAndUpdate(
      { slug },
      { slug, premium, updatedByEmail: req.userEmail || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    tierCache = null;
    await audit(req, {
      action: "template.set_tier",
      targetTemplateType: slug,
      changes: { premium: { from: prev ? Boolean(prev.premium) : null, to: premium } },
    });
    res.json({ success: true, data: { slug, premium, updatedByEmail: req.userEmail || "" } });
  } catch (error) {
    console.error("Set template tier error:", error);
    res.status(500).json({ success: false, error: "Failed to save tier" });
  }
};

/** DELETE /api/admin/template-tiers/:slug — back to the code default. */
export const clearTemplateTier = async (req: Request, res: Response): Promise<void> => {
  try {
    const slug = String(req.params.slug || "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) { res.status(400).json({ success: false, error: "Invalid slug" }); return; }
    const prev = await TemplateTier.findOneAndDelete({ slug }).lean();
    tierCache = null;
    if (prev) {
      await audit(req, {
        action: "template.clear_tier",
        targetTemplateType: slug,
        changes: { premium: { from: Boolean(prev.premium), to: null } },
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Clear template tier error:", error);
    res.status(500).json({ success: false, error: "Failed to reset tier" });
  }
};

// ── Gallery order (super admin) ──────────────────────────────────────────────

/** GET /api/admin/template-order — the saved order, if any. */
export const getAdminTemplateOrder = async (_req: Request, res: Response): Promise<void> => {
  try {
    const doc = await TemplateOrder.findOne({ key: "gallery" }).select("slugs updatedByEmail updatedAt").lean();
    res.json({
      success: true,
      data: { slugs: (doc?.slugs ?? []).map(String), updatedByEmail: doc?.updatedByEmail || "", updatedAt: doc?.updatedAt ?? null },
    });
  } catch (error) {
    console.error("Admin template order error:", error);
    res.status(500).json({ success: false, error: "Failed to read template order" });
  }
};

/**
 * PUT /api/admin/template-order  `{ slugs: string[] }`
 *
 * Replaces the whole list in one write, so the gallery can never be read with
 * half of a reorder applied.
 */
export const setTemplateOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req.body as { slugs?: unknown })?.slugs;
    if (!Array.isArray(raw)) { res.status(400).json({ success: false, error: "`slugs` must be an array" }); return; }
    if (raw.length > 500) { res.status(400).json({ success: false, error: "Too many templates" }); return; }
    const slugs: string[] = [];
    for (const v of raw) {
      const slug = String(v ?? "").trim().toLowerCase();
      if (!SLUG_RE.test(slug)) { res.status(400).json({ success: false, error: `Invalid slug "${String(v)}"` }); return; }
      if (!slugs.includes(slug)) slugs.push(slug);
    }

    const prev = await TemplateOrder.findOne({ key: "gallery" }).select("slugs").lean();
    const doc = await TemplateOrder.findOneAndUpdate(
      { key: "gallery" },
      { key: "gallery", slugs, updatedByEmail: req.userEmail || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    orderCache = null;
    await audit(req, {
      action: "template.set_order",
      changes: { order: { from: prev ? prev.slugs.slice(0, 20) : null, to: slugs.slice(0, 20) } },
    });
    res.json({ success: true, data: { slugs: doc.slugs, updatedByEmail: doc.updatedByEmail, updatedAt: doc.updatedAt } });
  } catch (error) {
    console.error("Set template order error:", error);
    res.status(500).json({ success: false, error: "Failed to save template order" });
  }
};

/** DELETE /api/admin/template-order — back to the code's default order. */
export const clearTemplateOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const prev = await TemplateOrder.findOneAndDelete({ key: "gallery" }).lean();
    orderCache = null;
    if (prev) await audit(req, { action: "template.clear_order", changes: { order: { from: prev.slugs.slice(0, 20), to: null } } });
    res.json({ success: true });
  } catch (error) {
    console.error("Clear template order error:", error);
    res.status(500).json({ success: false, error: "Failed to reset template order" });
  }
};
