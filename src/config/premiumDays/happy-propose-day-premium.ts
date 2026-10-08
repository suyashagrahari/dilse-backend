import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-propose-day-premium — "Look Up", the premium twin of happy-propose-day.
 *
 * A rooftop at night: the sender's nervous texts, a candle path (one reason each), a city of memory windows,
 * then a drone show that draws their initials, a heart, a ring box and the question; yes = sliding the ring on.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-propose-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key.
 * The chorus second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "Look Up",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pp1-nervous", "pp2-candles", "pp3-lookup", "pp4-please", "pp5-yes", "pp6-ticket"],
  extras: [
    /** 1–3 short "nervous texts" that open the page. */
    { key: "texts", kind: "list", maxItems: 3, minItems: 1, itemMax: 70 },
    /** 3–5 candle reasons. */
    { key: "reasons", kind: "list", maxItems: 5, minItems: 3, itemMax: 80 },
    {
      key: "moments",
      kind: "objlist",
      maxItems: 6,
      item: [
        { key: "when", kind: "text", max: 20 },
        { key: "what", kind: "text", max: 50 },
      ],
    },
    { key: "lookUpLine", kind: "text", max: 50 },
    /** e.g. "T ♥ K" — "" = derived from the names. */
    { key: "initials", kind: "text", max: 9 },
    { key: "question", kind: "text", max: 60, min: 6 },
    { key: "ringStyle", kind: "enum", options: ["solitaire", "heart", "band", "halo"], default: "solitaire" },
    { key: "stoneColor", kind: "enum", options: ["diamond", "ruby", "sapphire", "emerald", "rosegold"], default: "diamond" },
    { key: "handTone", kind: "enum", options: ["light", "medium", "tan", "deep"], default: "medium" },
    /** What "Let me think 🙈" says as it flees. */
    { key: "noLines", kind: "list", maxItems: 5, itemMax: 28 },
    { key: "afterYes", kind: "text", max: 120 },
    { key: "shayari", kind: "longtext", max: 160 },
  ],
};

export default config;
