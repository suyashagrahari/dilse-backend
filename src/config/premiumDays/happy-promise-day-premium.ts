import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-promise-day-premium — "The Red Thread", the premium twin of happy-promise-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-promise-day-premium.ts). The extras below started as a literal copy of
 * happy-promise-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
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
    { key: "envelopeLine", kind: "text", max: 60 },
    { key: "pinkyPrompt", kind: "text", max: 50 },
    { key: "promises", kind: "list", maxItems: 7, minItems: 3, itemMax: 90 },
    { key: "bigPromise", kind: "longtext", max: 140 },
    { key: "lockEngraving", kind: "text", max: 20 },
    { key: "lockStyle", kind: "enum", options: ["gold", "silver", "rosegold"], default: "gold" },
    { key: "lockFinale", kind: "bool", default: true },
  ],
};

export default config;
