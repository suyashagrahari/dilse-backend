import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-teddy-day-premium — "Made With a Heart", the premium twin of happy-teddy-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-teddy-day-premium.ts). The extras below started as a literal copy of
 * happy-teddy-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Made With a Heart",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pt1-parcel", "pt2-heart", "pt3-alive", "pt4-letter", "pt5-found", "pt6-sleep"],
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
};

export default config;
