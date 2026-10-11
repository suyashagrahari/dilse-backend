// ─── Seasonal sale: the one place a season discount touches a price ─────────
//
// Pure functions, no database and no Express — the same reason as
// pricingMath.ts. `applySeasonSale` is called by every pricing read in
// config/templatePricing.ts (getPricing, getPricingFresh, allPricing), so the
// publish gate, `/payment/quote`, `/payment/pricing` and `createOrder` all see
// the same discounted number. Nothing else may discount a price.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
//   drop = drops[mode] (mode is a drop season: halloween, dandiya, diwali)
//   drop.saleEnabled && slug ∈ drop.saleSlugs && template is paid
//     → finalPricePaise = max(100, round(base × (100 − percent) / 100))
//       usdPriceCents   = scaled the same way, never below MIN_USD_CENTS
//                         (null stays null: the derived USD price follows the
//                         discounted INR price on its own)
//       discountPercent = percent, mrp = the regular price, so the paywall
//                         strikes the regular price through
//
// A free template stays free. Points are untouched — the sale is a money sale.
// A row that carries its own discount is left exactly as the admin set it.

import { MIN_USD_CENTS, type ResolvedPricing } from "./pricingMath";

// ── SEASONS AND DROPS ───────────────────────────────────────────────────────
//
// `mode` picks the one campaign the site shows. A mode that has a DROP (a set
// of templates with their own sale) is a key of `DROP_DEFAULTS`; "valentine"
// (the wishlist promo) and "off" have none. Each drop keeps its own settings in
// `drops[id]`, so switching the mode back and forth never loses a season's
// slugs or percent. Only the ACTIVE mode's drop is ever live: its sale
// discounts prices and its slugs are reachable while hidden from the gallery.
//
// Adding a season = one entry in DROP_DEFAULTS (+ the client's lib/season.ts).
//
// Stored rows written before drops existed carry flat `saleEnabled /
// salePercent / saleSlugs` fields, which were the Halloween drop.
// `seasonFromRow` migrates them on read; writes keep mirroring the Halloween
// drop into those flat fields so an older server build reads the same thing.

export const DROP_DEFAULTS = {
  halloween: { saleEnabled: true, salePercent: 49, saleSlugs: ["happy-halloween", "happy-halloween-premium"] },
  dandiya: { saleEnabled: true, salePercent: 30, saleSlugs: ["dandiya-partner"] },
  diwali: { saleEnabled: true, salePercent: 30, saleSlugs: ["happy-diwali"] },
} as const satisfies Record<string, { saleEnabled: boolean; salePercent: number; saleSlugs: readonly string[] }>;

export type DropId = keyof typeof DROP_DEFAULTS;
export const DROP_IDS = Object.keys(DROP_DEFAULTS) as DropId[];
export type SeasonMode = "valentine" | DropId | "off";
export const SEASON_MODES: readonly SeasonMode[] = ["valentine", ...DROP_IDS, "off"];

export const HALLOWEEN_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.halloween.saleSlugs;
export const DANDIYA_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.dandiya.saleSlugs;
export const DIWALI_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.diwali.saleSlugs;

/**
 * Round 1 had ONE merged "festive" season (Navratri + Diwali). It was never on
 * prod, but a dev/staging row may still say `mode: "festive"` or carry
 * `drops.festive`: both read as the Diwali season (`seasonFromRow`), and the
 * next write stores them under the new name.
 */
export const LEGACY_MODE_ALIASES: Readonly<Record<string, SeasonMode>> = { festive: "diwali" };
export const MIN_SALE_PERCENT = 1;
export const MAX_SALE_PERCENT = 90;
/** Razorpay's INR floor: ₹1. */
export const MIN_SALE_PAISE = 100;

export interface SeasonDrop {
  saleEnabled: boolean;
  salePercent: number;
  saleSlugs: string[];
}

export interface SeasonView {
  mode: SeasonMode;
  drops: Record<DropId, SeasonDrop>;
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

export function isDropId(x: unknown): x is DropId {
  return typeof x === "string" && (DROP_IDS as string[]).includes(x);
}

export function defaultDrop(id: DropId): SeasonDrop {
  const d = DROP_DEFAULTS[id];
  return { saleEnabled: d.saleEnabled, salePercent: d.salePercent, saleSlugs: [...d.saleSlugs] };
}

export function defaultDrops(): Record<DropId, SeasonDrop> {
  return Object.fromEntries(DROP_IDS.map((id) => [id, defaultDrop(id)])) as Record<DropId, SeasonDrop>;
}

/** What applies when no document exists — or when the read fails. */
export function defaultSeason(): SeasonView {
  return { mode: "halloween", drops: defaultDrops() };
}

/** The drop of the active mode, or null in "valentine" / "off". */
export function activeDrop(season: SeasonView | null | undefined): (SeasonDrop & { id: DropId }) | null {
  if (!season || !isDropId(season.mode)) return null;
  const drop = season.drops?.[season.mode];
  return drop ? { id: season.mode, ...drop } : null;
}

/** One drop field set read leniently from storage; anything malformed falls back to the default. */
function dropFromStored(raw: unknown, fallback: SeasonDrop): SeasonDrop {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pct = Number(o.salePercent);
  const slugs = Array.isArray(o.saleSlugs)
    ? (o.saleSlugs as unknown[]).map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : null;
  return {
    saleEnabled: typeof o.saleEnabled === "boolean" ? o.saleEnabled : fallback.saleEnabled,
    salePercent: Number.isFinite(pct) && pct >= MIN_SALE_PERCENT && pct <= MAX_SALE_PERCENT ? Math.round(pct) : fallback.salePercent,
    saleSlugs: slugs && slugs.length ? slugs : [...fallback.saleSlugs],
  };
}

/**
 * `drops.festive` as the Diwali drop: same sale switch and percent; its slugs
 * keep only what is not the Dandiya template (which now has its own season),
 * falling back to the Diwali default when nothing is left.
 */
function migrateFestiveDrop(f: Record<string, unknown>): Record<string, unknown> {
  const slugs = Array.isArray(f.saleSlugs)
    ? (f.saleSlugs as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => x && !DANDIYA_SALE_SLUGS.includes(x))
    : undefined;
  return { ...f, saleSlugs: slugs };
}

/**
 * A stored row (any vintage) as a SeasonView. Rows from before per-season
 * drops have only the flat fields: those were the Halloween drop. A row with
 * `drops.halloween` ignores the flat mirror.
 */
export function seasonFromRow(row: Record<string, unknown> | null | undefined): SeasonView {
  const d = defaultSeason();
  if (!row) return d;
  const rawMode = typeof row.mode === "string" ? (LEGACY_MODE_ALIASES[row.mode] ?? row.mode) : row.mode;
  const mode = SEASON_MODES.includes(rawMode as SeasonMode) ? (rawMode as SeasonMode) : d.mode;
  const stored = (row.drops && typeof row.drops === "object" ? row.drops : {}) as Record<string, unknown>;
  const drops = {} as Record<DropId, SeasonDrop>;
  for (const id of DROP_IDS) {
    let legacy = stored[id];
    if (legacy === undefined && id === "halloween") legacy = row;
    // Round 1's merged drop: its percent and on/off carry over to Diwali.
    if (legacy === undefined && id === "diwali" && stored.festive && typeof stored.festive === "object") {
      legacy = migrateFestiveDrop(stored.festive as Record<string, unknown>);
    }
    drops[id] = dropFromStored(legacy, d.drops[id]);
  }
  return {
    mode,
    drops,
    updatedAt: (row.updatedAt as Date) ?? null,
    updatedBy: (row.updatedBy as string) ?? null,
  };
}

/** The percent off for this slug right now, or 0 when the sale does not cover it. */
export function salePercentFor(slug: string, season: SeasonView | null | undefined): number {
  const drop = activeDrop(season);
  if (!drop || !drop.saleEnabled) return 0;
  const pct = Math.round(Number(drop.salePercent));
  if (!Number.isFinite(pct) || pct < MIN_SALE_PERCENT || pct > MAX_SALE_PERCENT) return 0;
  const key = String(slug || "").trim().toLowerCase();
  return drop.saleSlugs.includes(key) ? pct : 0;
}

/**
 * The slugs in the ACTIVE drop: the active mode's `saleSlugs` while the mode
 * has a drop (halloween, dandiya, diwali), and nothing otherwise.
 *
 * Drop membership is an access fact, separate from the sale: a template the
 * super admin put in the drop is reachable (its builder opens, it publishes)
 * even when it is hidden from the general gallery — see `isTemplateReachable`
 * in config/templateVisibility.ts. `saleEnabled` only switches the DISCOUNT off;
 * the drop itself still stands while its mode is on. In "valentine" or "off"
 * there is no drop, so membership grants nothing — and another season's drop
 * grants nothing either.
 *
 * The client mirrors this rule in `dropSlugsOf` (client/lib/season.ts) from the
 * same `GET /season` body; keep the two in step.
 */
export function dropSlugs(season: SeasonView | null | undefined): string[] {
  const drop = activeDrop(season);
  if (!drop) return [];
  return drop.saleSlugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

/** Is this slug in the active drop? See `dropSlugs`. */
export function isInDrop(slug: string, season: SeasonView | null | undefined): boolean {
  const key = String(slug || "").trim().toLowerCase();
  return !!key && dropSlugs(season).includes(key);
}

/** `amount` minus `percent`, rounded to the nearest minor unit, never below `floor`. */
export function discounted(amount: number, percent: number, floor: number): number {
  return Math.max(floor, Math.round((amount * (100 - percent)) / 100));
}

/** The pricing with the season sale applied, or the same object when it does not apply. */
export function applySeasonSale(pricing: ResolvedPricing, season: SeasonView | null | undefined): ResolvedPricing {
  if (pricing.isFree) return pricing;
  // The super admin already priced this one as a sale in /admin/pricing ("price
  // charged" + "discount"): that IS the Halloween price. Taking the season's
  // percent off it again charged ₹25 for a template set to ₹49.
  if (pricing.discountPercent > 0) return pricing;
  const pct = salePercentFor(pricing.slug, season);
  if (pct === 0) return pricing;

  const regular = pricing.finalPricePaise;
  // Whole rupees: a sale price of ₹101.49 reads like a bug on the paywall.
  const wholeRupees = Math.max(MIN_SALE_PAISE, Math.round(discounted(regular, pct, MIN_SALE_PAISE) / 100) * 100);
  const finalPricePaise = Math.min(regular, wholeRupees);
  const mrpPaise = Math.max(regular, finalPricePaise);
  const savingsPaise = mrpPaise - finalPricePaise;
  const usd = pricing.usdPriceCents;

  return {
    ...pricing,
    finalPricePaise,
    finalPrice: finalPricePaise / 100,
    mrpPaise,
    mrp: mrpPaise / 100,
    savingsPaise,
    savings: savingsPaise / 100,
    discountPercent: pct,
    usdPriceCents:
      typeof usd === "number" && usd > 0 ? Math.min(usd, discounted(usd, pct, MIN_USD_CENTS)) : usd,
  };
}

export type DropPatch = Partial<SeasonDrop>;
export interface SeasonPatch {
  mode?: SeasonMode;
  /** Per-drop edits: `{ diwali: { salePercent: 25 } }`. */
  drops?: Partial<Record<DropId, DropPatch>>;
  /**
   * The legacy flat fields (saleEnabled / salePercent / saleSlugs) of older
   * clients. They edit ONE drop: the body's mode when it has a drop, else the
   * stored mode's, else Halloween's — see `applySeasonPatch`.
   */
  flat?: DropPatch;
}

function validateDropFields(o: Record<string, unknown>, where: string): { ok: true; value: DropPatch } | { ok: false; error: string } {
  const value: DropPatch = {};
  if (o.saleEnabled !== undefined) {
    if (typeof o.saleEnabled !== "boolean") return { ok: false, error: `${where}saleEnabled must be true or false` };
    value.saleEnabled = o.saleEnabled;
  }
  if (o.salePercent !== undefined) {
    const p = o.salePercent;
    if (!Number.isInteger(p) || (p as number) < MIN_SALE_PERCENT || (p as number) > MAX_SALE_PERCENT) {
      return { ok: false, error: `${where}salePercent must be a whole number from ${MIN_SALE_PERCENT} to ${MAX_SALE_PERCENT}` };
    }
    value.salePercent = p as number;
  }
  if (o.saleSlugs !== undefined) {
    const s = o.saleSlugs;
    if (
      !Array.isArray(s) ||
      s.length === 0 ||
      s.length > 50 ||
      !s.every((x) => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(x))
    ) {
      return { ok: false, error: `${where}saleSlugs must be a non-empty list of lower-case template slugs` };
    }
    value.saleSlugs = Array.from(new Set(s as string[]));
  }
  return { ok: true, value };
}

/**
 * Validate a super admin's PUT body: `{ mode?, drops?: { [dropId]: { saleEnabled?,
 * salePercent?, saleSlugs? } }, saleEnabled?, salePercent?, saleSlugs? }`.
 * Every field optional, at least one required; unknown fields are ignored, an
 * unknown drop id is an error.
 */
export function validateSeasonPatch(input: unknown): { ok: true; value: SeasonPatch } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Body must be an object" };
  }
  const o = input as Record<string, unknown>;
  const value: SeasonPatch = {};

  if (o.mode !== undefined) {
    if (!SEASON_MODES.includes(o.mode as SeasonMode)) {
      return { ok: false, error: `mode must be one of ${SEASON_MODES.join(", ")}` };
    }
    value.mode = o.mode as SeasonMode;
  }
  const flat = validateDropFields(o, "");
  if (!flat.ok) return flat;
  if (Object.keys(flat.value).length) value.flat = flat.value;

  if (o.drops !== undefined) {
    if (typeof o.drops !== "object" || o.drops === null || Array.isArray(o.drops)) {
      return { ok: false, error: "drops must be an object keyed by season" };
    }
    const drops: Partial<Record<DropId, DropPatch>> = {};
    for (const [id, raw] of Object.entries(o.drops as Record<string, unknown>)) {
      if (!isDropId(id)) return { ok: false, error: `drops.${id} is not a season with a drop (${DROP_IDS.join(", ")})` };
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return { ok: false, error: `drops.${id} must be an object` };
      }
      const r = validateDropFields(raw as Record<string, unknown>, `drops.${id}.`);
      if (!r.ok) return r;
      if (Object.keys(r.value).length) drops[id] = r.value;
    }
    if (Object.keys(drops).length) value.drops = drops;
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: "Nothing to update: send mode, drops, saleEnabled, salePercent or saleSlugs" };
  }
  return { ok: true, value };
}

/** The settings after a validated patch. Pure: the service stores the result. */
export function applySeasonPatch(before: SeasonView, patch: SeasonPatch): SeasonView {
  const mode = patch.mode ?? before.mode;
  const drops = {} as Record<DropId, SeasonDrop>;
  for (const id of DROP_IDS) drops[id] = { ...before.drops[id], saleSlugs: [...before.drops[id].saleSlugs] };
  if (patch.flat) {
    const target: DropId = isDropId(patch.mode) ? patch.mode : isDropId(before.mode) ? before.mode : "halloween";
    drops[target] = { ...drops[target], ...patch.flat };
  }
  for (const [id, p] of Object.entries(patch.drops ?? {}) as [DropId, DropPatch][]) {
    drops[id] = { ...drops[id], ...p };
  }
  return { mode, drops, updatedAt: before.updatedAt ?? null, updatedBy: before.updatedBy ?? null };
}

/**
 * The sale shown for `mode`: its own drop's, or — for "valentine" / "off",
 * which have none — Halloween's, as the single-season API always answered.
 */
function saleShown(s: SeasonView) {
  const drop = activeDrop(s) ?? s.drops.halloween;
  return { enabled: drop.saleEnabled, percent: drop.salePercent, slugs: [...drop.saleSlugs] };
}

/**
 * The public shape of `GET /api/season`: `{ mode, sale, drops }`. `sale` is
 * the ACTIVE mode's drop (what single-season clients read); `drops` carries
 * every season's settings for pages that show a drop by name.
 */
export function publicSeason(s: SeasonView) {
  return {
    mode: s.mode,
    sale: saleShown(s),
    drops: Object.fromEntries(
      DROP_IDS.map((id) => [id, { enabled: s.drops[id].saleEnabled, percent: s.drops[id].salePercent, slugs: [...s.drops[id].saleSlugs] }])
    ) as Record<DropId, { enabled: boolean; percent: number; slugs: string[] }>,
  };
}

/** The super admin's shape: every drop, plus the flat fields of the drop `sale` shows. */
export function adminSeason(s: SeasonView) {
  const sale = saleShown(s);
  return {
    mode: s.mode,
    saleEnabled: sale.enabled,
    salePercent: sale.percent,
    saleSlugs: sale.slugs,
    drops: Object.fromEntries(DROP_IDS.map((id) => [id, { ...s.drops[id], saleSlugs: [...s.drops[id].saleSlugs] }])) as Record<
      DropId,
      SeasonDrop
    >,
    updatedAt: s.updatedAt ?? null,
    updatedBy: s.updatedBy ?? null,
  };
}
