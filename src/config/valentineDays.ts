// ─── Valentine's week — the eight days, one engine (+ Halloween) ─────────────
//
// Rose Day (7 Feb) → Valentine's Day (14 Feb) are eight templates that share one
// data shape. Happy Halloween (31 Oct) is a ninth template on the same engine. Everything every day has (names, the letter, photos, five GIF
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

import roseDayPremium from "./premiumDays/happy-rose-day-premium";
import proposeDayPremium from "./premiumDays/happy-propose-day-premium";
import chocolateDayPremium from "./premiumDays/happy-chocolate-day-premium";
import teddyDayPremium from "./premiumDays/happy-teddy-day-premium";
import promiseDayPremium from "./premiumDays/happy-promise-day-premium";
import hugDayPremium from "./premiumDays/happy-hug-day-premium";
import kissDayPremium from "./premiumDays/happy-kiss-day-premium";
import valentinesDayPremium from "./premiumDays/happy-valentines-day-premium";
import halloweenPremium from "./premiumDays/happy-halloween-premium";

/** The nine $2 templates. */
export const BASE_DAY_SLUGS = [
  "happy-rose-day",
  "happy-propose-day",
  "happy-chocolate-day",
  "happy-teddy-day",
  "happy-promise-day",
  "happy-hug-day",
  "happy-kiss-day",
  "happy-valentines-day",
  // Not a Valentine day: an occasion that runs on the same engine (9th entry).
  "happy-halloween",
  // Navratri: "Be My Dandiya Partner", a Dandiya-night invitation on the same engine.
  "dandiya-partner",
  // Diwali wishes — another occasion on the engine.
  "happy-diwali",
  // I'm Sorry — an evergreen apology on the engine (✦ premium in the gallery).
  "sorry",
  // Happy Birthday — an evergreen birthday surprise on the engine (✦ premium in the gallery).
  "happy-birthday",
  // Miss You — an evergreen long-distance "I miss you" on the engine (✦ premium in the gallery).
  "miss-you",
  // Will You Be Mine? — an evergreen proposal page on the engine (✦ premium).
  "will-you-be-mine",
  // Anniversary ✦ Premium ("The Book of Us") — the flagship anniversary page on the engine.
  "anniversary-premium",
] as const;

export type BaseDaySlug = (typeof BASE_DAY_SLUGS)[number];

/**
 * The ultra-premium tier: one twin per base slug, on the same engine, plus the
 * shared `premium` sub-document (voice note, scheduled unlock, reply, P.S.).
 * Each one's config lives in its own file, config/premiumDays/<slug>.ts.
 */
export const PREMIUM_DAY_SLUGS = [
  "happy-rose-day-premium",
  "happy-propose-day-premium",
  "happy-chocolate-day-premium",
  "happy-teddy-day-premium",
  "happy-promise-day-premium",
  "happy-hug-day-premium",
  "happy-kiss-day-premium",
  "happy-valentines-day-premium",
  "happy-halloween-premium",
] as const;

export type PremiumDaySlug = (typeof PREMIUM_DAY_SLUGS)[number];

export const PREMIUM_BASE: Record<PremiumDaySlug, BaseDaySlug> = {
  "happy-rose-day-premium": "happy-rose-day",
  "happy-propose-day-premium": "happy-propose-day",
  "happy-chocolate-day-premium": "happy-chocolate-day",
  "happy-teddy-day-premium": "happy-teddy-day",
  "happy-promise-day-premium": "happy-promise-day",
  "happy-hug-day-premium": "happy-hug-day",
  "happy-kiss-day-premium": "happy-kiss-day",
  "happy-valentines-day-premium": "happy-valentines-day",
  "happy-halloween-premium": "happy-halloween",
};

export const isPremiumDaySlug = (s: unknown): s is PremiumDaySlug =>
  typeof s === "string" && (PREMIUM_DAY_SLUGS as readonly string[]).includes(s);

/** A premium slug's $2 twin; any other string comes back unchanged. */
export const baseDaySlug = (s: string): string => (isPremiumDaySlug(s) ? PREMIUM_BASE[s] : s);

/** Every slug the engine serves: the nine $2 days, then their premium twins. */
export const VALENTINE_DAY_SLUGS = [...BASE_DAY_SLUGS, ...PREMIUM_DAY_SLUGS] as const;

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
  /** The sticker moments, in the order they appear (five on $2 days, six on premium). */
  gifSlots: readonly string[];
  /** Propose, Valentine's and Halloween ask yes/no: an "answered" reaction emails the owner. */
  asksQuestion: boolean;
  /** The ultra-premium tier: stores the `premium` sub-document and takes replies. */
  premium?: boolean;
  /**
   * The template ships its own looping background track (client
   * DayConfig.music.track): musicMode "track" is accepted, and is the default
   * for a new page. On any other slug "track" falls back to the melody.
   */
  musicTrack?: boolean;
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

  // ── 31 Oct ── Happy Halloween: the little haunted house (an occasion on the
  //    same engine — knock, trick or treat, carve, fogged portraits, a letter
  //    by flashlight, a love potion, "Will you be my boo?") ─────────────────
  "happy-halloween": {
    title: "The Little Haunted House",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    /** The haunted piano loop — the default background music. */
    musicTrack: true,
    gifSlots: ["h1-doorstep", "h2-treat", "h3-portrait", "h4-potion", "h5-boo"],
    extras: [
      /** Who it's for — changes the default question, the license and kids-safe mode. */
      { key: "tone", kind: "enum", options: ["romantic", "friends", "family", "kids"], default: "romantic" },
      { key: "houseName", kind: "text", max: 40 },
      { key: "trickLine", kind: "text", max: 80 },
      { key: "carveWord", kind: "text", max: 10 },
      {
        key: "costume",
        kind: "enum",
        options: ["ghost", "witch", "vampire", "pumpkin", "black-cat", "skeleton", "mummy", "bat"],
        default: "ghost",
      },
      { key: "costumeWhy", kind: "text", max: 70 },
      {
        key: "ingredients",
        kind: "objlist",
        maxItems: 5,
        minItems: 3,
        item: [
          { key: "name", kind: "text", max: 30 },
          { key: "line", kind: "text", max: 70 },
        ],
      },
      { key: "potionSpell", kind: "text", max: 90 },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
    ],
  },

  // ── Navratri ── Be My Dandiya Partner: an embroidered invitation, nine
  //    diyas, a dhol-beat game, pick your twirl colour, the garba circle of
  //    photos, a note in the dupatta, the invitation ticket and "Will you be
  //    my Dandiya partner?" ──────────────────────────────────────────────────
  "dandiya-partner": {
    title: "Be My Dandiya Partner",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    gifSlots: ["d1-gate", "d2-beat", "d3-garba", "d4-invite", "d5-yes"],
    extras: [
      /** Who it's for — changes the default question, the pass and the reply. */
      { key: "tone", kind: "enum", options: ["romantic", "crush", "friends"], default: "romantic" },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "nightLines", kind: "list", maxItems: 9, itemMax: 70 },
      { key: "myColor", kind: "enum", options: ["marigold", "kumkum", "peacock", "emerald", "rani", "jamuni"], default: "peacock" },
      { key: "lookLine", kind: "text", max: 70 },
      { key: "eventDate", kind: "text", max: 10 },
      { key: "eventTime", kind: "text", max: 24 },
      { key: "venue", kind: "text", max: 60 },
      { key: "dressCode", kind: "text", max: 50 },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
      /**
       * How the recipient may answer (the sender's choice): "yesOnly" — No
       * dodges forever; "noAfterTries" — No dodges `noTries` times, then can
       * be pressed and records `reactions.answer: "no"` (see answerAllows).
       */
      { key: "answerMode", kind: "enum", options: ["yesOnly", "noAfterTries"], default: "yesOnly" },
      { key: "noTries", kind: "enum", options: ["4", "5"], default: "4" },
    ],
  },
  // ── I'm Sorry ── an evergreen apology on the engine (✦ premium): a sealed
  //    envelope, "how upset are you?", what I did (scratch it off), guilt
  //    bubbles, photos, the letter, a pinky promise, make-it-up coupons and
  //    "Will you forgive me?" — the sender may let No become "I need a little
  //    time", which records reactions.answer "no". Six pastel looks. ─────────
  sorry: {
    title: "I'm Sorry, Please Forgive Me",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    /** Plays its own English song (client SORRY_TRACK) unless the sender picks another. */
    musicTrack: true,
    gifSlots: ["s1-gate", "s2-sorry", "s3-promise", "s4-coupon", "s5-yes"],
    extras: [
      { key: "palette", kind: "enum", options: ["babyPink", "strawberryMilk", "mintMatcha", "lavenderDream", "peachCream", "skyCotton"], default: "babyPink" },
      /** Who it's for — changes the default question, the certificate and the reply. */
      { key: "tone", kind: "enum", options: ["partner", "crush", "bestie"], default: "partner" },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "moodLines", kind: "list", maxItems: 5, itemMax: 70 },
      { key: "confession", kind: "longtext", max: 160 },
      { key: "reasons", kind: "list", maxItems: 5, itemMax: 70 },
      { key: "promise", kind: "text", max: 120 },
      {
        key: "coupons",
        kind: "objlist",
        maxItems: 4,
        item: [
          { key: "title", kind: "text", max: 28 },
          { key: "line", kind: "text", max: 60 },
        ],
      },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
      { key: "answerMode", kind: "enum", options: ["yesOnly", "noAfterTries"], default: "yesOnly" },
      { key: "noTries", kind: "enum", options: ["4", "5"], default: "4" },
    ],
  },
  // ── Happy Birthday ── an evergreen birthday surprise on the engine (✦
  //    premium): untie the gift, light + blow the candles, cut the cake, pop
  //    the balloons (reasons), photos, the letter, unwrap coupons, "Birthday
  //    date with me?" (No runs away; yes only) and, with askWhen, when — the
  //    pick (1 tonight · 2 this weekend · 3 you plan it) lands in
  //    reactions.count. Four cake-flavoured looks; a crown certificate. ─────
  "happy-birthday": {
    title: "Happy Birthday, My Love",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    /** Plays its own song (client HB_TRACK, Best Day of My Life) unless the sender picks another. */
    musicTrack: true,
    gifSlots: ["b1-gate", "b2-wish", "b3-party", "b4-gift", "b5-yes"],
    extras: [
      { key: "palette", kind: "enum", options: ["strawberryCake", "funfettiVanilla", "lavenderFrosting", "mintMacaron"], default: "strawberryCake" },
      /** Whose birthday — changes the default question, the letter's sign-off and the reply. */
      { key: "tone", kind: "enum", options: ["partner", "crush", "bestie"], default: "partner" },
      { key: "crown", kind: "enum", options: ["queen", "king", "star"], default: "queen" },
      /** The number on the cake topper ("" = a heart). */
      { key: "age", kind: "text", max: 3 },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "wishLine", kind: "text", max: 100 },
      { key: "cakeLine", kind: "text", max: 90 },
      { key: "reasons", kind: "list", maxItems: 5, itemMax: 70 },
      {
        key: "coupons",
        kind: "objlist",
        maxItems: 4,
        item: [
          { key: "title", kind: "text", max: 28 },
          { key: "line", kind: "text", max: 60 },
        ],
      },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
      { key: "askWhen", kind: "enum", options: ["yes", "no"], default: "yes" },
    ],
  },
  // ── Miss You ── an evergreen long-distance "I miss you" (✦ premium): an
  //    incoming love call, two cities on a map (km worked out client-side when
  //    distanceKm is 0), a countdown to meetDate, a jar of things I miss,
  //    photos, open-when envelopes, the letter as a paper plane, a hug across
  //    the map and "Video call tonight?" — the sender may let No become "Not
  //    tonight", which records reactions.answer "no". Four looks. ───────────
  "miss-you": {
    title: "I Miss You, Come Back Soon",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    /** Plays its own song (client MISS_YOU_TRACK, The Night We Met) unless the sender picks another. */
    musicTrack: true,
    gifSlots: ["m1-call", "m2-miss", "m3-hug", "m4-wait", "m5-yes"],
    extras: [
      { key: "palette", kind: "enum", options: ["midnightStars", "sunsetPeach", "cloudLilac", "moonlightMint"], default: "midnightStars" },
      /** Who it's for — changes the default question, the reply and the ticket's seat. */
      { key: "tone", kind: "enum", options: ["partner", "crush", "bestie"], default: "partner" },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "yourCity", kind: "text", max: 30 },
      { key: "myCity", kind: "text", max: 30 },
      { key: "distanceKm", kind: "number", min: 0, max: 20000, default: 0 },
      /** "YYYY-MM-DD" or "" (the countdown then says "soon"). */
      { key: "meetDate", kind: "text", max: 10 },
      { key: "missThings", kind: "list", maxItems: 6, itemMax: 70 },
      {
        key: "openWhen",
        kind: "objlist",
        maxItems: 4,
        item: [
          { key: "when", kind: "text", max: 40 },
          { key: "note", kind: "longtext", max: 160 },
        ],
      },
      { key: "hugLine", kind: "text", max: 80 },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
      { key: "answerMode", kind: "enum", options: ["yesOnly", "noAfterTries"], default: "yesOnly" },
      { key: "noTries", kind: "enum", options: ["4", "5"], default: "4" },
    ],
  },
  // ── Will You Be Mine? ── an evergreen proposal page on the engine (✦
  //    premium): a velvet ring box, our story (a heart path of chapters), the
  //    reasons as a heart constellation, a love quiz, photos, the letter, hold
  //    the heart till the ring box opens with a promise, then "Will you be
  //    mine?" — the sender may let No become "Let me think about it", which
  //    records reactions.answer "no". Four looks. ─────────────────────────────
  "will-you-be-mine": {
    title: "Will You Be Mine?",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: true,
    /** Plays its own song (client WYBM_TRACK, Perfect) unless the sender picks another. */
    musicTrack: true,
    gifSlots: ["s1-gate", "s2-story", "s3-quiz", "s4-propose", "s5-yes"],
    extras: [
      { key: "palette", kind: "enum", options: ["roseGold", "cherryBlossom", "starryNight", "ivoryLace"], default: "roseGold" },
      /** What they're asking — changes the default question, the YES button, the certificate and the reply. */
      { key: "tone", kind: "enum", options: ["girlfriend", "boyfriend", "marry", "date"], default: "girlfriend" },
      { key: "openingLine", kind: "text", max: 60 },
      {
        key: "story",
        kind: "objlist",
        maxItems: 4,
        item: [
          { key: "when", kind: "text", max: 24 },
          { key: "title", kind: "text", max: 36 },
          { key: "line", kind: "text", max: 100 },
        ],
      },
      { key: "reasons", kind: "list", maxItems: 6, itemMax: 70 },
      {
        key: "quiz",
        kind: "objlist",
        maxItems: 3,
        item: [
          { key: "q", kind: "text", max: 60 },
          { key: "right", kind: "text", max: 30 },
          { key: "wrong1", kind: "text", max: 30 },
          { key: "wrong2", kind: "text", max: 30 },
        ],
      },
      { key: "promise", kind: "text", max: 140 },
      { key: "question", kind: "text", max: 60 },
      { key: "yesLine", kind: "text", max: 80 },
      { key: "answerMode", kind: "enum", options: ["yesOnly", "noAfterTries"], default: "yesOnly" },
      { key: "noTries", kind: "enum", options: ["4", "5"], default: "4" },
    ],
  },
  // ── Anniversary ✦ Premium ── "The Book of Us", the flagship anniversary
  //    page (dating and married couples): an optional lock (our date or a
  //    countdown), opening titles, two paths that meet, a time machine of
  //    chapters, our firsts on vinyl, the little things on a breakfast tray, a
  //    memory quilt, the letter as a book, our year in numbers, promise
  //    lanterns, next year's horizon and a question answered by dragging a
  //    heart (yes only). Four light looks; a Certificate of Forever. ─────────
  "anniversary-premium": {
    title: "The Book of Us",
    maxPhotos: 10,
    letterMax: 2500,
    asksQuestion: true,
    /** Plays its own song (client ANNI_TRACK, A Thousand Years) unless the sender picks another. */
    musicTrack: true,
    gifSlots: ["a1-hello", "a2-hug", "a3-dance", "a4-kiss", "a5-yes", "a6-forever"],
    extras: [
      { key: "palette", kind: "enum", options: ["champagnePearl", "blushIvory", "lilacDawn", "sageLinen"], default: "champagnePearl" },
      /** Who it's for — changes the default question, the wording and the reply. */
      { key: "tone", kind: "enum", options: ["girlfriend", "boyfriend", "wife", "husband", "partner"], default: "girlfriend" },
      /** "YYYY-MM-DD" or "": the anniversary (the day it began / the wedding day). */
      { key: "since", kind: "text", max: 10 },
      /** "YYYY-MM-DD" or "": the day they first met. */
      { key: "metOn", kind: "text", max: 10 },
      { key: "openingLine", kind: "text", max: 60 },
      { key: "metPlace", kind: "text", max: 40 },
      { key: "metLine", kind: "text", max: 120 },
      {
        key: "chapters",
        kind: "objlist",
        maxItems: 6,
        item: [
          { key: "when", kind: "text", max: 20 },
          { key: "title", kind: "text", max: 40 },
          { key: "line", kind: "text", max: 120 },
          { key: "season", kind: "enum", options: ["spring", "summer", "monsoon", "autumn", "winter"], default: "spring" },
        ],
      },
      {
        key: "firsts",
        kind: "objlist",
        maxItems: 5,
        item: [
          { key: "title", kind: "text", max: 30 },
          { key: "line", kind: "text", max: 110 },
        ],
      },
      { key: "littleThings", kind: "list", maxItems: 6, itemMax: 70 },
      { key: "reasons", kind: "list", maxItems: 8, itemMax: 70 },
      { key: "ourSong", kind: "text", max: 50 },
      { key: "mostSaid", kind: "text", max: 40 },
      {
        key: "stats",
        kind: "objlist",
        maxItems: 3,
        item: [
          { key: "num", kind: "text", max: 12 },
          { key: "label", kind: "text", max: 40 },
        ],
      },
      { key: "promises", kind: "list", maxItems: 5, itemMax: 80 },
      { key: "plans", kind: "list", maxItems: 4, itemMax: 60 },
      { key: "question", kind: "text", max: 70 },
      { key: "datePlan", kind: "text", max: 80 },
      { key: "yesLine", kind: "text", max: 90 },
      /** A soft lock on the recipient page: "passcode" = DD MM of `since`; "countdown" = sealed until `openOn`. */
      { key: "lock", kind: "enum", options: ["none", "passcode", "countdown"], default: "none" },
      { key: "openOn", kind: "text", max: 10 },
      { key: "passHint", kind: "text", max: 50 },
    ],
  },
  // ── Diwali ── Happy Diwali: light the diya at their door, a row of wish
  //    diyas, a rangoli, a sparkler, lantern photos, fireworks + the letter,
  //    a mithai box and a Shubh Deepavali card. No question is asked. ───────
  "happy-diwali": {
    title: "A Diya at Your Door",
    maxPhotos: 6,
    letterMax: 1500,
    asksQuestion: false,
    gifSlots: ["d1-diya", "d2-wishes", "d3-rangoli", "d4-sparkler", "d5-blessing"],
    extras: [
      /** Who it's for — changes the default wishes, blessing and reply. */
      { key: "tone", kind: "enum", options: ["romantic", "family", "friends"], default: "romantic" },
      { key: "doorNote", kind: "text", max: 60 },
      /** One line per diya they light (3–5). */
      { key: "wishes", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
      { key: "initials", kind: "text", max: 6 },
      { key: "sparkleWord", kind: "text", max: 12 },
      { key: "mithai", kind: "enum", options: ["laddoo", "kaju-katli", "jalebi", "gulab-jamun", "barfi"], default: "laddoo" },
      { key: "mithaiNote", kind: "text", max: 80 },
      { key: "blessing", kind: "text", max: 120 },
    ],
  },

  // ── The ultra-premium twins — one file each in ./premiumDays ──────────────
  "happy-rose-day-premium": roseDayPremium,
  "happy-propose-day-premium": proposeDayPremium,
  "happy-chocolate-day-premium": chocolateDayPremium,
  "happy-teddy-day-premium": teddyDayPremium,
  "happy-promise-day-premium": promiseDayPremium,
  "happy-hug-day-premium": hugDayPremium,
  "happy-kiss-day-premium": kissDayPremium,
  "happy-valentines-day-premium": valentinesDayPremium,
  "happy-halloween-premium": halloweenPremium,
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

// ─── Background music ────────────────────────────────────────────────────────
//
// `musicMode` is the source of truth; `music` (boolean) is kept for older
// clients and is always `musicMode !== "off"`. Only an 11-char YouTube video
// id is ever stored — never a URL — and a "youtube" choice without a valid id
// falls back to the built-in melody so the page is never silent by accident.
// "track" (the template's own looping MP3; its URL lives in the client config,
// never in the page) is only kept on a slug with `musicTrack`.

export const MUSIC_MODES = ["off", "melody", "youtube", "track"] as const;
export type MusicMode = (typeof MUSIC_MODES)[number];
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const MUSIC_START_MAX = 600;

export interface MusicFields {
  music: boolean;
  musicMode: MusicMode;
  musicYoutubeId: string;
  musicStart: number;
}

export const MUSIC_DEFAULTS: MusicFields = { music: true, musicMode: "melody", musicYoutubeId: "", musicStart: 0 };
/** A new page on a slug with its own track. */
export const TRACK_MUSIC_DEFAULTS: MusicFields = { ...MUSIC_DEFAULTS, musicMode: "track" };

const asBool = (v: unknown): boolean | undefined => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

/**
 * Body → the four stored music fields. `prev` is the stored page on update, so
 * a partial body (an old client that only sends `music`) keeps what it does
 * not mention. `opts.track`: the slug ships its own track (`musicTrack`), so
 * "track" is valid and is the fallback instead of the melody.
 */
export function sanitizeMusic(
  raw: { music?: unknown; musicMode?: unknown; musicYoutubeId?: unknown; musicStart?: unknown },
  prevIn?: MusicFields,
  opts: { track?: boolean } = {}
): MusicFields {
  const track = !!opts.track;
  const fallback: MusicMode = track ? "track" : "melody";
  const prev = prevIn ?? (track ? TRACK_MUSIC_DEFAULTS : MUSIC_DEFAULTS);
  const id = typeof raw.musicYoutubeId === "string" ? raw.musicYoutubeId.trim() : undefined;
  const youtubeId = id === undefined ? prev.musicYoutubeId : YOUTUBE_ID_RE.test(id) ? id : "";

  let mode: MusicMode;
  if (typeof raw.musicMode === "string" && (MUSIC_MODES as readonly string[]).includes(raw.musicMode)) {
    mode = raw.musicMode as MusicMode;
  } else {
    const on = asBool(raw.music);
    mode = on === undefined ? prev.musicMode : on ? (prev.musicMode === "off" ? fallback : prev.musicMode) : "off";
  }
  if (mode === "youtube" && !youtubeId) mode = fallback;
  if (mode === "track" && !track) mode = "melody";

  const n = typeof raw.musicStart === "number" ? raw.musicStart : typeof raw.musicStart === "string" && raw.musicStart.trim() ? Number(raw.musicStart) : NaN;
  const start = raw.musicStart === undefined ? prev.musicStart : Number.isFinite(n) ? Math.min(MUSIC_START_MAX, Math.max(0, Math.round(n))) : 0;

  return { music: mode !== "off", musicMode: mode, musicYoutubeId: youtubeId, musicStart: start };
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
/** The two answers a recipient can record. "no" needs answerAllows(). */
export type ReactionAnswer = "yes" | "no";

/** The wire's `answer` → "yes" | "no" | undefined (anything else is invalid). Missing = "yes" (every older client). */
export function parseAnswer(v: unknown): ReactionAnswer | undefined {
  if (v === undefined || v === null || v === "") return "yes";
  return v === "yes" || v === "no" ? v : undefined;
}

/**
 * May this page record a "no"? Only when its sender chose "Yes or No"
 * (extras.answerMode === "noAfterTries"). Every other page — and every day
 * that does not declare the setting — stays yes-only, exactly as before.
 */
export function answerAllows(extras: unknown, answer: ReactionAnswer): boolean {
  if (answer === "yes") return true;
  const x = extras && typeof extras === "object" ? (extras as Record<string, unknown>) : {};
  return x.answerMode === "noAfterTries";
}

export function reactionWrite(
  event: ReactionEvent,
  extra: { noDodges?: unknown; count?: unknown; answer?: unknown },
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
  set["reactions.answer"] = extra.answer === "no" ? "no" : "yes";
  set["reactions.answeredAt"] = now;
  if (noDodges !== undefined) set["reactions.noDodges"] = noDodges;
  if (count !== undefined) set["reactions.count"] = count;
  return { guard: { "reactions.answer": null }, set };
}

// ─── Premium: the shared sub-document ────────────────────────────────────────
//
// Every premium day carries the same extra shape, stored as a top-level
// `premium` sub-document — never inside `extras`, and never written for a $2
// slug (their payloads stay byte-for-byte what they were).

export interface PremiumFields {
  /** "" or an https URL. A data URL is uploaded by resolvePremiumVoice first. */
  voiceNote: string;
  /** 0–60, whole seconds. */
  voiceNoteSec: number;
  /** ≤ 64 ints 0–100 — the waveform, computed client-side. */
  voicePeaks: number[];
  /** ≤ 90, trimmed. */
  voiceCaption: string;
  /** 0–600 whole seconds into the song where the "drop" lands; 0 = none. */
  songDropAt: number;
  /** "" or a normalised ISO-8601 instant (toISOString()). In the future ⇒ locked for everyone but the owner. */
  unlockAt: string;
  /** IANA zone the sender picked the unlock time in — display only. */
  unlockTz: string;
  /** The recipient may send one reply. Default true. */
  allowReply: boolean;
  /** ≤ 600, newlines kept — the sealed "open only if…" P.S. */
  psLetter: string;
}

export const PREMIUM_LIMITS = {
  voiceSec: 60,
  voiceBytes: 2 * 1024 * 1024,
  voicePeaks: 64,
  voiceCaption: 90,
  psLetter: 600,
  songDropMax: 600,
  unlockTz: 40,
  reply: 280,
  voiceUrl: 600,
} as const;

export const PREMIUM_DEFAULT_TZ = "Asia/Kolkata";
export const UNLOCK_TZ_RE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;
/** An unlock further out than this is a typo (or a year field gone wrong) — dropped to "". */
export const UNLOCK_MAX_AHEAD_MS = 2 * 366 * 24 * 60 * 60 * 1000;

export const PREMIUM_DEFAULTS: PremiumFields = {
  voiceNote: "",
  voiceNoteSec: 0,
  voicePeaks: [],
  voiceCaption: "",
  songDropAt: 0,
  unlockAt: "",
  unlockTz: PREMIUM_DEFAULT_TZ,
  allowReply: true,
  psLetter: "",
};

/** C0 controls except \n, DEL and C1. */
const CONTROL_EXCEPT_NL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;

const intIn = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
};

/**
 * Hosts a voice note may live on: only where our own upload puts it (the CDN,
 * the configured public base, the bucket's S3 host). Anything else is dropped,
 * so a page can't be made to play — or ping — an arbitrary third-party URL.
 */
const voiceHosts = (): Set<string> => {
  const hosts = new Set(["cdn.subhsandesh.in"]);
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) {
    try {
      hosts.add(new URL(base).host.toLowerCase());
    } catch {
      /* malformed base — ignore */
    }
  }
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION;
  if (bucket && region) hosts.add(`${bucket}.s3.${region}.amazonaws.com`.toLowerCase());
  return hosts;
};

/** Shape only (https, ≤ limit) — for the URL our own uploader just returned. */
export const premiumVoiceUrlShape = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length <= PREMIUM_LIMITS.voiceUrl && /^https:\/\/\S+$/i.test(s) ? s : "";
};

/** Shape AND host — for any voice URL that arrives from a client. */
export const premiumVoiceUrl = (v: unknown): string => {
  const s = premiumVoiceUrlShape(v);
  if (!s) return "";
  try {
    return voiceHosts().has(new URL(s).host.toLowerCase()) ? s : "";
  } catch {
    return "";
  }
};

/** "" unless a parseable instant no more than two years ahead; normalised to toISOString(). */
export const sanitizeUnlockAt = (v: unknown, now: Date = new Date()): string => {
  if (typeof v !== "string" && !(v instanceof Date)) return "";
  const raw = typeof v === "string" ? v.trim().slice(0, 64) : v;
  if (raw === "") return "";
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  if (!Number.isFinite(ms)) return "";
  if (ms - now.getTime() > UNLOCK_MAX_AHEAD_MS) return "";
  return new Date(ms).toISOString();
};

export const sanitizeUnlockTz = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : "";
  return s && s.length <= PREMIUM_LIMITS.unlockTz && UNLOCK_TZ_RE.test(s) ? s : PREMIUM_DEFAULT_TZ;
};

const premiumText = (v: unknown, max: number, keepNewlines: boolean): string => {
  if (typeof v !== "string") return "";
  let s = v.replace(/\r\n?/g, "\n");
  s = keepNewlines ? s.replace(CONTROL_EXCEPT_NL, "") : s.replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ");
  return Array.from(s.trim()).slice(0, max).join("").trim();
};

const sanitizePeaks = (v: unknown): number[] => {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const p of v.slice(0, PREMIUM_LIMITS.voicePeaks)) {
    const n = intIn(p, 0, 100);
    out.push(n ?? 0);
  }
  return out;
};

/**
 * Body `premium` → the stored sub-document. Pure and synchronous: `voiceNote`
 * keeps only an https URL here (the controller swaps in an uploaded data URL
 * via resolvePremiumVoice). On update `prev` is the stored sub-document and a
 * key the body does not carry keeps its stored value.
 */
export function sanitizePremium(raw: unknown, prev?: Partial<PremiumFields> | null, now: Date = new Date()): PremiumFields {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const base: PremiumFields = { ...PREMIUM_DEFAULTS, ...(prev ?? {}) };
  const has = (k: keyof PremiumFields) => Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined;
  const allow = has("allowReply")
    ? src.allowReply === false || src.allowReply === "false"
      ? false
      : src.allowReply === true || src.allowReply === "true"
        ? true
        : base.allowReply !== false
    : base.allowReply !== false;
  return {
    // A stored value was put there by our own uploader; only a client-sent one is host-checked.
    voiceNote: has("voiceNote") ? premiumVoiceUrl(src.voiceNote) : premiumVoiceUrlShape(base.voiceNote),
    voiceNoteSec: has("voiceNoteSec") ? intIn(src.voiceNoteSec, 0, PREMIUM_LIMITS.voiceSec) ?? 0 : intIn(base.voiceNoteSec, 0, PREMIUM_LIMITS.voiceSec) ?? 0,
    voicePeaks: has("voicePeaks") ? sanitizePeaks(src.voicePeaks) : sanitizePeaks(base.voicePeaks),
    voiceCaption: premiumText(has("voiceCaption") ? src.voiceCaption : base.voiceCaption, PREMIUM_LIMITS.voiceCaption, false),
    songDropAt: has("songDropAt") ? intIn(src.songDropAt, 0, PREMIUM_LIMITS.songDropMax) ?? 0 : intIn(base.songDropAt, 0, PREMIUM_LIMITS.songDropMax) ?? 0,
    // A stored unlockAt is re-validated against `now` only when it is re-sent.
    unlockAt: has("unlockAt") ? sanitizeUnlockAt(src.unlockAt, now) : typeof base.unlockAt === "string" ? base.unlockAt : "",
    unlockTz: sanitizeUnlockTz(has("unlockTz") ? src.unlockTz : base.unlockTz),
    allowReply: allow,
    psLetter: premiumText(has("psLetter") ? src.psLetter : base.psLetter, PREMIUM_LIMITS.psLetter, true),
  };
}

/** True when a premium sub-document is still sealed at `now`. */
export const isPremiumLocked = (premium: unknown, now: Date = new Date()): boolean => {
  const at = premium && typeof premium === "object" ? (premium as { unlockAt?: unknown }).unlockAt : undefined;
  const ms = typeof at === "string" && at ? Date.parse(at) : at instanceof Date ? at.getTime() : NaN;
  return Number.isFinite(ms) && ms > now.getTime();
};

// ─── Premium: the recipient's one reply ─────────────────────────────────────

/** Bidi overrides/isolates and zero-width characters — invisible, and abusable. */
const INVISIBLE = /[‪-‮⁦-⁩​-‏﻿]/g;

/**
 * The recipient's reply text, cleaned. "" means "reject": nothing left after
 * stripping control, bidi and zero-width characters. Newlines are kept (CRLF
 * folded to LF, 3+ in a row folded to a blank line); capped at 280 code points
 * so a surrogate pair is never split.
 */
export function cleanReplyText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let s = raw.slice(0, 8000).replace(/\r\n?/g, "\n");
  s = s.replace(CONTROL_EXCEPT_NL, "").replace(INVISIBLE, "");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return Array.from(s).slice(0, PREMIUM_LIMITS.reply).join("").trim();
}

/**
 * The single atomic write for a reply — first write wins, like reactionWrite:
 * the guard only matches while `reactions.reply` is null or missing.
 */
export function replyWrite(
  text: string,
  now: Date
): { guard: Record<string, null>; set: Record<string, unknown> } {
  return { guard: { "reactions.reply": null }, set: { "reactions.reply": { text, at: now } } };
}
