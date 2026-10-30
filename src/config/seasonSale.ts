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
//   drop = drops[mode] (mode is a drop season: halloween, dandiya, diwali, wedding)
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
  // The wedding season (the Nov–Feb muhurat months): the main wedding
  // invitations, in the hub's order. Ships with its sale OFF — a wedding drop
  // is a real price cut on the site's most expensive templates, so the super
  // admin switches it on deliberately in /admin/season. Rows stored before this
  // drop existed have no `drops.wedding` and read as exactly this
  // (`seasonFromRow`), so no migration is needed.
  wedding: {
    saleEnabled: false,
    salePercent: 20,
    saleSlugs: [
      "wedding-invitation",
      "wedding-invitation-premium",
      "royal-wedding-invitation",
      "palace-door-wedding-invitation",
      "garden-wedding-invitation",
      "floral-wedding-invitation",
      "lotus-wedding-invitation",
      "sikh-wedding-invitation",
      "muslim-wedding-invitation",
      "christian-wedding-invitation",
      "tamil-wedding-invitation",
      "telugu-wedding-invitation",
      "kannada-wedding-invitation",
      "malayalam-wedding-invitation",
      "marathi-wedding-invitation",
      "reception",
      "christian-wedding",
      "christian-wedding-2",
      "shaadi-card",
    ],
  },
} as const satisfies Record<string, { saleEnabled: boolean; salePercent: number; saleSlugs: readonly string[] }>;

export type DropId = keyof typeof DROP_DEFAULTS;
export const DROP_IDS = Object.keys(DROP_DEFAULTS) as DropId[];
export type SeasonMode = "valentine" | DropId | "off";
export const SEASON_MODES: readonly SeasonMode[] = ["valentine", ...DROP_IDS, "off"];

export const HALLOWEEN_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.halloween.saleSlugs;
export const DANDIYA_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.dandiya.saleSlugs;
export const DIWALI_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.diwali.saleSlugs;
export const WEDDING_SALE_SLUGS: readonly string[] = DROP_DEFAULTS.wedding.saleSlugs;

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
  /**
   * The mode everyone sees while `split` is off. While it is on, `modeIndia`
   * and `modeAbroad` decide instead and this is kept (and shown again the
   * moment the split is switched off).
   */
  mode: SeasonMode;
  /** Different seasons for visitors in India and abroad. False on every row written before the split existed. */
  split: boolean;
  /** What visitors in India (and, see UNKNOWN_COUNTRY_AUDIENCE, unknown ones) see while `split` is on. */
  modeIndia: SeasonMode;
  /** What visitors outside India see while `split` is on. */
  modeAbroad: SeasonMode;
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
  return { mode: "halloween", split: false, modeIndia: "halloween", modeAbroad: "halloween", drops: defaultDrops() };
}

// ── AUDIENCES: INDIA AND ABROAD ─────────────────────────────────────────────
//
// A super admin can show visitors in India one season and visitors abroad
// another (Diwali here, Halloween there). The visitor's side comes from the
// server's own country lookup (services/geo.service.ts) — never from anything
// the client sends — and is re-resolved on every request.
//
// Everything that prices or shows a season works on ONE visitor's view of it:
// `seasonForAudience(settings, audience)` collapses the split into a plain
// single-mode SeasonView, so `activeDrop`, `salePercentFor` and
// `applySeasonSale` never have to know the split exists. The one exception is
// reachability (`dropSlugs`): a hidden drop template opens if it is in the drop
// of EITHER side's mode, so a link sent from Delhi still opens in London. Only
// the price follows the visitor's own side.

export type Audience = "india" | "abroad";
export const AUDIENCES: readonly Audience[] = ["india", "abroad"];

/**
 * The side a visitor whose country is unknown sees: no geo database, a private
 * address, an address the database does not know. India, matching the currency
 * rule (config/currency.ts: unknown → INR). Flip it here and nowhere else.
 */
export const UNKNOWN_COUNTRY_AUDIENCE: Audience = "india";

/** Which side a country is on. `country` is an ISO code from normalizeCountry, or null. */
export function audienceForCountry(country: string | null | undefined): Audience {
  if (!country) return UNKNOWN_COUNTRY_AUDIENCE;
  return country === "IN" ? "india" : "abroad";
}

/** The mode this side sees. With the split off, both sides see `mode`. */
export function modeFor(season: SeasonView, audience: Audience): SeasonMode {
  if (!season.split) return season.mode;
  return audience === "india" ? season.modeIndia : season.modeAbroad;
}

/** Does the answer depend on the visitor's country right now? (Split on AND the two sides differ.) */
export function isSplit(season: SeasonView | null | undefined): boolean {
  return !!season?.split && season.modeIndia !== season.modeAbroad;
}

/** Every mode some visitor is seeing right now: one with the split off, one or two with it on. */
export function activeModes(season: SeasonView | null | undefined): SeasonMode[] {
  if (!season) return [];
  if (!season.split) return [season.mode];
  return season.modeIndia === season.modeAbroad ? [season.modeIndia] : [season.modeIndia, season.modeAbroad];
}

/**
 * One side's view of the settings: a single-mode SeasonView (split off) whose
 * `mode` is what that side sees. Every pricing read goes through this.
 */
export function seasonForAudience(season: SeasonView, audience: Audience): SeasonView {
  const mode = modeFor(season, audience);
  return { ...season, mode, split: false, modeIndia: mode, modeAbroad: mode };
}

/**
 * The drop of the active mode, or null in "valentine" / "off".
 *
 * Expects ONE visitor's view (`seasonForAudience`). Handed the raw settings
 * with the split on, it answers for UNKNOWN_COUNTRY_AUDIENCE rather than guess.
 */
export function activeDrop(season: SeasonView | null | undefined): (SeasonDrop & { id: DropId }) | null {
  if (!season) return null;
  const mode = season.split ? modeFor(season, UNKNOWN_COUNTRY_AUDIENCE) : season.mode;
  if (!isDropId(mode)) return null;
  const drop = season.drops?.[mode];
  return drop ? { id: mode, ...drop } : null;
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
  const readMode = (v: unknown, fallback: SeasonMode): SeasonMode => {
    const raw = typeof v === "string" ? (LEGACY_MODE_ALIASES[v] ?? v) : v;
    return SEASON_MODES.includes(raw as SeasonMode) ? (raw as SeasonMode) : fallback;
  };
  const mode = readMode(row.mode, d.mode);
  // Rows from before the India/abroad split: split off, and both sides start
  // at the single mode, so switching the split on changes nothing until a side is edited.
  const split = row.split === true;
  const modeIndia = readMode(row.modeIndia, mode);
  const modeAbroad = readMode(row.modeAbroad, mode);
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
    split,
    modeIndia,
    modeAbroad,
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
 * has a drop (halloween, dandiya, diwali, wedding), and nothing otherwise. With the
 * India/abroad split on, the union of both sides' active drops — reachability
 * is the same for every visitor; only the discount is per side.
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
  if (!season) return [];
  const out = new Set<string>();
  // With the split on: the union of both sides' drops (see AUDIENCES above).
  for (const mode of activeModes(season)) {
    if (!isDropId(mode)) continue;
    for (const s of season.drops?.[mode]?.saleSlugs ?? []) {
      const k = String(s).trim().toLowerCase();
      if (k) out.add(k);
    }
  }
  return [...out];
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

// ── WHERE A DISCOUNT CAME FROM ──────────────────────────────────────────────
//
// The order ledger records which discount a buyer received, so a statement can
// say "Season sale — Dandiya 30%" rather than an unexplained "30%". The paid
// amount itself never changes here: this reads the same branches
// `applySeasonSale` takes, in the same order, and reports which one fired.
// Keep the two in step — `seasonSale.test.ts` pins them together.

export type DiscountSource = "none" | "admin" | "season_sale";

export interface DiscountOrigin {
  source: DiscountSource;
  /** The drop whose sale applied ("dandiya"), only when source is "season_sale". */
  seasonMode: DropId | null;
}

/**
 * Which discount `applySeasonSale(pricing, season)` leaves on `pricing`.
 *
 * `pricing` is the row BEFORE the season sale (straight from `derivePricing`);
 * `season` is the one-side view the read used (`seasonForAudience`).
 */
export function discountOriginOf(
  pricing: ResolvedPricing,
  season: SeasonView | null | undefined
): DiscountOrigin {
  if (pricing.isFree) return { source: "none", seasonMode: null };
  if (pricing.discountPercent > 0) return { source: "admin", seasonMode: null };
  if (salePercentFor(pricing.slug, season) === 0) return { source: "none", seasonMode: null };
  return { source: "season_sale", seasonMode: activeDrop(season)?.id ?? null };
}

export type DropPatch = Partial<SeasonDrop>;
export interface SeasonPatch {
  /** The single mode (everyone, while `split` is off). */
  mode?: SeasonMode;
  split?: boolean;
  modeIndia?: SeasonMode;
  modeAbroad?: SeasonMode;
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
 * Validate a super admin's PUT body: `{ mode?, split?, modeIndia?, modeAbroad?, drops?: { [dropId]: { saleEnabled?,
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
  if (o.split !== undefined) {
    if (typeof o.split !== "boolean") return { ok: false, error: "split must be true or false" };
    value.split = o.split;
  }
  for (const key of ["modeIndia", "modeAbroad"] as const) {
    if (o[key] === undefined) continue;
    if (!SEASON_MODES.includes(o[key] as SeasonMode)) {
      return { ok: false, error: `${key} must be one of ${SEASON_MODES.join(", ")}` };
    }
    value[key] = o[key] as SeasonMode;
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
    return { ok: false, error: "Nothing to update: send mode, split, modeIndia, modeAbroad, drops, saleEnabled, salePercent or saleSlugs" };
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
  return {
    mode,
    split: patch.split ?? before.split,
    modeIndia: patch.modeIndia ?? before.modeIndia,
    modeAbroad: patch.modeAbroad ?? before.modeAbroad,
    drops,
    updatedAt: before.updatedAt ?? null,
    updatedBy: before.updatedBy ?? null,
  };
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
 * The public shape of `GET /api/season` for ONE visitor: `{ mode, sale, drops,
 * audience, split, audiences }`. `mode` and `sale` are what THIS visitor's side
 * sees (`sale` is that mode's drop — what single-season clients read); `drops`
 * carries every season's settings for pages that show a drop by name.
 *
 * `split` says the answer depends on the visitor's country, and `audiences`
 * names both sides' modes. Neither is a secret — anyone with a VPN sees both —
 * and a server render (which runs from the server's own address) needs them to
 * know it must not paint either side, and to reserve space for whichever comes.
 */
export function publicSeason(settings: SeasonView, audience: Audience = UNKNOWN_COUNTRY_AUDIENCE) {
  const s = seasonForAudience(settings, audience);
  return {
    mode: s.mode,
    sale: saleShown(s),
    audience,
    split: isSplit(settings),
    audiences: { india: modeFor(settings, "india"), abroad: modeFor(settings, "abroad") } as Record<Audience, SeasonMode>,
    drops: Object.fromEntries(
      DROP_IDS.map((id) => [id, { enabled: s.drops[id].saleEnabled, percent: s.drops[id].salePercent, slugs: [...s.drops[id].saleSlugs] }])
    ) as Record<DropId, { enabled: boolean; percent: number; slugs: string[] }>,
  };
}

/** The super admin's shape: every drop, plus the flat fields of the drop `sale` shows. */
export function adminSeason(s: SeasonView) {
  const sale = saleShown(seasonForAudience(s, UNKNOWN_COUNTRY_AUDIENCE));
  return {
    mode: s.mode,
    split: s.split,
    modeIndia: s.modeIndia,
    modeAbroad: s.modeAbroad,
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
