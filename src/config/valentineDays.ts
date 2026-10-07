// ─── Valentine's week — the eight days, one engine ───────────────────────────
//
// Rose Day (7 Feb) → Valentine's Day (14 Feb) are eight templates that share one
// data shape. Everything every day has (names, the letter, photos, five GIF
// slots, music, the ending line) is a real field on ValentineDayPage; everything
// that belongs to one day only (the rose colour, the chocolate reasons, the hug
// menu) lives in `extras` and is described here as a FieldSpec list.
//
// This file is the server half of the contract. The client half is
// client/app/(templates)/_valentine/days/<slug>.ts, which carries the SAME keys
// and limits plus the UI (labels, placeholders, demo copy). They are kept in
// step by hand; valentineDays.test.ts pins every day's keys so a drift on this
// side is a red test, not a silently-dropped field.
//
// One FieldSpec list drives three things:
//   1. sanitizeExtras() — what the API stores (unknown keys dropped, caps applied)
//   2. the client's spec-driven EditSheet
//   3. config/aiFill/<slug>.ts — which extras the AI may write (text leaves only)

export const VALENTINE_DAY_SLUGS = [
  "happy-rose-day",
  "happy-propose-day",
  "happy-chocolate-day",
  "happy-teddy-day",
  "happy-promise-day",
  "happy-hug-day",
  "happy-kiss-day",
  "happy-valentines-day",
] as const;

export type ValentineDaySlug = (typeof VALENTINE_DAY_SLUGS)[number];

export const isValentineDaySlug = (s: unknown): s is ValentineDaySlug =>
  typeof s === "string" && (VALENTINE_DAY_SLUGS as readonly string[]).includes(s);

/** A leaf an `objlist` item may hold. Lists of lists are deliberately impossible. */
export type LeafSpec =
  | { key: string; kind: "text" | "longtext"; max: number; min?: number }
  | { key: string; kind: "enum"; options: readonly string[]; default?: string }
  | { key: string; kind: "number"; min: number; max: number; default?: number }
  | { key: string; kind: "bool"; default?: boolean };

export type FieldSpec =
  | LeafSpec
  /** string[] — blanks removed, each item trimmed and capped. */
  | { key: string; kind: "list"; maxItems: number; minItems?: number; itemMax: number }
  /** {..}[] of text/enum/number/bool leaves — an item with no text at all is dropped. */
  | { key: string; kind: "objlist"; maxItems: number; minItems?: number; item: readonly LeafSpec[] };

export interface ValentineDayConfig {
  title: string;
  extras: readonly FieldSpec[];
  maxPhotos: number;
  letterMax: number;
  /** The five sticker moments, in the order they appear. */
  gifSlots: readonly string[];
  /** Propose + Valentine's ask yes/no: an "answered" reaction emails the owner. */
  asksQuestion: boolean;
}

/** Shared caps for the common (non-extras) fields. Server caps are the hard ones. */
export const VW_LIMITS = {
  name: 30,
  petName: 24,
  endLine: 90,
  gifUrl: 600,
  password: 128,
  maxNoDodges: 999,
  maxCount: 9999,
} as const;

const RUNAWAY_LINES = 28;

export const VALENTINE_DAYS: Record<ValentineDaySlug, ValentineDayConfig> = {
  // ── 7 Feb ── hold to bloom, pluck to love ──────────────────────────────────
  "happy-rose-day": {
    title: "Ek Gulaab, Sirf Tumhare Liye",
    maxPhotos: 9,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["r1-arrival", "r2-loves-me", "r3-letter", "r4-bouquet", "r5-ending"],
    extras: [
      { key: "roseColor", kind: "enum", options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"], default: "red" },
      { key: "colorReason", kind: "text", max: 90 },
      { key: "roseCount", kind: "enum", options: ["1", "3", "7", "9", "11", "12", "99"], default: "1" },
      { key: "openingLine", kind: "text", max: 70 },
      { key: "petalStyle", kind: "enum", options: ["classic", "desi", "french"], default: "classic" },
      { key: "shayari", kind: "longtext", max: 160 },
      { key: "signOff", kind: "text", max: 30 },
    ],
  },

  // ── 8 Feb ── open the box, scratch the question, catch the No ──────────────
  "happy-propose-day": {
    title: "The Little Velvet Box",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    gifSlots: ["p1-nervous", "p2-ring", "p3-kneel", "p4-please", "p5-yes"],
    extras: [
      { key: "question", kind: "text", max: 60 },
      { key: "teaser", kind: "text", max: 70 },
      { key: "reasons", kind: "list", maxItems: 3, itemMax: 80 },
      {
        key: "moments",
        kind: "objlist",
        maxItems: 6,
        item: [
          { key: "when", kind: "text", max: 20 },
          { key: "what", kind: "text", max: 50 },
        ],
      },
      { key: "ringStyle", kind: "enum", options: ["solitaire", "heart", "band"], default: "solitaire" },
      { key: "stoneColor", kind: "enum", options: ["diamond", "ruby", "rosegold"], default: "diamond" },
      { key: "noMode", kind: "enum", options: ["both", "run", "shrink"], default: "both" },
      { key: "noLines", kind: "list", maxItems: 5, itemMax: RUNAWAY_LINES },
      { key: "afterYes", kind: "text", max: 120 },
      { key: "shayari", kind: "longtext", max: 160 },
    ],
  },

  // ── 9 Feb ── a box of foil-wrapped reasons ─────────────────────────────────
  "happy-chocolate-day": {
    title: "Ek Dabba Pyaar",
    maxPhotos: 8,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["c1-box", "c2-gooey", "c3-letter", "c4-photos", "c5-yes"],
    extras: [
      { key: "giftTag", kind: "text", max: 80 },
      { key: "boxSize", kind: "enum", options: ["9", "6"], default: "9" },
      { key: "reasons", kind: "list", maxItems: 9, minItems: 6, itemMax: 90 },
      { key: "finalAsk", kind: "text", max: 60 },
    ],
  },

  // ── 10 Feb ── a claw machine rigged to win their teddy ─────────────────────
  "happy-teddy-day": {
    title: "Teddy Catcher",
    maxPhotos: 8,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["t1-play", "t2-win", "t3-letter", "t4-photos", "t5-sleep"],
    extras: [
      { key: "teddyName", kind: "text", max: 20 },
      { key: "furColor", kind: "enum", options: ["honey", "cocoa", "pink", "white", "lilac"], default: "honey" },
      { key: "marquee", kind: "text", max: 40 },
      { key: "nearMiss", kind: "bool", default: true },
      {
        key: "outfit",
        kind: "objlist",
        maxItems: 4,
        item: [
          { key: "item", kind: "enum", options: ["bow", "sweater", "crown", "glasses", "scarf", "flower", "cap", "bowtie"], default: "bow" },
          { key: "note", kind: "text", max: 60 },
        ],
      },
      { key: "winLine", kind: "text", max: 60 },
      { key: "squeezeLines", kind: "list", maxItems: 5, itemMax: 70 },
    ],
  },

  // ── 11 Feb ── pinky swear, a jar of promises, a signed Vachan Patra ────────
  "happy-promise-day": {
    title: "Vaada Pakka",
    maxPhotos: 8,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["pr1-envelope", "pr2-pinky", "pr3-jar", "pr4-stamp", "pr5-lock"],
    extras: [
      { key: "envelopeLine", kind: "text", max: 60 },
      { key: "pinkyPrompt", kind: "text", max: 50 },
      { key: "promises", kind: "list", maxItems: 7, minItems: 3, itemMax: 90 },
      { key: "bigPromise", kind: "longtext", max: 140 },
      { key: "lockEngraving", kind: "text", max: 20 },
      { key: "lockStyle", kind: "enum", options: ["gold", "silver", "rosegold"], default: "gold" },
      { key: "lockFinale", kind: "bool", default: true },
    ],
  },

  // ── 12 Feb ── the Jaadu Ki Jhappi café ─────────────────────────────────────
  "happy-hug-day": {
    title: "Jaadu Ki Jhappi Café",
    maxPhotos: 9,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["h1-welcome", "h2-hug", "h3-cosy", "h4-far", "h5-coupon"],
    extras: [
      { key: "cafeSign", kind: "text", max: 40 },
      { key: "squishPrompt", kind: "text", max: 40 },
      { key: "characters", kind: "enum", options: ["bear-bunny", "bear-bear", "cat-cat", "panda-bear"], default: "bear-bunny" },
      { key: "tagMe", kind: "text", max: 12 },
      { key: "tagYou", kind: "text", max: 12 },
      {
        key: "menu",
        kind: "objlist",
        maxItems: 6,
        minItems: 4,
        item: [
          { key: "name", kind: "text", max: 24 },
          { key: "line", kind: "text", max: 70 },
          { key: "price", kind: "text", max: 20 },
        ],
      },
      {
        key: "coupons",
        kind: "objlist",
        maxItems: 6,
        minItems: 3,
        item: [
          { key: "title", kind: "text", max: 30 },
          { key: "detail", kind: "text", max: 80 },
        ],
      },
    ],
  },

  // ── 13 Feb ── fill the kiss jar (family-safe by default) ───────────────────
  "happy-kiss-day": {
    title: "Sealed With a Kiss",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["k1-shy", "k2-cheer", "k3-mwah", "k4-cheek", "k5-blow"],
    extras: [
      { key: "kissStyle", kind: "enum", options: ["cute", "lipstick"], default: "cute" },
      { key: "lipShade", kind: "enum", options: ["ruby", "gulabi", "berry"], default: "ruby" },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "kissTarget", kind: "number", min: 5, max: 30, default: 14 },
      { key: "kissNotes", kind: "list", maxItems: 5, itemMax: 60 },
      { key: "coupons", kind: "list", maxItems: 4, itemMax: 50 },
      { key: "kissBackText", kind: "text", max: 80 },
    ],
  },

  // ── 14 Feb ── the finale: ticket, lanterns, the forever question ───────────
  "happy-valentines-day": {
    title: "Our Valentine Night",
    maxPhotos: 9,
    letterMax: 2000,
    asksQuestion: true,
    gifSlots: ["v1-invite", "v2-wrapped", "v3-gift", "v4-please", "v5-forever"],
    extras: [
      { key: "ticketLine", kind: "text", max: 50 },
      /** Seven lines, in order Rose → Kiss (index 0 = Rose Day). */
      { key: "weekLines", kind: "list", maxItems: 7, itemMax: 70 },
      /** YYYY-MM-DD or "" (the together-timer hides). */
      { key: "togetherSince", kind: "text", max: 10 },
      {
        key: "stats",
        kind: "objlist",
        maxItems: 5,
        item: [
          { key: "label", kind: "text", max: 30 },
          { key: "value", kind: "text", max: 24 },
        ],
      },
      { key: "metPlace", kind: "text", max: 40 },
      { key: "question", kind: "text", max: 60 },
      { key: "noLines", kind: "list", maxItems: 10, itemMax: 40 },
      { key: "datePlan", kind: "text", max: 80 },
      { key: "ps", kind: "text", max: 100 },
    ],
  },
};

// ─── Sanitising ──────────────────────────────────────────────────────────────

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** One leaf. Never returns undefined: a missing value becomes the spec's default. */
function sanitizeLeaf(spec: LeafSpec, raw: unknown): string | number | boolean {
  switch (spec.kind) {
    case "text":
    case "longtext":
      return clip(raw, spec.max);
    case "enum": {
      const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
      if (spec.options.includes(s)) return s;
      return spec.default && spec.options.includes(spec.default) ? spec.default : spec.options[0];
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
      const fallback = spec.default ?? spec.min;
      if (!Number.isFinite(n)) return fallback;
      return Math.min(spec.max, Math.max(spec.min, Math.round(n)));
    }
    case "bool":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return spec.default ?? false;
  }
}

/** Upper bound on how many raw array entries are even looked at. */
const RAW_SCAN = 40;

function sanitizeField(spec: FieldSpec, raw: unknown): unknown {
  if (spec.kind === "list") {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw.slice(0, RAW_SCAN)) {
      const s = clip(item, spec.itemMax);
      if (s) out.push(s);
      if (out.length >= spec.maxItems) break;
    }
    return out;
  }
  if (spec.kind === "objlist") {
    if (!Array.isArray(raw)) return [];
    const out: Record<string, unknown>[] = [];
    const hasText = spec.item.some((l) => l.kind === "text" || l.kind === "longtext");
    for (const item of raw.slice(0, RAW_SCAN)) {
      const src = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : {};
      const o: Record<string, unknown> = {};
      for (const leaf of spec.item) o[leaf.key] = sanitizeLeaf(leaf, src[leaf.key]);
      // A row whose every text leaf is blank is an empty "+ add" the sender never filled.
      if (hasText && !spec.item.some((l) => (l.kind === "text" || l.kind === "longtext") && o[l.key])) continue;
      out.push(o);
      if (out.length >= spec.maxItems) break;
    }
    return out;
  }
  return sanitizeLeaf(spec, raw);
}

/**
 * The day-specific fields, allow-listed by the day's spec. Unknown keys are
 * dropped, every string is trimmed and capped, enums fall back to their default,
 * numbers are clamped. Always returns every key of the spec.
 */
export function sanitizeExtras(slug: ValentineDaySlug, raw: unknown): Record<string, unknown> {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const spec of VALENTINE_DAYS[slug].extras) out[spec.key] = sanitizeField(spec, src[spec.key]);
  return out;
}

/**
 * GIF slots: `slotId → "" | "none" | https URL`. "" means the template's own
 * sticker (CDN default, then an animated emoji); "none" hides the slot. Unknown
 * slot ids are dropped and anything that is not https becomes "".
 */
export function sanitizeGifSlots(slug: ValentineDaySlug, raw: unknown): Record<string, string> {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const id of VALENTINE_DAYS[slug].gifSlots) {
    const v = typeof src[id] === "string" ? (src[id] as string).trim() : "";
    if (v === "none") out[id] = "none";
    else if (/^https:\/\/\S+$/i.test(v) && v.length <= VW_LIMITS.gifUrl) out[id] = v;
    else out[id] = "";
  }
  return out;
}

// ─── Reactions ───────────────────────────────────────────────────────────────

export type ReactionEvent = "opened" | "completed" | "answered";
export const REACTION_EVENTS: readonly ReactionEvent[] = ["opened", "completed", "answered"];

const clampInt = (v: unknown, max: number): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : undefined;
};

/**
 * The single atomic write for one reaction — exported so the idempotency rule
 * is unit-testable without a database.
 *
 * Each event is first-wins: the filter only matches while its timestamp is
 * still unset, so a replay, a second tab or a forwarded link can never move
 * `openedAt`, overwrite an answer, or trigger a second email. `matched` on the
 * update result is the "this was the first time" signal.
 */
export function reactionWrite(
  event: ReactionEvent,
  extra: { noDodges?: unknown; count?: unknown },
  now: Date
): { guard: Record<string, null>; set: Record<string, unknown> } {
  const set: Record<string, unknown> = {};
  const noDodges = clampInt(extra.noDodges, VW_LIMITS.maxNoDodges);
  const count = clampInt(extra.count, VW_LIMITS.maxCount);
  if (event === "opened") {
    set["reactions.openedAt"] = now;
    return { guard: { "reactions.openedAt": null }, set };
  }
  if (event === "completed") {
    set["reactions.completedAt"] = now;
    if (count !== undefined) set["reactions.count"] = count;
    return { guard: { "reactions.completedAt": null }, set };
  }
  set["reactions.answer"] = "yes";
  set["reactions.answeredAt"] = now;
  if (noDodges !== undefined) set["reactions.noDodges"] = noDodges;
  if (count !== undefined) set["reactions.count"] = count;
  return { guard: { "reactions.answer": null }, set };
}
