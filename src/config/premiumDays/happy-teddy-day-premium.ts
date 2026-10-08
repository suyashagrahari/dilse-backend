import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-teddy-day-premium — "Made With a Heart", the premium twin of happy-teddy-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-teddy-day-premium.ts). Extras mirror the client's
 * _valentine/days/happy-teddy-day-premium.ts (same keys + limits) and the
 * PINNED_KEYS entry in valentineDays.test.ts.
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
    { key: "furColor", kind: "enum", options: ["honey", "cocoa", "pink", "white", "lilac", "mint"], default: "honey" },
    { key: "eyeStyle", kind: "enum", options: ["button", "sparkle", "sleepy", "heart"], default: "sparkle" },
    { key: "pawInitial", kind: "text", max: 2 },
    { key: "accessory", kind: "enum", options: ["none", "bow", "scarf", "bowtie", "flower", "sweater", "glasses"], default: "scarf" },
    { key: "parcelNote", kind: "text", max: 80 },
    { key: "heartWhisper", kind: "text", max: 90, min: 6 },
    { key: "firstWords", kind: "text", max: 50 },
    { key: "squeezeLines", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
    { key: "bedtimeLine", kind: "text", max: 70 },
    { key: "sleepOver", kind: "enum", options: ["rain", "snow", "stars"], default: "rain" },
  ],
};

export default config;
