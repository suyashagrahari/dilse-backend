// ─── Christian Wedding — Scroll Edition: the extras ─────────────────────────
//
// The scroll edition (`templateVariant: "scroll"`, client route
// /christian-wedding-2) shares the `christian_wedding_pages` collection with
// the tabs edition. Everything it adds on top of the shared, flat fields
// (functions with ISO dates + maps + dress codes, scripture, story, order of
// service, contacts, livestream, shagun, music, theme, RSVP settings, photo
// crops…) lives in ONE optional object, `scrollExtras`, so:
//
//   - a page published before it existed has no `scrollExtras` and renders
//     from the flat fields exactly as before (the client derives the rest);
//   - the tabs edition never sees or loses it;
//   - nothing stored is renamed or retyped.
//
// The client is untrusted: every key is whitelisted, clamped and coerced here.
// Photos inside it go through the same media pipeline as the flat fields (the
// controller runs transformMediaPayload over it), and the flat legacy fields
// (galleryImages, bridePhoto, groomPhoto, sharePhoto) are mirrored from it so
// "My pages", share cards and the tabs edition keep working.
//
// Pure (no I/O) apart from `randomBytes` for ids: unit-tested.

import { randomBytes } from "crypto";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
// Control characters out (newlines kept by `multi`).
const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const multi = (v: unknown, max: number): string =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
const num = (v: unknown, min: number, max: number, d: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const date = (v: unknown) => (typeof v === "string" && DATE_RE.test(v.trim()) ? v.trim() : "");
const time = (v: unknown) => (typeof v === "string" && TIME_RE.test(v.trim()) ? v.trim() : "");
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : "");

/** An https link (maps, YouTube, livestream). Anything else — javascript:, data:, http: — is dropped. */
export function httpsUrl(v: unknown, max = 600): string {
  const s = str(v, max);
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString().slice(0, max) : "";
  } catch {
    return "";
  }
}

/**
 * A photo source: an uploaded https URL, the template's own repo art
 * ("/wedding-v3/…"), or a base64 image the media pipeline is about to upload.
 */
export function photoUrl(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  if (s.startsWith("data:image/")) return s.length <= 8_000_000 ? s : "";
  if (/^\/wedding-v3\/[\w./-]+\.(webp|png|jpe?g)$/i.test(s) && !s.includes("..")) return s;
  return httpsUrl(s, 1000);
}

const crop = (v: unknown) => {
  const o = isObj(v) ? v : {};
  return { x: num(o.x, 0, 100, 50), y: num(o.y, 0, 100, 50), scale: num(o.scale, 100, 300, 100) };
};

const portrait = (v: unknown) => {
  const o = isObj(v) ? v : {};
  return { url: photoUrl(o.url), crop: crop(o.crop) };
};

const SPANS = ["normal", "wide", "tall", "large"] as const;
const galleryPhoto = (v: unknown) => {
  const o = isObj(v) ? v : {};
  const url = photoUrl(o.url);
  if (!url) return null;
  const out: Obj = { url, cropX: num(o.cropX, 0, 100, 50), cropY: num(o.cropY, 0, 100, 50), scale: num(o.scale, 100, 300, 100), span: oneOf(o.span, SPANS, "normal") };
  const caption = str(o.caption, 140);
  if (caption) out.caption = caption;
  const w = num(o.w, 0, 20000, 0);
  const h = num(o.h, 0, 20000, 0);
  if (w && h) {
    out.w = w;
    out.h = h;
  }
  return out;
};

const newEventId = (taken: Set<string>): string => {
  for (;;) {
    const id = `e${randomBytes(4).toString("hex").slice(0, 6)}`;
    if (!taken.has(id)) return id;
  }
};

export const SCROLL_LIMITS = { events: 8, order: 12, story: 8, contacts: 4, things: 6, gallery: 40 } as const;
export const SECOND_LANGS = ["none", "hi", "ml", "ta"] as const;
export const SCROLL_THEMES = ["blossom", "sage", "ivory"] as const;

/** The whitelisted, clamped `scrollExtras`, or undefined when the input is not an object. */
export function cleanScrollExtras(raw: unknown): Obj | undefined {
  if (!isObj(raw)) return undefined;
  const x = raw;

  const taken = new Set<string>();
  const events = arr(x.events, SCROLL_LIMITS.events)
    .filter(isObj)
    .map((e) => {
      let id = str(e.id, 24).replace(/[^a-z0-9_-]/gi, "");
      if (!id || taken.has(id)) id = newEventId(taken);
      taken.add(id);
      return {
        id,
        title: str(e.title, 60),
        date: date(e.date),
        time: time(e.time),
        endTime: time(e.endTime),
        venue: str(e.venue, 120),
        address: str(e.address, 200),
        mapUrl: httpsUrl(e.mapUrl),
        dressCode: str(e.dressCode, 60),
        dressColor: hex(e.dressColor),
        note: multi(e.note, 400),
      };
    })
    .filter((e) => e.title || e.date || e.venue);

  const music = isObj(x.music) ? x.music : {};
  const scripture = isObj(x.scripture) ? x.scripture : {};
  const upiId = str(x.upiId, 100);

  return {
    v: 1,
    nameOrder: oneOf(x.nameOrder, ["bride", "groom"] as const, "bride"),
    invitation: multi(x.invitation, 1500),
    secondLang: oneOf(x.secondLang, SECOND_LANGS, "none"),
    altInvitation: multi(x.altInvitation, 1200),
    altVerse: multi(x.altVerse, 400),
    scripture: { text: multi(scripture.text, 400), ref: str(scripture.ref, 60) },
    blessingsOf: str(x.blessingsOf, 200),
    events,
    order: arr(x.order, SCROLL_LIMITS.order)
      .filter(isObj)
      .map((o) => ({ time: str(o.time, 12), title: str(o.title, 60), note: str(o.note, 160) }))
      .filter((o) => o.title),
    story: arr(x.story, SCROLL_LIMITS.story)
      .filter(isObj)
      .map((c) => ({ when: str(c.when, 40), title: str(c.title, 80), line: multi(c.line, 400), photo: photoUrl(c.photo), crop: crop(c.crop) }))
      .filter((c) => c.title || c.line),
    gallery: arr(x.gallery, SCROLL_LIMITS.gallery).map(galleryPhoto).filter(Boolean),
    couplePhoto: portrait(x.couplePhoto),
    bridePhoto: portrait(x.bridePhoto),
    groomPhoto: portrait(x.groomPhoto),
    contacts: arr(x.contacts, SCROLL_LIMITS.contacts)
      .filter(isObj)
      .map((c) => ({ name: str(c.name, 40), relation: str(c.relation, 40), phone: str(c.phone, 20).replace(/[^\d+ -]/g, "") }))
      .filter((c) => c.name && c.phone),
    things: arr(x.things, SCROLL_LIMITS.things)
      .filter(isObj)
      .map((t) => ({ head: str(t.head, 40), text: multi(t.text, 300) }))
      .filter((t) => t.text),
    gettingThere: multi(x.gettingThere, 1000),
    videoUrl: httpsUrl(x.videoUrl, 300),
    liveUrl: httpsUrl(x.liveUrl, 500),
    upiId: /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$/i.test(upiId) ? upiId : "",
    upiName: str(x.upiName, 60),
    music: {
      youtubeId: typeof music.youtubeId === "string" && /^[A-Za-z0-9_-]{11}$/.test(music.youtubeId) ? music.youtubeId : "",
      start: num(music.start, 0, 3600, 0),
      enabled: bool(music.enabled, true),
    },
    theme: oneOf(x.theme, SCROLL_THEMES, "blossom"),
    rsvpOn: bool(x.rsvpOn, true),
    rsvpBy: date(x.rsvpBy),
    maxGuests: num(x.maxGuests, 1, 10, 4),
    rsvpMeal: bool(x.rsvpMeal, false),
    hashtag: str(x.hashtag, 40).replace(/\s+/g, ""),
    closing: str(x.closing, 160),
  };
}

/**
 * Mirror the extras' photos into the shared flat fields (after the media
 * pipeline has turned base64 into URLs), so share cards, "My pages" and the
 * tabs edition see the same pictures. Only writes what the extras carry.
 */
export function mirrorScrollExtras(target: Obj, extras: Obj): void {
  const gallery = Array.isArray(extras.gallery) ? (extras.gallery as Obj[]) : [];
  target.galleryImages = gallery.map((p) => ({ src: String(p.url || ""), alt: String(p.caption || "") }));
  const bride = isObj(extras.bridePhoto) ? String(extras.bridePhoto.url || "") : "";
  const groom = isObj(extras.groomPhoto) ? String(extras.groomPhoto.url || "") : "";
  const couple = isObj(extras.couplePhoto) ? String(extras.couplePhoto.url || "") : "";
  target.bridePhoto = bride;
  target.groomPhoto = groom;
  target.sharePhoto = couple || (gallery[0] ? String(gallery[0].url || "") : "") || String(target.sharePhoto || "");
}

// ── For the wedding-kit guest routes (RSVP) ─────────────────────────────────

interface LegacyEvent {
  name?: unknown;
  disabled?: unknown;
}

/**
 * `{ events: [{ id, title }], rsvpMeal }` — what weddingGuest.controller reads
 * from `page.extras`. A page without `scrollExtras` (published before it
 * existed) gets ids f1, f2… for its enabled legacy events, in stored order —
 * the client derives exactly the same ids.
 */
export function guestExtrasOf(doc: { scrollExtras?: unknown; events?: unknown }): { events: { id: string; title: string }[]; rsvpMeal: boolean } {
  const x = isObj(doc.scrollExtras) ? doc.scrollExtras : null;
  if (x && Array.isArray(x.events)) {
    return {
      events: (x.events as unknown[]).filter(isObj).map((e) => ({ id: String(e.id || ""), title: String(e.title || "") })).filter((e) => e.id),
      rsvpMeal: x.rsvpMeal === true,
    };
  }
  const legacy = Array.isArray(doc.events) ? (doc.events as LegacyEvent[]) : [];
  return {
    events: legacy.filter((e) => e && !e.disabled).map((e, i) => ({ id: `f${i + 1}`, title: String(e.name || "") })),
    rsvpMeal: false,
  };
}
