import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-promise-day-premium — "The Red Thread", the premium twin of happy-promise-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-promise-day-premium.ts). Extras mirror the client's
 * _valentine/days/happy-promise-day-premium.ts (same keys + limits) and the
 * PINNED_KEYS entry in valentineDays.test.ts.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Red Thread",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pp1-gate", "pp2-pull", "pp3-knot", "pp4-rings", "pp5-vial", "pp6-promised"],
  extras: [
    { key: "gateLine", kind: "text", max: 70 },
    { key: "sharedSince", kind: "text", max: 24 },
    { key: "promises", kind: "list", maxItems: 6, minItems: 3, itemMax: 90 },
    { key: "bigPromise", kind: "longtext", max: 160 },
    { key: "futurePromise", kind: "longtext", max: 200 },
    { key: "futureDate", kind: "text", max: 10 },
    { key: "distanceKm", kind: "number", min: 0, max: 20000, default: 0 },
    { key: "threadColor", kind: "enum", options: ["red", "gold", "rose"], default: "red" },
    { key: "replyLine", kind: "text", max: 80 },
  ],
};

export default config;
