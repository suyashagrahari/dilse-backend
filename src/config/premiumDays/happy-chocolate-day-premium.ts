import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-chocolate-day-premium — "The Midnight Chocolatier", the premium twin of happy-chocolate-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-chocolate-day-premium.ts). The extras below started as a literal copy of
 * happy-chocolate-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
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
    { key: "giftTag", kind: "text", max: 80 },
    { key: "boxSize", kind: "enum", options: ["9", "6"], default: "9" },
    { key: "reasons", kind: "list", maxItems: 9, minItems: 6, itemMax: 90 },
    { key: "finalAsk", kind: "text", max: 60 },
  ],
};

export default config;
