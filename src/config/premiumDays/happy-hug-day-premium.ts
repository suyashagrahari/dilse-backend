import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-hug-day-premium — "Hold Me for 20 Seconds", the premium twin of happy-hug-day.
 *
 * A sensory 20-second hug: wipe a frosted window, drag the two of you
 * together, hold the phone with both thumbs while heat silhouettes merge,
 * mittens to rub warm, a hoodie letter, a blanket fort, a hug back. Client
 * mirror: client/app/(templates)/_valentine/days/happy-hug-day-premium.ts
 * (same keys + limits; PINNED_KEYS in valentineDays.test.ts). `coupons` keeps
 * the $2 key so an upgrade carries the passes over.
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
    { key: "frostLine", kind: "text", max: 50 },
    /** 0 = "too far". */
    { key: "distanceKm", kind: "number", min: 0, max: 20000, default: 860 },
    { key: "holdSeconds", kind: "number", min: 10, max: 30, default: 20 },
    { key: "heartbeatBpm", kind: "number", min: 50, max: 90, default: 64 },
    { key: "hugLines", kind: "list", maxItems: 5, minItems: 2, itemMax: 60 },
    {
      key: "weatherHugs",
      kind: "objlist",
      maxItems: 6,
      minItems: 3,
      item: [
        { key: "when", kind: "text", max: 28 },
        { key: "note", kind: "text", max: 120 },
      ],
    },
    {
      key: "coupons",
      kind: "objlist",
      maxItems: 4,
      minItems: 2,
      item: [
        { key: "title", kind: "text", max: 30 },
        { key: "detail", kind: "text", max: 80 },
      ],
    },
    { key: "hoodieTag", kind: "text", max: 24 },
    { key: "replyLine", kind: "text", max: 80 },
  ],
};

export default config;
