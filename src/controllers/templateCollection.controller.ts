// ─── Curated places: which templates a place shows, in order ─────────────────
//
// A super admin decides the templates of a curated place — today only the
// /wedding hub — in /admin/places. See models/TemplateCollection.ts.
//
//   GET    /api/admin/template-collections/:key   the saved list (or null)
//   PUT    /api/admin/template-collections/:key   { items: [{ slug, group? }] }
//   DELETE /api/admin/template-collections/:key   reset to automatic
//
// The public side rides on GET /api/template-meta as `collections`, so the hub
// needs no extra request: `collections.wedding` is `{ items }` once saved and
// `null` while the place is automatic.
//
// Premium and the seasonal drops are places too, but they already have their
// own storage (TemplateTier, SeasonSettings.drops[id].saleSlugs); the admin
// screen edits those through their existing endpoints, not through here.

import { Request, Response, Router } from "express";
import TemplateCollection from "../models/TemplateCollection";
import { audit } from "../services/adminAudit";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const MAX_COLLECTION_ITEMS = 300;

/** Every place stored here, and the groups its items may carry (empty = no groups). */
export const COLLECTION_KEYS = {
  wedding: { groups: ["indian", "christian", "reception", "court", "rishta"] },
} as const satisfies Record<string, { groups: readonly string[] }>;

export type CollectionKey = keyof typeof COLLECTION_KEYS;
export const COLLECTION_KEY_LIST = Object.keys(COLLECTION_KEYS) as CollectionKey[];

export interface CollectionItem {
  slug: string;
  group?: string;
}

export function isCollectionKey(x: unknown): x is CollectionKey {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(COLLECTION_KEYS, x);
}

/**
 * Validate a PUT body for `key`. Slugs are trimmed and lower-cased; a repeated
 * slug keeps its FIRST position (and group). An empty or missing group is
 * dropped; an unknown group is an error rather than silently ignored, so a
 * typo in the admin UI never files a template under no chip.
 */
export function validateCollection(
  key: CollectionKey,
  body: unknown
): { ok: true; items: CollectionItem[] } | { ok: false; error: string } {
  const raw = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(raw)) return { ok: false, error: "`items` must be an array" };
  if (raw.length > MAX_COLLECTION_ITEMS) return { ok: false, error: `At most ${MAX_COLLECTION_ITEMS} templates` };
  const groups: readonly string[] = COLLECTION_KEYS[key].groups;
  const items: CollectionItem[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const obj = typeof v === "string" ? { slug: v } : v;
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      return { ok: false, error: "Each item must be { slug, group? }" };
    }
    const o = obj as { slug?: unknown; group?: unknown };
    const slug = String(o.slug ?? "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) return { ok: false, error: `Invalid slug "${String(o.slug)}"` };
    let group: string | undefined;
    if (o.group !== undefined && o.group !== null && o.group !== "") {
      if (typeof o.group !== "string") return { ok: false, error: `Invalid group for "${slug}"` };
      const g = o.group.trim().toLowerCase();
      if (!groups.includes(g)) {
        return {
          ok: false,
          error: groups.length
            ? `group for "${slug}" must be one of ${groups.join(", ")}`
            : `"${key}" items take no group`,
        };
      }
      group = g;
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    items.push(group ? { slug, group } : { slug });
  }
  return { ok: true, items };
}

// ── Storage seam (swapped for an in-memory one in the tests) ─────────────────

export interface CollectionRecord {
  items: CollectionItem[];
  updatedByEmail: string;
  updatedAt: Date | null;
}

export interface CollectionDeps {
  find(key: CollectionKey): Promise<CollectionRecord | null>;
  save(key: CollectionKey, items: CollectionItem[], email: string): Promise<CollectionRecord>;
  remove(key: CollectionKey): Promise<CollectionRecord | null>;
  audit(req: Request, input: Parameters<typeof audit>[1]): Promise<void>;
}

function toRecord(d: { items?: { slug: unknown; group?: unknown }[]; updatedByEmail?: string; updatedAt?: Date } | null): CollectionRecord | null {
  if (!d) return null;
  return {
    items: (d.items ?? []).map((i) => (i.group ? { slug: String(i.slug), group: String(i.group) } : { slug: String(i.slug) })),
    updatedByEmail: d.updatedByEmail || "",
    updatedAt: d.updatedAt ?? null,
  };
}

export const mongoCollectionDeps: CollectionDeps = {
  find: async (key) => toRecord(await TemplateCollection.findOne({ key }).lean()),
  save: async (key, items, email) =>
    toRecord(
      await TemplateCollection.findOneAndUpdate(
        { key },
        { key, items, updatedByEmail: email },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    ) as CollectionRecord,
  remove: async (key) => toRecord(await TemplateCollection.findOneAndDelete({ key }).lean()),
  audit,
};

// ── Public read (30 s cache, invalidated on write) ───────────────────────────

let publicCache: { data: Record<CollectionKey, { items: CollectionItem[] } | null>; at: number } | null = null;

/** `{ wedding: { items } | null }` for /api/template-meta. */
export async function publicCollections(
  deps: CollectionDeps = mongoCollectionDeps
): Promise<Record<CollectionKey, { items: CollectionItem[] } | null>> {
  if (publicCache && Date.now() - publicCache.at < 30_000) return publicCache.data;
  const data = {} as Record<CollectionKey, { items: CollectionItem[] } | null>;
  await Promise.all(
    COLLECTION_KEY_LIST.map(async (key) => {
      const rec = await deps.find(key);
      data[key] = rec ? { items: rec.items } : null;
    })
  );
  publicCache = { data, at: Date.now() };
  return data;
}

export function invalidateCollectionCache(): void {
  publicCache = null;
}

/** When no place is readable: every place automatic. */
export function emptyCollections(): Record<CollectionKey, null> {
  return Object.fromEntries(COLLECTION_KEY_LIST.map((k) => [k, null])) as Record<CollectionKey, null>;
}

// ── Super-admin handlers ─────────────────────────────────────────────────────

function keyOf(req: Request, res: Response): CollectionKey | null {
  const key = String(req.params.key || "").trim().toLowerCase();
  if (!isCollectionKey(key)) {
    res.status(404).json({ success: false, error: `Unknown place "${key}" (${COLLECTION_KEY_LIST.join(", ")})` });
    return null;
  }
  return key;
}

export function makeCollectionHandlers(deps: CollectionDeps = mongoCollectionDeps) {
  const get = async (req: Request, res: Response): Promise<void> => {
    const key = keyOf(req, res);
    if (!key) return;
    try {
      const rec = await deps.find(key);
      res.set("Cache-Control", "private, no-store");
      res.json({ success: true, data: { key, groups: COLLECTION_KEYS[key].groups, collection: rec } });
    } catch (error) {
      console.error("Admin template collection error:", error);
      res.status(500).json({ success: false, error: "Failed to read the place" });
    }
  };

  /** Replaces the whole list in one write, so a reader never sees half a reorder. */
  const put = async (req: Request, res: Response): Promise<void> => {
    const key = keyOf(req, res);
    if (!key) return;
    const parsed = validateCollection(key, req.body);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    try {
      const prev = await deps.find(key);
      const rec = await deps.save(key, parsed.items, req.userEmail || "");
      invalidateCollectionCache();
      await deps.audit(req, {
        action: "template.set_collection",
        targetTemplateType: key,
        changes: {
          items: {
            from: prev ? prev.items.slice(0, 30) : null,
            to: parsed.items.slice(0, 30),
          },
        },
      });
      res.json({ success: true, data: { key, groups: COLLECTION_KEYS[key].groups, collection: rec } });
    } catch (error) {
      console.error("Set template collection error:", error);
      res.status(500).json({ success: false, error: "Failed to save the place" });
    }
  };

  const del = async (req: Request, res: Response): Promise<void> => {
    const key = keyOf(req, res);
    if (!key) return;
    try {
      const prev = await deps.remove(key);
      invalidateCollectionCache();
      if (prev) {
        await deps.audit(req, {
          action: "template.clear_collection",
          targetTemplateType: key,
          changes: { items: { from: prev.items.slice(0, 30), to: null } },
        });
      }
      res.json({ success: true, data: { key, groups: COLLECTION_KEYS[key].groups, collection: null } });
    } catch (error) {
      console.error("Clear template collection error:", error);
      res.status(500).json({ success: false, error: "Failed to reset the place" });
    }
  };

  return { get, put, del };
}

/** Mount the three routes on `router`, each behind `guard` (requireSuperAdmin). */
export function mountTemplateCollections(
  router: Router,
  guard: (req: Request, res: Response, next: () => void) => unknown,
  deps: CollectionDeps = mongoCollectionDeps
): void {
  const h = makeCollectionHandlers(deps);
  router.get("/template-collections/:key", guard, h.get);
  router.put("/template-collections/:key", guard, h.put);
  router.delete("/template-collections/:key", guard, h.del);
}
