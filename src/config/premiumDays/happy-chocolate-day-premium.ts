import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-chocolate-day-premium — "The Midnight Chocolatier", the premium twin of happy-chocolate-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-chocolate-day-premium.ts). Extras mirror the client's
 * _valentine/days/happy-chocolate-day-premium.ts (same keys + limits) and the
 * PINNED_KEYS entry in valentineDays.test.ts.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Midnight Chocolatier",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pc1-open", "pc2-smash", "pc3-yum", "pc4-ticket", "pc5-photos", "pc6-box"],
  extras: [
    { key: "welcomeNote", kind: "text", max: 80 },
    {
      key: "reasons",
      kind: "objlist",
      maxItems: 6,
      minItems: 3,
      item: [
        { key: "flavour", kind: "enum", options: ["hazelnut", "sea-salt", "raspberry", "gold-leaf", "pistachio", "rose", "heart"], default: "hazelnut" },
        { key: "reason", kind: "text", max: 90 },
      ],
    },
    { key: "embossNames", kind: "bool", default: true },
    { key: "crackLine", kind: "text", max: 50 },
    { key: "ticketPromise", kind: "text", max: 70, min: 6 },
    { key: "letterTitle", kind: "text", max: 24 },
    { key: "drizzleWord", kind: "text", max: 6 },
    { key: "insideNote", kind: "text", max: 60 },
    { key: "boxColor", kind: "enum", options: ["raspberry", "midnight", "ivory", "blush"], default: "raspberry" },
    { key: "signOff", kind: "text", max: 40 },
  ],
};

export default config;
