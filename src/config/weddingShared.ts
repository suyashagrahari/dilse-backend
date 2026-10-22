// ─── Wedding kit (server): guest RSVPs + blessings, shared by the three tiers ─
//
// The Valentine engine's `react("answered")` is ONE first-wins slot per page —
// right for "will you be my Valentine?", wrong for an invitation one family
// forwards to two hundred guests. The wedding tiers therefore keep guests'
// answers in their own collections (models/WeddingRsvp, models/WeddingBlessing)
// and expose them through controllers/weddingGuest.controller.ts, which
// makeValentineDayRouter mounts for every slug in WEDDING_SLUGS:
//
//   public (no login; the page's password, when set, travels in the body / header)
//     POST /<slug>-pages/share/:shareId/rsvp                → { rsvpId, editToken, totals? }
//     PUT  /<slug>-pages/share/:shareId/rsvp/:rsvpId        (X-Rsvp-Token) edit my response
//     POST /<slug>-pages/share/:shareId/blessing
//     GET  /<slug>-pages/share/:shareId/blessings           approved only
//   owner (protect; their own page only)
//     GET   /<slug>-pages/:id/guests                        RSVPs + totals + every blessing
//     GET   /<slug>-pages/:id/guests.csv                    RSVP export
//     PATCH /<slug>-pages/:id/blessings/:blessingId         { approved }
//
// Everything in this file is pure (no I/O) so it is unit-testable.

import { createHash, randomBytes } from "crypto";

/** Single source of truth for tier limits (scratchpad research/tiers.md). */
export const WEDDING_TIER_LIMITS = {
  "wedding-invitation": { events: 2, photos: 6, story: 0, faq: 0, icsAllEvents: false, rsvpPerEvent: false, blessings: false },
  "wedding-invitation-premium": { events: 5, photos: 20, story: 5, faq: 3, icsAllEvents: false, rsvpPerEvent: true, blessings: false },
  "royal-wedding-invitation": { events: 8, photos: 40, story: 8, faq: 6, icsAllEvents: true, rsvpPerEvent: true, blessings: true },
  // The four designs on Royal's limits (palace door, Mughal garden, pampas & peony, lotus temple).
  "palace-door-wedding-invitation": { events: 8, photos: 40, story: 8, faq: 6, icsAllEvents: true, rsvpPerEvent: true, blessings: true },
  "garden-wedding-invitation": { events: 8, photos: 40, story: 8, faq: 6, icsAllEvents: true, rsvpPerEvent: true, blessings: true },
  "floral-wedding-invitation": { events: 8, photos: 40, story: 8, faq: 6, icsAllEvents: true, rsvpPerEvent: true, blessings: true },
  "lotus-wedding-invitation": { events: 8, photos: 40, story: 8, faq: 6, icsAllEvents: true, rsvpPerEvent: true, blessings: true },
} as const;

export type WeddingSlug = keyof typeof WEDDING_TIER_LIMITS;
export const WEDDING_SLUGS = Object.keys(WEDDING_TIER_LIMITS) as WeddingSlug[];
export const isWeddingSlug = (slug: unknown): slug is WeddingSlug =>
  typeof slug === "string" && Object.prototype.hasOwnProperty.call(WEDDING_TIER_LIMITS, slug);

export const RSVP_LIMITS = {
  name: 60,
  phone: 20,
  message: 300,
  /** Party size per RSVP, the guest included. */
  minGuests: 1,
  maxGuests: 10,
  eventId: 40,
  /** Hard ceiling per page; beyond it the API answers 409 rather than dropping silently. */
  maxPerPage: 2000,
} as const;

export const BLESSING_LIMITS = { name: 60, message: 280, maxPerPage: 1000, publicPage: 200 } as const;

export const ATTENDING = ["yes", "no", "maybe"] as const;
export type Attending = (typeof ATTENDING)[number];
export const MEALS = ["veg", "nonveg", "jain"] as const;
export type Meal = (typeof MEALS)[number];

/** Field name of the invisible honeypot input the client renders. Bots fill it; people never see it. */
export const HONEYPOT_FIELD = "website";

// ── Text cleaning ───────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** One line: controls and CR/LF out, whitespace collapsed, capped. Keeps Devanagari and emoji. */
export const oneLine = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line: CRLF normalised, controls out, no more than one blank line in a row, capped. */
export const multiLine = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(CONTROL, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";

// ── Light profanity filter ──────────────────────────────────────────────────
// Deliberately small: the blessings wall is public on the couple's page, so the
// worst English and transliterated Hindi abuse is refused outright; anything
// subtler is what owner moderation (approve / hide) is for.
const BLOCKED = new Set([
  "fuck", "fucking", "fucker", "fuk", "shit", "bitch", "bastard", "asshole", "cunt", "slut", "whore",
  "madarchod", "behenchod", "bhenchod", "bhosdi", "bhosdike", "chutiya", "chutiye", "gaandu", "randi", "harami",
  "मादरचोद", "बहनचोद", "भोसड़ी", "चूतिया", "रंडी", "हरामी",
]);

/**
 * Whole words only (so "Kshitij" or "Scunthorpe" pass), plus words spelt out
 * letter by letter ("f u c k", "f.u.c.k") — the usual dodge.
 */
export function isProfane(s: string): boolean {
  const words = s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  if (words.some((w) => BLOCKED.has(w) || BLOCKED.has(w.replace(/(s|es|ing|er)$/, "")))) return true;
  let run = "";
  for (const w of [...words, ""]) {
    if (w.length === 1) run += w;
    else {
      if (run.length > 2 && BLOCKED.has(run)) return true;
      run = "";
    }
  }
  return false;
}

// ── RSVP ────────────────────────────────────────────────────────────────────

export interface RsvpInput {
  guestName: string;
  phone: string;
  attending: Attending;
  guests: number;
  events: string[];
  meal: Meal | null;
  message: string;
}

export interface RsvpContext {
  /** Event ids the page offers. Empty = the tier has no per-event RSVP (events are dropped). */
  eventIds: readonly string[];
  /** The tier/page asks for a meal preference. */
  mealEnabled: boolean;
}

export type CleanResult<T> = { ok: true; value: T; spam: boolean } | { ok: false; error: string };

const isHoneypotFilled = (b: Record<string, unknown>) => typeof b[HONEYPOT_FIELD] === "string" && (b[HONEYPOT_FIELD] as string).trim() !== "";
const bodyOf = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/**
 * Validate a guest's RSVP. `spam: true` when the honeypot is filled — the caller
 * answers success without storing anything, so a bot learns nothing.
 * `attending` also accepts a boolean (true → yes, false → no) for simple clients.
 */
export function cleanRsvp(raw: unknown, ctx: RsvpContext): CleanResult<RsvpInput> {
  const b = bodyOf(raw);
  const spam = isHoneypotFilled(b);
  const guestName = oneLine(b.guestName ?? b.name, RSVP_LIMITS.name);
  if (!guestName) return { ok: false, error: "Please add your name" };
  const att = b.attending === true ? "yes" : b.attending === false ? "no" : b.attending;
  if (typeof att !== "string" || !(ATTENDING as readonly string[]).includes(att)) {
    return { ok: false, error: "Let the family know if you can come" };
  }
  const attending = att as Attending;
  const n = Number(b.guests);
  const guests =
    attending === "no"
      ? 0
      : Math.min(RSVP_LIMITS.maxGuests, Math.max(RSVP_LIMITS.minGuests, Number.isFinite(n) ? Math.round(n) : 1));
  const allowed = new Set(ctx.eventIds);
  const events =
    attending === "no" || !Array.isArray(b.events)
      ? []
      : Array.from(
          new Set(
            b.events
              .slice(0, 40)
              .map((e) => oneLine(e, RSVP_LIMITS.eventId))
              .filter((e) => e && allowed.has(e)),
          ),
        );
  const meal =
    ctx.mealEnabled && attending !== "no" && typeof b.meal === "string" && (MEALS as readonly string[]).includes(b.meal)
      ? (b.meal as Meal)
      : null;
  const phone = oneLine(b.phone, RSVP_LIMITS.phone).replace(/[^\d+\-\s()]/g, "").trim();
  const message = multiLine(b.message, RSVP_LIMITS.message);
  if (message && isProfane(message)) return { ok: false, error: "Please keep the message kind — it goes straight to the couple" };
  return { ok: true, spam, value: { guestName, phone, attending, guests, events, meal, message } };
}

/** Event ids a page offers, read from the engine's `extras.events` ([{ id, … }]). */
export function eventIdsOf(extras: unknown, slug: string): string[] {
  if (!isWeddingSlug(slug) || !WEDDING_TIER_LIMITS[slug].rsvpPerEvent) return [];
  const list = bodyOf(extras).events;
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => oneLine(bodyOf(e).id, RSVP_LIMITS.eventId))
    .filter(Boolean)
    .slice(0, WEDDING_TIER_LIMITS[slug].events);
}

/** id → title, for emails and the CSV header. */
export function eventLabelsOf(extras: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const list = bodyOf(extras).events;
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    const o = bodyOf(e);
    const id = oneLine(o.id, RSVP_LIMITS.eventId);
    if (id) out[id] = oneLine(o.title ?? o.name, 60) || id;
  }
  return out;
}

// ── Blessings ───────────────────────────────────────────────────────────────

export interface BlessingInput {
  name: string;
  message: string;
}

export function cleanBlessing(raw: unknown): CleanResult<BlessingInput> {
  const b = bodyOf(raw);
  const spam = isHoneypotFilled(b);
  const name = oneLine(b.name, BLESSING_LIMITS.name);
  if (!name) return { ok: false, error: "Please add your name" };
  const message = multiLine(b.message, BLESSING_LIMITS.message);
  if (!message) return { ok: false, error: "Write a line for the couple" };
  if (isProfane(`${name} ${message}`)) return { ok: false, error: "Please keep it kind — this shows on the couple's page" };
  return { ok: true, spam, value: { name, message } };
}

// ── Totals ──────────────────────────────────────────────────────────────────

export interface RsvpTotals {
  responses: number;
  attending: number;
  maybe: number;
  declined: number;
  /** Heads confirmed (sum of `guests` over "yes"). */
  heads: number;
  /** Heads including "maybe" parties — the planning upper bound. */
  headsWithMaybe: number;
  /** eventId → confirmed heads ("yes" only). */
  perEvent: Record<string, number>;
  meals: Record<Meal, number>;
}

export function rsvpTotals(
  list: readonly Pick<RsvpInput, "attending" | "guests" | "events" | "meal">[] | null | undefined,
): RsvpTotals {
  const t: RsvpTotals = {
    responses: 0,
    attending: 0,
    maybe: 0,
    declined: 0,
    heads: 0,
    headsWithMaybe: 0,
    perEvent: {},
    meals: { veg: 0, nonveg: 0, jain: 0 },
  };
  for (const r of list ?? []) {
    t.responses++;
    const g = Math.max(0, Number(r.guests) || 0);
    if (r.attending === "yes") {
      t.attending++;
      t.heads += g;
      t.headsWithMaybe += g;
      for (const e of r.events ?? []) t.perEvent[e] = (t.perEvent[e] ?? 0) + g;
      if (r.meal && r.meal in t.meals) t.meals[r.meal] += g;
    } else if (r.attending === "maybe") {
      t.maybe++;
      t.headsWithMaybe += g;
    } else t.declined++;
  }
  return t;
}

// ── Email throttle ──────────────────────────────────────────────────────────

/** Above this many RSVPs in the trailing hour, the owner gets a digest instead of one mail each. */
export const RSVP_MAIL_BURST = 10;
export const HOUR_MS = 60 * 60_000;

export type MailPlan = "single" | "digest" | "hold";

/**
 * What to send for the RSVP that just landed.
 *  - ≤ RSVP_MAIL_BURST in the trailing hour (this one included): one email for it.
 *  - above that: one digest of every not-yet-emailed RSVP, at most once an hour;
 *    otherwise hold — the next RSVP after the hour (or the owner's dashboard) picks them up.
 */
export function mailPlan(o: { recentCount: number; lastDigestAt: Date | null; now: Date }): MailPlan {
  if (o.recentCount <= RSVP_MAIL_BURST) return "single";
  if (!o.lastDigestAt || o.now.getTime() - o.lastDigestAt.getTime() >= HOUR_MS) return "digest";
  return "hold";
}

// ── Tokens, hashing ─────────────────────────────────────────────────────────

/** Per-page IP hash: lets us spot floods without storing an address. */
export const ipHash = (ip: string | undefined, pageId: string): string =>
  createHash("sha256").update(`wedding:${pageId}:${ip || "?"}`).digest("hex").slice(0, 32);

export const newEditToken = (): string => randomBytes(18).toString("base64url");
export const tokenHash = (token: string): string => createHash("sha256").update(`rsvp:${token}`).digest("hex");

// ── CSV ─────────────────────────────────────────────────────────────────────

/** RFC 4180 cell, and formula-injection safe (a leading = + - @ is quoted with a '). */
const cell = (v: unknown): string => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function rsvpCsv(
  rows: readonly (RsvpInput & { createdAt: Date | string; updatedAt?: Date | string })[],
  eventLabels: Record<string, string>,
): string {
  const eventIds = Object.keys(eventLabels);
  const header = ["Name", "Phone", "Attending", "Guests", ...eventIds.map((id) => eventLabels[id]), "Meal", "Message", "Responded at"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    const at = r.updatedAt ?? r.createdAt;
    lines.push(
      [
        r.guestName,
        r.phone,
        r.attending,
        r.guests,
        ...eventIds.map((id) => (r.events.includes(id) ? "yes" : "")),
        r.meal ?? "",
        r.message,
        at instanceof Date ? at.toISOString() : String(at ?? ""),
      ]
        .map(cell)
        .join(","),
    );
  }
  // BOM so Excel opens Devanagari names correctly.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
