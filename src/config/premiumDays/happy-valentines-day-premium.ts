import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-valentines-day-premium — "Our Film", the premium twin of happy-valentines-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-valentines-day-premium.ts). The extras below started as a literal copy of
 * happy-valentines-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Our Film",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pv1-ticket", "pv2-starring", "pv3-stars", "pv4-please", "pv5-yes", "pv6-credits"],
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
};

export default config;
