// ─── Christian Wedding (christian-wedding / christian-wedding-2): the fields ─
//
// The chapel-door rebuild (2026-10) added scripture, an order of service, a
// story, contacts, livestream, shagun, a song, a theme, RSVP settings and
// per-event map / dress code to a model that was strict and flat. Every one
// of them is OPTIONAL: pages published before the rebuild carry none of them
// and must keep rendering exactly as they did, so nothing here renames,
// retypes or removes a stored field.
//
// Everything in this file is pure (no I/O) so it is unit-testable; the
// controller runs each incoming body through `cleanChristianExtras` and
// `normalizeChristianEvents` before it reaches Mongoose.

import { randomBytes } from "crypto";

export const CW_LIMITS = {
  events: 8,
  story: 6,
  service: 10,
  contacts: 4,
  things: 6,
  gallery: 40,
} as const;

export const CW_THEMES = ["ivory", "rose", "sage"] as const;
export const CW_SECOND_LANGS = ["none", "hi", "ml", "ta"] as const;
export const CW_MUSIC_MODES = ["off", "melody", "youtube", "track"] as const;
export const CW_SIZES = ["normal", "wide", "tall", "large"] as const;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g;

/** One line: controls and line breaks out, whitespace collapsed, capped. */
export const line = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Multi-line: CRLF normalised, controls out, at most one blank line in a row, capped. */
export const text = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(CONTROL, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** https:// only (a javascript: or http: link never reaches a guest's tap). "" otherwise. */
export function httpsUrl(v: unknown, max = 400): string {
  const s = line(v, max);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** A photo reference: an uploaded https URL, a same-origin /wedding-v3 path, or a data: URL (uploaded by the media pipeline). */
export function photoRef(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (s.startsWith("data:image/")) return s;
  if (/^\/wedding-v3\/[\w./-]+\.(webp|jpe?g|png)$/i.test(s)) return s;
  return httpsUrl(s, 1000);
}

/** YouTube id (11 chars) from an id or any youtube link; "" otherwise. */
export function youTubeId(v: unknown): string {
  const s = line(v, 300);
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

/** "name@bank" — the shape UPI ids take; "" for anything else. */
export function upiId(v: unknown): string {
  const s = line(v, 60).replace(/\s+/g, "");
  return /^[a-zA-Z0-9._-]{2,40}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/.test(s) ? s : "";
}

/** Digits with an optional leading +, 8–15 digits. "" otherwise. */
export function phone(v: unknown): string {
  const s = line(v, 24);
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return s.trim().startsWith("+") ? `+${digits}` : digits;
}

export const isoDate = (v: unknown): string => {
  const s = line(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : "";
};

const hexColour = (v: unknown): string => {
  const s = line(v, 9);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : "";
};

/** A short stable id for a function (RSVPs refer to it). Never derived from the name. */
export const newEventId = () => `e${randomBytes(4).toString("hex").slice(0, 6)}`;

// ── Events ──────────────────────────────────────────────────────────────────

export interface ChristianEvent {
  id: string;
  name: string;
  hindi: string;
  icon: string;
  date: string;
  time: string;
  venue: string;
  details: string;
  accent: string;
  disabled: boolean;
  isoDate: string;
  address: string;
  mapUrl: string;
  dressCode: string;
  dressColor: string;
}

const DEFAULT_ACCENT = "from-amber-500/20 to-amber-600/5 border-amber-500/30";

export const DEFAULT_EVENTS: Omit<ChristianEvent, "id" | "isoDate" | "address" | "mapUrl" | "dressCode" | "dressColor">[] = [
  { name: "Rehearsal Dinner", hindi: "", icon: "🍽️", date: "", time: "6 PM", venue: "", details: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30", disabled: false },
  { name: "Ceremony", hindi: "", icon: "⛪", date: "", time: "4 PM", venue: "", details: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30", disabled: false },
  { name: "Reception", hindi: "", icon: "🥂", date: "", time: "7 PM", venue: "", details: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30", disabled: false },
  { name: "Brunch", hindi: "", icon: "☕", date: "", time: "10 AM", venue: "", details: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30", disabled: true },
  { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
  { name: "Reserved", hindi: "", icon: "📌", date: "", time: "", venue: "", details: "", accent: "from-slate-500/15 to-slate-600/5 border-slate-500/20", disabled: true },
];

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

export function timeToMinutes(time: string): number {
  const t = time.trim().toUpperCase();
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return Number(m24[1]) * 60 + Number(m24[2]);
  const m = t.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?$/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  if (!m[3]) h = Number(m[1]);
  return h * 60 + Number(m[2] || "0");
}

/** Sort key: ISO date when there is one, else the old free-text "21 Jul" read in the current year. */
export function eventEpoch(e: Pick<ChristianEvent, "isoDate" | "date" | "time">): number {
  const mins = timeToMinutes(e.time || "");
  const add = mins === Number.MAX_SAFE_INTEGER ? 0 : mins * 60_000;
  if (e.isoDate) {
    const t = Date.parse(`${e.isoDate}T00:00:00Z`);
    if (!Number.isNaN(t)) return t + add;
  }
  const parts = (e.date || "").trim().split(/\s+/);
  if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
  const day = Number(parts[0]);
  const mon = MONTHS[parts[1].toLowerCase()];
  if (!Number.isFinite(day) || mon === undefined) return Number.MAX_SAFE_INTEGER;
  return Date.UTC(new Date().getUTCFullYear(), mon, day) + add;
}

/**
 * The events array as the model stores it: every old field kept with its old
 * fallback, every new one cleaned, ids generated once for rows that lack one,
 * duplicates re-keyed, enabled rows first in date order.
 */
export function normalizeChristianEvents(input: unknown): ChristianEvent[] {
  const incoming = Array.isArray(input) ? input : DEFAULT_EVENTS;
  const taken = new Set<string>();
  const rows = incoming.slice(0, 12).map((raw, idx) => {
    const fallback = DEFAULT_EVENTS[idx] || DEFAULT_EVENTS[DEFAULT_EVENTS.length - 1];
    const src = obj(raw);
    let id = line(src.id, 40).replace(/[^\w-]/g, "");
    if (!id || taken.has(id)) {
      do id = newEventId();
      while (taken.has(id));
    }
    taken.add(id);
    return {
      id,
      name: line(src.name, 60) || fallback.name,
      hindi: line(src.hindi, 60) || fallback.hindi,
      icon: line(src.icon, 8) || fallback.icon,
      date: line(src.date, 30),
      time: typeof src.time === "string" ? line(src.time, 20) : fallback.time,
      venue: line(src.venue, 120),
      details: text(src.details, 600),
      accent: line(src.accent, 120) || fallback.accent || DEFAULT_ACCENT,
      disabled: Boolean(src.disabled),
      isoDate: isoDate(src.isoDate),
      address: line(src.address, 200),
      mapUrl: httpsUrl(src.mapUrl),
      dressCode: line(src.dressCode, 80),
      dressColor: hexColour(src.dressColor),
    };
  });
  return rows.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    const d = eventEpoch(a) - eventEpoch(b);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

// ── The rebuild's optional extras ───────────────────────────────────────────

export interface ChristianExtras {
  theme: string;
  invitation: string;
  scripture: { text: string; ref: string };
  secondLang: (typeof CW_SECOND_LANGS)[number];
  altInvitation: string;
  altVerse: string;
  couplePhoto: string;
  couplePhotoCrop: { x: number; y: number; scale: number };
  story: { when: string; title: string; line: string; photo: string; cropX: number; cropY: number; scale: number }[];
  orderOfService: { time: string; title: string; note: string }[];
  videoUrl: string;
  contacts: { name: string; relation: string; phone: string }[];
  liveUrl: string;
  upiId: string;
  upiName: string;
  music: { mode: string; youtubeId: string; start: number };
  rsvpOn: boolean;
  rsvpBy: string;
  rsvpMeal: boolean;
  maxGuests: number;
  things: { head: string; text: string }[];
  gettingThere: string;
  hashtag: string;
  closingLine: string;
  blessingsOf: string;
  churchName: string;
}

/** Every extras key the controller copies from a body (create and update). */
export const CW_EXTRA_KEYS: readonly (keyof ChristianExtras)[] = [
  "theme", "invitation", "scripture", "secondLang", "altInvitation", "altVerse", "couplePhoto", "couplePhotoCrop",
  "story", "orderOfService", "videoUrl", "contacts", "liveUrl", "upiId", "upiName", "music", "rsvpOn", "rsvpBy",
  "rsvpMeal", "maxGuests", "things", "gettingThere", "hashtag", "closingLine", "blessingsOf", "churchName",
];

const crop = (v: unknown) => {
  const o = obj(v);
  return { x: num(o.x, 0, 100, 50), y: num(o.y, 0, 100, 50), scale: num(o.scale, 100, 300, 100) };
};

/**
 * Clean the keys of `body` that are present (an update sends only what it
 * changes; a missing key is left alone, never blanked).
 */
export function cleanChristianExtras(body: Record<string, unknown>): Partial<ChristianExtras> {
  const out: Partial<ChristianExtras> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;

  if (has("theme")) out.theme = typeof body.theme === "string" && (CW_THEMES as readonly string[]).includes(body.theme) ? body.theme : "";
  if (has("invitation")) out.invitation = text(body.invitation, 1200);
  if (has("scripture")) {
    const s = obj(body.scripture);
    out.scripture = { text: text(s.text, 420), ref: line(s.ref, 60) };
  }
  if (has("secondLang")) out.secondLang = oneOf(body.secondLang, CW_SECOND_LANGS, "none");
  if (has("altInvitation")) out.altInvitation = text(body.altInvitation, 900);
  if (has("altVerse")) out.altVerse = text(body.altVerse, 420);
  if (has("couplePhoto")) out.couplePhoto = photoRef(body.couplePhoto);
  if (has("couplePhotoCrop")) out.couplePhotoCrop = crop(body.couplePhotoCrop);
  if (has("story")) {
    out.story = arr(body.story)
      .slice(0, CW_LIMITS.story)
      .map((r) => {
        const o = obj(r);
        const c = crop({ x: o.cropX, y: o.cropY, scale: o.scale });
        return { when: line(o.when, 40), title: line(o.title, 60), line: text(o.line, 300), photo: photoRef(o.photo), cropX: c.x, cropY: c.y, scale: c.scale };
      })
      .filter((r) => r.title || r.line || r.photo);
  }
  if (has("orderOfService")) {
    out.orderOfService = arr(body.orderOfService)
      .slice(0, CW_LIMITS.service)
      .map((r) => {
        const o = obj(r);
        return { time: line(o.time, 12), title: line(o.title, 60), note: line(o.note, 140) };
      })
      .filter((r) => r.title);
  }
  if (has("videoUrl")) {
    const id = youTubeId(body.videoUrl);
    out.videoUrl = id ? `https://www.youtube.com/watch?v=${id}` : "";
  }
  if (has("contacts")) {
    out.contacts = arr(body.contacts)
      .slice(0, CW_LIMITS.contacts)
      .map((r) => {
        const o = obj(r);
        return { name: line(o.name, 40), relation: line(o.relation, 40), phone: phone(o.phone) };
      })
      .filter((r) => r.name && r.phone);
  }
  if (has("liveUrl")) out.liveUrl = httpsUrl(body.liveUrl);
  if (has("upiId")) out.upiId = upiId(body.upiId);
  if (has("upiName")) out.upiName = line(body.upiName, 60);
  if (has("music")) {
    const m = obj(body.music);
    const id = youTubeId(m.youtubeId);
    const mode = oneOf(m.mode, CW_MUSIC_MODES, "track");
    out.music = { mode: mode === "youtube" && !id ? "track" : mode, youtubeId: id, start: Math.round(num(m.start, 0, 600, 0)) };
  }
  if (has("rsvpOn")) out.rsvpOn = Boolean(body.rsvpOn);
  if (has("rsvpBy")) out.rsvpBy = isoDate(body.rsvpBy);
  if (has("rsvpMeal")) out.rsvpMeal = Boolean(body.rsvpMeal);
  if (has("maxGuests")) out.maxGuests = Math.round(num(body.maxGuests, 1, 10, 4));
  if (has("things")) {
    out.things = arr(body.things)
      .slice(0, CW_LIMITS.things)
      .map((r) => {
        const o = obj(r);
        return { head: line(o.head, 40), text: text(o.text, 300) };
      })
      .filter((r) => r.text);
  }
  if (has("gettingThere")) out.gettingThere = text(body.gettingThere, 600);
  if (has("hashtag")) out.hashtag = line(body.hashtag, 40).replace(/\s+/g, "");
  if (has("closingLine")) out.closingLine = line(body.closingLine, 120);
  if (has("blessingsOf")) out.blessingsOf = line(body.blessingsOf, 160);
  if (has("churchName")) out.churchName = line(body.churchName, 120);
  return out;
}

/** Gallery rows: the old {src, alt} plus the masonry's crop / size / natural size. */
export function cleanGallery(input: unknown): { src: string; alt: string; cropX: number; cropY: number; scale: number; size: string; w: number; h: number }[] {
  return arr(input)
    .slice(0, CW_LIMITS.gallery)
    .map((r) => {
      const o = obj(r);
      return {
        src: photoRef(o.src),
        alt: line(o.alt, 140),
        cropX: num(o.cropX, 0, 100, 50),
        cropY: num(o.cropY, 0, 100, 50),
        scale: num(o.scale, 100, 300, 100),
        size: oneOf(o.size, CW_SIZES, "normal"),
        w: Math.round(num(o.w, 0, 20000, 0)),
        h: Math.round(num(o.h, 0, 20000, 0)),
      };
    })
    .filter((g) => g.src);
}

/**
 * What the shared wedding-guest controller needs to know about one page:
 * the bride/groom as the couple, and the enabled events as RSVP targets.
 */
export function guestExtrasOf(page: { events?: unknown; rsvpMeal?: unknown }): { events: { id: string; title: string }[]; rsvpMeal: boolean } {
  return {
    events: arr(page.events)
      .map(obj)
      .filter((e) => !e.disabled && typeof e.id === "string" && e.id)
      .map((e) => ({ id: String(e.id), title: line(e.name, 60) })),
    rsvpMeal: Boolean(page.rsvpMeal),
  };
}
