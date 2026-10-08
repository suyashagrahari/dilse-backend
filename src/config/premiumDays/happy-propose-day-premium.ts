import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-propose-day-premium — "Look Up", the premium twin of happy-propose-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-propose-day-premium.ts). The extras below started as a literal copy of
 * happy-propose-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Look Up",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pp1-nervous", "pp2-candles", "pp3-lookup", "pp4-please", "pp5-yes", "pp6-ticket"],
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
    { key: "noLines", kind: "list", maxItems: 5, itemMax: 28 },
    { key: "afterYes", kind: "text", max: 120 },
    { key: "shayari", kind: "longtext", max: 160 },
  ],
};

export default config;
