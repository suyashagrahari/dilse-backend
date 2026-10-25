// ─── Animated Shaadi Card (/shaadi-card-pages): the stored shape, cleaned ────
//
// The 2026-10 rebuild (marigold khidki opening, EN/HI, countdown, story, film,
// per-function RSVP, contacts, shagun, livestream) added fields to a page
// shape that has been published since 2025. The rules here keep both alive:
//
//   * Nothing old is renamed, removed or retyped. Every new field is optional
//     and has a default, so an old document reads exactly as it did.
//   * Events keep their display strings (`date` "13 Apr", `time` "10 AM") and
//     gain `isoDate` / `startTime` (what the new editor writes). The display
//     strings are derived from the ISO values on save, so the old sort and
//     anything else that reads them keeps working.
//   * Each event gets a stable `id` (RSVPs refer to it). Old events have none;
//     they are given `e<index>` in stored order, the same rule the client uses
//     when it reads such a page, so a guest's RSVP from an old page and the
//     owner's dashboard agree.
//
// Pure functions only (no Mongo), so the unit tests run without a database.

export const SHAADI_LIMITS = {
  events: 8,
  photos: 16,
  story: 4,
  things: 6,
  contacts: 4,
} as const;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** One line of text: controls out, trimmed, capped. */
export const line = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(CONTROL, "").trim().slice(0, max) : "";

/** Multi-line text: CRLF normalised, controls out, capped. */
export const para = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isoDateOf = (v: unknown): string => {
  const s = line(v, 10);
  if (!ISO_DATE.test(s)) return "";
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
};
export const hhmmOf = (v: unknown): string => {
  const s = line(v, 5);
  return HHMM.test(s) ? s : "";
};

/** https only (data: and javascript: never get through). */
export const httpsUrl = (v: unknown, max = 500): string => {
  const s = line(v, max);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export const youtubeId = (v: unknown): string => {
  const s = line(v, 20);
  return YT_ID.test(s) ? s : "";
};

/** A YouTube watch / share / embed link → the link itself, else "". */
export const youtubeUrl = (v: unknown): string => {
  const u = httpsUrl(v, 300);
  if (!u) return "";
  return /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(u) ? u : "";
};

export const upiIdOf = (v: unknown): string => {
  const s = line(v, 60);
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(s) ? s : "";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-02-18" → "18 Feb" (the old display form, which the old sort reads). */
export const displayDate = (iso: string): string => {
  if (!ISO_DATE.test(iso)) return "";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
/** "19:30" → "7:30 PM", "10:00" → "10 AM". */
export const displayTime = (hhmm: string): string => {
  if (!HHMM.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "PM" : "AM"}`;
};

// ── Events ──────────────────────────────────────────────────────────────────

export interface ShaadiEvent {
  name: string;
  hindi: string;
  icon: string;
  date: string;
  time: string;
  venue: string;
  details: string;
  accent: string;
  disabled: boolean;
  // ── 2026-10 (optional) ──
  id: string;
  isoDate: string;
  startTime: string;
  endTime: string;
  address: string;
  mapUrl: string;
  dressCode: string;
  dressColor: string;
}

export const DEFAULT_EVENTS: Omit<ShaadiEvent, "id" | "isoDate" | "startTime" | "endTime" | "address" | "mapUrl" | "dressCode" | "dressColor">[] = [
  { name: "Haldi", hindi: "हल्दी", icon: "🌿", date: "", time: "10 AM", venue: "", details: "", accent: "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30", disabled: false },
  { name: "Mehendi", hindi: "मेहंदी", icon: "🌸", date: "", time: "6 PM", venue: "", details: "", accent: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/30", disabled: false },
  { name: "Sangeet", hindi: "संगीत", icon: "🎶", date: "", time: "7 PM", venue: "", details: "", accent: "from-violet-500/20 to-violet-600/5 border-violet-500/30", disabled: false },
  { name: "Baraat", hindi: "बारात", icon: "🐴", date: "", time: "9 AM", venue: "", details: "", accent: "from-rose-500/20 to-rose-500/5 border-rose-500/30", disabled: false },
  { name: "Wedding", hindi: "विवाह", icon: "🔥", date: "", time: "11 AM", venue: "", details: "", accent: "from-amber-500/20 to-amber-500/5 border-amber-500/30", disabled: false },
  { name: "Reception", hindi: "स्वागत", icon: "💃", date: "", time: "7 PM", venue: "", details: "", accent: "from-blue-500/20 to-blue-500/5 border-blue-500/30", disabled: false },
];

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const timeToMinutes = (time: string): number => {
  const cleaned = time.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  if (!match[3]) hour = Number(match[1]);
  return hour * 60 + Number(match[2] || "0");
};

/** Sort key: ISO values when present, else the old "13 Apr" + "10 AM" strings (this year). */
export const eventEpoch = (e: Pick<ShaadiEvent, "isoDate" | "startTime" | "date" | "time">): number => {
  if (e.isoDate) {
    const t = Date.parse(`${e.isoDate}T${e.startTime || "00:00"}:00+05:30`);
    if (!Number.isNaN(t)) return t;
  }
  const parts = (e.date || "").trim().split(/\s+/);
  if (parts.length < 2) return Number.MAX_SAFE_INTEGER;
  const day = Number(parts[0]);
  const monthIdx = MONTH_MAP[parts[1].toLowerCase()];
  if (!Number.isFinite(day) || monthIdx === undefined) return Number.MAX_SAFE_INTEGER;
  const d = new Date(new Date().getFullYear(), monthIdx, day);
  d.setHours(0, 0, 0, 0);
  const mins = timeToMinutes(e.time || "");
  d.setMinutes(mins === Number.MAX_SAFE_INTEGER ? 0 : mins);
  return d.getTime();
};

const EVENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/** Clean, id and sort the events a client sent (or the defaults when it sent none). */
export function normalizeEvents(input: unknown): ShaadiEvent[] {
  const incoming = Array.isArray(input) ? input.slice(0, SHAADI_LIMITS.events) : DEFAULT_EVENTS;
  const taken = new Set<string>();
  const out = incoming.map((raw, idx): ShaadiEvent => {
    const fb = DEFAULT_EVENTS[Math.min(idx, DEFAULT_EVENTS.length - 1)];
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const isoDate = isoDateOf(src.isoDate);
    const startTime = hhmmOf(src.startTime);
    let id = line(src.id, 40);
    if (!EVENT_ID.test(id) || taken.has(id)) id = "";
    if (!id) {
      let k = idx;
      while (taken.has(`e${k}`)) k++;
      id = `e${k}`;
    }
    taken.add(id);
    return {
      name: line(src.name, 40) || fb.name,
      hindi: line(src.hindi, 40),
      icon: line(src.icon, 8) || fb.icon,
      // The new editor sends ISO values; the old display strings follow them.
      date: isoDate ? displayDate(isoDate) : line(src.date, 30),
      time: startTime ? displayTime(startTime) : line(src.time, 30) || fb.time,
      venue: line(src.venue, 100),
      details: para(src.details, 400),
      accent: line(src.accent, 120) || fb.accent,
      disabled: Boolean(src.disabled),
      id,
      isoDate,
      startTime,
      endTime: hhmmOf(src.endTime),
      address: line(src.address, 160),
      mapUrl: httpsUrl(src.mapUrl, 400),
      dressCode: line(src.dressCode, 60),
      dressColor: /^#[0-9a-f]{6}$/i.test(line(src.dressColor, 7)) ? line(src.dressColor, 7) : "",
    };
  });
  return out.sort((a, b) => {
    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
    const d = eventEpoch(a) - eventEpoch(b);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}

// ── Gallery, story, contacts, things ───────────────────────────────────────

const SPANS = new Set(["normal", "wide", "tall", "large"]);

export function normalizeGallery(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, SHAADI_LIMITS.photos)
    .map((raw) => {
      const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const src = typeof g.src === "string" ? g.src.trim() : "";
      if (!src) return null;
      const out: Record<string, unknown> = { src, alt: line(g.alt, 80) };
      if (g.cropX !== undefined) out.cropX = num(g.cropX, 0, 100, 50);
      if (g.cropY !== undefined) out.cropY = num(g.cropY, 0, 100, 50);
      if (g.scale !== undefined) out.scale = num(g.scale, 100, 300, 100);
      const span = line(g.span, 10);
      if (SPANS.has(span)) out.span = span;
      if (g.w !== undefined) out.w = num(g.w, 1, 20000, 0);
      if (g.h !== undefined) out.h = num(g.h, 1, 20000, 0);
      const caption = line(g.caption, 120);
      if (caption) out.caption = caption;
      return out;
    })
    .filter((g): g is Record<string, unknown> => g !== null);
}

export function normalizeStory(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, SHAADI_LIMITS.story)
    .map((raw) => {
      const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return {
        when: line(c.when, 30),
        title: line(c.title, 80),
        line: para(c.line, 320),
        photo: typeof c.photo === "string" ? c.photo.trim() : "",
        cropX: num(c.cropX, 0, 100, 50),
        cropY: num(c.cropY, 0, 100, 50),
        scale: num(c.scale, 100, 300, 100),
      };
    })
    .filter((c) => c.title || c.line || c.photo);
}

/** Indian mobile → "919876543210" (for tel:/wa.me), "" when it is not one. */
export const dialOf = (v: unknown): string => {
  const d = line(v, 24).replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? `91${ten}` : "";
};

export function normalizeContacts(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, SHAADI_LIMITS.contacts)
    .map((raw) => {
      const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      return { name: line(c.name, 40), relation: line(c.relation, 40), phone: line(c.phone, 20) };
    })
    .filter((c) => c.name && dialOf(c.phone));
}

export const normalizeThings = (input: unknown): string[] =>
  Array.isArray(input) ? input.map((t) => line(t, 240)).filter(Boolean).slice(0, SHAADI_LIMITS.things) : [];

const crop = (v: unknown) => {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { x: num(c.x, 0, 100, 50), y: num(c.y, 0, 100, 40), scale: num(c.scale, 100, 300, 100) };
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;

export const SHAADI_THEMES = ["marigold", "haldi", "rani", "mehendi"] as const;
export const MUSIC_MODES = ["", "off", "melody", "youtube", "track"] as const;

/**
 * The 2026-10 fields, cleaned. Only keys present in `body` are returned, so an
 * update that does not mention a field leaves it as it is.
 */
export function cleanNewFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k) && body[k] !== undefined;
  const text: [string, number][] = [
    ["lang", 2], ["muhurat", 80], ["blessingsOf", 160], ["hashtag", 40], ["closingLine", 120], ["upiName", 60], ["rsvpBy", 10],
  ];
  for (const [k, max] of text) if (has(k)) out[k] = line(body[k], max);
  if (has("lang")) out.lang = oneOf(body.lang, ["en", "hi"] as const, "en");
  if (has("rsvpBy")) out.rsvpBy = isoDateOf(body.rsvpBy);
  if (has("hashtag")) out.hashtag = line(body.hashtag, 40).replace(/\s+/g, "");
  if (has("invitation")) out.invitation = para(body.invitation, 1500);
  if (has("hindiMessage")) out.hindiMessage = para(body.hindiMessage, 800);
  if (has("gettingThere")) out.gettingThere = para(body.gettingThere, 600);
  if (has("theme")) out.theme = oneOf(body.theme, SHAADI_THEMES, "marigold");
  if (has("nameOrder")) out.nameOrder = oneOf(body.nameOrder, ["bride", "groom"] as const, "bride");
  if (has("videoUrl")) out.videoUrl = youtubeUrl(body.videoUrl);
  if (has("liveUrl")) out.liveUrl = httpsUrl(body.liveUrl, 300);
  if (has("upiId")) out.upiId = upiIdOf(body.upiId);
  if (has("things")) out.things = normalizeThings(body.things);
  if (has("story")) out.story = normalizeStory(body.story);
  if (has("contacts")) out.contacts = normalizeContacts(body.contacts);
  if (has("musicMode")) out.musicMode = oneOf(body.musicMode, MUSIC_MODES, "");
  if (has("musicYoutubeId")) out.musicYoutubeId = youtubeId(body.musicYoutubeId);
  if (has("musicStart")) out.musicStart = num(body.musicStart, 0, 600, 0);
  if (has("rsvpOn")) out.rsvpOn = body.rsvpOn !== false;
  if (has("rsvpMeal")) out.rsvpMeal = body.rsvpMeal === true;
  if (has("maxGuests")) out.maxGuests = num(body.maxGuests, 1, 10, 6);
  if (has("invocation")) out.invocation = body.invocation !== false;
  if (has("couplePhoto")) out.couplePhoto = typeof body.couplePhoto === "string" ? body.couplePhoto.trim() : "";
  for (const k of ["brideCrop", "groomCrop", "coupleCrop"]) if (has(k)) out[k] = crop(body[k]);
  return out;
}

/** Every field the update route may write, old and new. */
export const SHAADI_UPDATABLE = [
  "brideName", "groomName", "weddingDate", "venue", "blessing",
  "bridePhoto", "brideDescription", "brideTags", "brideFamilyParents", "brideFamilyGrandparents",
  "groomPhoto", "groomDescription", "groomTags", "groomFamilyParents", "groomFamilyGrandparents",
  "events", "galleryImages", "sharePhoto",
  "theme", "lang", "invitation", "hindiMessage", "muhurat", "blessingsOf", "nameOrder", "hashtag", "closingLine",
  "videoUrl", "liveUrl", "upiId", "upiName", "gettingThere", "things", "story", "contacts",
  "musicMode", "musicYoutubeId", "musicStart", "rsvpOn", "rsvpBy", "rsvpMeal", "maxGuests", "invocation",
  "couplePhoto", "brideCrop", "groomCrop", "coupleCrop",
] as const;

// ── The wedding kit's guest routes (RSVP) see a shaadi page like this ──────

export interface ShaadiDocLike {
  _id: unknown;
  userId: unknown;
  shareId: string;
  brideName?: string;
  groomName?: string;
  events?: { id?: string; name?: string; disabled?: boolean }[];
  rsvpMeal?: boolean;
  password?: string;
  comparePassword(candidate: string): Promise<boolean>;
}

/**
 * The page as `weddingGuest.controller` expects it: recipientName = bride,
 * senderName = groom, `extras.events` = the enabled functions with their ids
 * (old pages: `e<index>` in stored order, matching normalizeEvents).
 */
export function guestPageOf(doc: ShaadiDocLike) {
  const events = (Array.isArray(doc.events) ? doc.events : [])
    .map((e, i) => ({ id: line(e?.id, 40) || `e${i}`, title: line(e?.name, 60), disabled: !!e?.disabled }))
    .filter((e) => !e.disabled)
    .map(({ id, title }) => ({ id, title }));
  return {
    _id: doc._id,
    userId: doc.userId,
    shareId: doc.shareId,
    recipientName: doc.brideName || "",
    senderName: doc.groomName || "",
    extras: { events, rsvpMeal: doc.rsvpMeal === true },
    password: doc.password || "",
    comparePassword: (c: string) => doc.comparePassword(c),
  };
}
