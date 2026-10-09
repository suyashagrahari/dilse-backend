import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-hug-day-premium — "The Twenty-Second Hug", the premium twin of happy-hug-day.
 *
 * "Come here." one word per screen; two black-and-white photos dragged together across the distance; then the
 * recipient holds a thumb on the sender's photo for twenty seconds while it blooms from black-and-white into colour,
 * a heartbeat slows to the sender's and their lines fade in, landing on the song's chorus. Then what the hugs feel
 * like (a line over each photo), the letter, the voice note, and a hug coupon to tear off and redeem.
 *
 * Client mirror: client/app/(templates)/_valentine/days/happy-hug-day-premium.ts (same keys + limits; PINNED_KEYS in
 * valentineDays.test.ts). `coupons` keeps the $2 key so an upgrade carries the coupons over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter, song drop…) are NOT extras — they live in
 * the top-level `premium` sub-document (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Twenty-Second Hug",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["ph3-held", "ph6-back"],
  extras: [
    /** Shown one word per screen ("Come here."). */
    { key: "openingLine", kind: "text", max: 40 },
    /** 0 = "too far". */
    { key: "distanceKm", kind: "number", min: 0, max: 20000, default: 860 },
    /** When the two photos meet. */
    { key: "meetLine", kind: "text", max: 50 },
    { key: "holdSeconds", kind: "number", min: 10, max: 30, default: 20 },
    { key: "heartbeatBpm", kind: "number", min: 50, max: 90, default: 64 },
    /** Fade in one by one during the hold. */
    { key: "hugLines", kind: "list", maxItems: 5, minItems: 2, itemMax: 60 },
    /** "What your hugs feel like": one line over each photo. */
    { key: "hugFeels", kind: "list", maxItems: 4, minItems: 2, itemMax: 60 },
    {
      key: "coupons",
      kind: "objlist",
      maxItems: 3,
      minItems: 1,
      item: [
        { key: "title", kind: "text", max: 30 },
        { key: "detail", kind: "text", max: 80 },
      ],
    },
    { key: "replyLine", kind: "text", max: 80 },
  ],
};

export default config;
