// ─── Reception Night: the fields added by the light ballroom rebuild ─────────
//
// The model (models/ReceptionPage.ts) is strict and flat, so every field the
// client sends must be named here or it is silently dropped. Everything is
// optional: a page saved before these existed has none of them, still loads,
// and the client derives what it needs (event 0 from receptionDate / venue).
//
// Every value is coerced and clamped here, before it reaches Mongoose, so a
// long string or a stray type never turns a save into a 500.

/** The keys this rebuild adds, in addition to the original reception fields. */
export const RECEPTION_EXTRA_FIELDS = [
  "events",
  "story",
  "contacts",
  "things",
  "music",
  "theme",
  "lang",
  "invitation",
  "hindiMessage",
  "blessingsOf",
  "hashtag",
  "closingLine",
  "gettingThere",
  "videoUrl",
  "liveUrl",
  "upiId",
  "upiName",
  "rsvpBy",
  "maxGuests",
  "rsvpMeal",
] as const;

export const RECEPTION_LIMITS = { events: 4, story: 4, contacts: 4, things: 6, gallery: 24 } as const;

/** The id of the one event an older page (no `events`) implicitly has. */
export const LEGACY_EVENT_ID = "reception";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};
const pick = <T>(v: unknown, max: number, map: (o: Obj, i: number) => T): T[] =>
  (Array.isArray(v) ? v : []).filter(isObj).slice(0, max).map(map);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const YT_RE = /^[A-Za-z0-9_-]{11}$/;
const https = (v: unknown, max: number) => {
  const s = str(v, max);
  return /^https:\/\/[^\s]+$/i.test(s) ? s : "";
};

/** A stable short id: kept when sent, else derived from the position (never from the title). */
const eventId = (v: unknown, i: number) => {
  const s = str(v, 40).replace(/[^a-z0-9_-]/gi, "");
  return s || (i === 0 ? LEGACY_EVENT_ID : `e${i + 1}`);
};

export function sanitizeReceptionEvents(v: unknown) {
  const seen = new Set<string>();
  return pick(v, RECEPTION_LIMITS.events, (o, i) => {
    let id = eventId(o.id, i);
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const date = str(o.date, 10);
    const time = str(o.time, 5);
    const endTime = str(o.endTime, 5);
    const color = str(o.dressColor, 7);
    return {
      id,
      title: str(o.title, 60),
      date: DATE_RE.test(date) ? date : "",
      time: TIME_RE.test(time) ? time : "",
      endTime: TIME_RE.test(endTime) ? endTime : "",
      venue: str(o.venue, 120),
      address: str(o.address, 200),
      mapUrl: https(o.mapUrl, 500),
      dressCode: str(o.dressCode, 80),
      dressColor: HEX_RE.test(color) ? color : "",
      note: str(o.note, 300),
    };
  }).filter((e) => e.title || e.venue || e.date);
}

/**
 * The cleaned subset of `body` for the extra fields. Only keys PRESENT in the
 * body are returned, so an update from an older client leaves them untouched.
 * Photos (story[].photo) may still be data URLs here: transformMediaPayload
 * uploads them afterwards.
 */
export function sanitizeReceptionExtras(body: unknown): Obj {
  const b = isObj(body) ? body : {};
  const out: Obj = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k) && b[k] !== undefined && b[k] !== null;

  if (has("events")) out.events = sanitizeReceptionEvents(b.events);
  if (has("story"))
    out.story = pick(b.story, RECEPTION_LIMITS.story, (o) => ({
      when: str(o.when, 40),
      title: str(o.title, 80),
      line: str(o.line, 400),
      photo: typeof o.photo === "string" ? o.photo : "",
    })).filter((c) => c.title || c.line);
  if (has("contacts"))
    out.contacts = pick(b.contacts, RECEPTION_LIMITS.contacts, (o) => ({
      name: str(o.name, 60),
      relation: str(o.relation, 60),
      phone: str(o.phone, 24).replace(/[^\d+ -]/g, ""),
    })).filter((c) => c.name && c.phone);
  if (has("things"))
    out.things = pick(b.things, RECEPTION_LIMITS.things, (o) => ({ head: str(o.head, 60), text: str(o.text, 300) })).filter((t) => t.text);
  if (has("music") && isObj(b.music)) {
    const m = b.music;
    const mode = str(m.mode, 10);
    const id = str(m.youtubeId, 11);
    out.music = {
      mode: ["youtube", "track", "off", "melody"].includes(mode) ? mode : "",
      youtubeId: YT_RE.test(id) ? id : "",
      start: num(m.start, 0, 600, 0),
    };
  }
  if (has("theme")) out.theme = str(b.theme, 20).replace(/[^a-z-]/gi, "");
  if (has("lang")) out.lang = b.lang === "hi" ? "hi" : "en";
  for (const [k, max] of [
    ["invitation", 1200],
    ["hindiMessage", 700],
    ["blessingsOf", 160],
    ["hashtag", 40],
    ["closingLine", 120],
    ["gettingThere", 600],
    ["upiName", 60],
  ] as const) {
    if (has(k)) out[k] = str(b[k], max);
  }
  if (has("videoUrl")) out.videoUrl = https(b.videoUrl, 300);
  if (has("liveUrl")) out.liveUrl = https(b.liveUrl, 500);
  if (has("upiId")) {
    const u = str(b.upiId, 120);
    out.upiId = /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/i.test(u) ? u : "";
  }
  if (has("rsvpBy")) {
    const d = str(b.rsvpBy, 10);
    out.rsvpBy = DATE_RE.test(d) ? d : "";
  }
  if (has("maxGuests")) out.maxGuests = num(b.maxGuests, 1, 10, 6);
  if (has("rsvpMeal")) out.rsvpMeal = b.rsvpMeal === true;
  return out;
}

/** Portrait framing + gallery fields: coerce the numbers the model stores. */
export function sanitizeReceptionPerson(v: unknown): unknown {
  if (!isObj(v)) return v;
  const out: Obj = { ...v };
  for (const k of ["cropX", "cropY"]) if (v[k] !== undefined) out[k] = num(v[k], 0, 100, 50);
  if (v.scale !== undefined) out.scale = num(v.scale, 100, 300, 100);
  return out;
}

export function sanitizeReceptionGallery(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .filter(isObj)
    .slice(0, RECEPTION_LIMITS.gallery)
    .map((g) => {
      const out: Obj = {
        src: typeof g.src === "string" ? g.src : "",
        alt: str(g.alt, 120),
        span: str(g.span, 40),
        category: str(g.category, 40),
      };
      if (g.caption !== undefined) out.caption = str(g.caption, 140);
      if (g.cropX !== undefined) out.cropX = num(g.cropX, 0, 100, 50);
      if (g.cropY !== undefined) out.cropY = num(g.cropY, 0, 100, 50);
      if (g.scale !== undefined) out.scale = num(g.scale, 100, 300, 100);
      if (g.w !== undefined) out.w = num(g.w, 1, 20000, 0) || undefined;
      if (g.h !== undefined) out.h = num(g.h, 1, 20000, 0) || undefined;
      return out;
    })
    .filter((g) => g.src);
}

// ── The RSVP side: a reception page seen as a wedding-kit guest page ─────────

interface ReceptionLike {
  _id: unknown;
  userId: unknown;
  shareId: string;
  brideName?: string;
  groomName?: string;
  events?: { id?: string; title?: string }[];
  rsvpMeal?: boolean;
  password?: string;
  comparePassword(candidate: string): Promise<boolean>;
}

/** The events RSVPs can name: the stored list, or the single implicit reception of an older page. */
export function receptionRsvpEvents(page: Pick<ReceptionLike, "events">): { id: string; title: string }[] {
  const list = (Array.isArray(page.events) ? page.events : [])
    .map((e) => ({ id: str(e?.id, 40), title: str(e?.title, 60) }))
    .filter((e) => e.id);
  return list.length ? list : [{ id: LEGACY_EVENT_ID, title: "Reception" }];
}

/** The shape weddingGuest.controller expects (recipientName / senderName / extras.events). */
export function receptionAsGuestPage<P extends ReceptionLike>(page: P | null) {
  if (!page) return null;
  return {
    _id: page._id,
    userId: page.userId,
    shareId: page.shareId,
    recipientName: page.brideName || "",
    senderName: page.groomName || "",
    extras: { events: receptionRsvpEvents(page), rsvpMeal: !!page.rsvpMeal },
    password: page.password || "",
    comparePassword: (c: string) => page.comparePassword(c),
  };
}
