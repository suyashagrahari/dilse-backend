import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-hug-day-premium — "Hold Me for 20 Seconds", the premium twin of happy-hug-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-hug-day-premium.ts). The extras below started as a literal copy of
 * happy-hug-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Hold Me for 20 Seconds",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["ph1-window", "ph2-walk", "ph3-held", "ph4-mitten", "ph5-fort", "ph6-back"],
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
};

export default config;
