import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-kiss-day-premium — "A Thousand Kisses", the premium twin of happy-kiss-day.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-kiss-day-premium.ts). The extras below started as a literal copy of
 * happy-kiss-day's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "A Thousand Kisses",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pk1-shy", "pk2-catch", "pk3-wow", "pk4-mirror", "pk5-booth", "pk6-back"],
  extras: [
    { key: "kissStyle", kind: "enum", options: ["cute", "lipstick"], default: "cute" },
    { key: "lipShade", kind: "enum", options: ["ruby", "gulabi", "berry"], default: "ruby" },
    { key: "openingLine", kind: "text", max: 60 },
    { key: "kissTarget", kind: "number", min: 5, max: 30, default: 14 },
    { key: "kissNotes", kind: "list", maxItems: 5, itemMax: 60 },
    { key: "coupons", kind: "list", maxItems: 4, itemMax: 50 },
    { key: "kissBackText", kind: "text", max: 80 },
  ],
};

export default config;
