import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-hug-day-premium — "The Hug Passport" (v3), the premium twin of happy-hug-day.
 *
 * Collect every kind of hug: her own Hug Passport and a bear with open arms open the page; five short gesture hugs
 * (bear, back, twirl, pat-pat, long-distance) each stamp the passport with one of her photos as the souvenir; then the
 * letter by hug mail, the voice from a purring plush, hug coupons she can redeem, and one last question whose yes
 * slams the Forever stamp down on the chorus. It ends on her finished passport.
 *
 * Client mirror: client/app/(templates)/_valentine/days/happy-hug-day-premium.ts (same keys + limits; PINNED_KEYS in
 * valentineDays.test.ts). `characters` and `coupons` keep the $2 keys so an upgrade carries them over; openingLine,
 * distanceKm, meetLine, hugLines and replyLine keep v2's.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter, song drop…) are NOT extras — they live in
 * the top-level `premium` sub-document (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Hug Passport",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["hp1-run", "hp2-bear", "hp3-back", "hp4-far", "hp5-coupon", "hp6-yes"],
  extras: [
    /** In the open-armed bear's speech bubble on the cover. */
    { key: "openingLine", kind: "text", max: 40 },
    { key: "characters", kind: "enum", options: ["bear-bunny", "bear-bear", "cat-cat", "panda-bear"], default: "bear-bunny" },
    /** His line for each hug, in order: bear, back, twirl, pat-pat. */
    { key: "hugLines", kind: "list", maxItems: 4, minItems: 4, itemMax: 70 },
    /** The long-distance hug; 0 = "even next door is too far". */
    { key: "distanceKm", kind: "number", min: 0, max: 20000, default: 860 },
    /** When the two phones meet. */
    { key: "meetLine", kind: "text", max: 50 },
    {
      key: "coupons",
      kind: "objlist",
      maxItems: 6,
      minItems: 1,
      item: [
        { key: "title", kind: "text", max: 30 },
        { key: "detail", kind: "text", max: 80 },
      ],
    },
    /** Her WhatsApp message when she redeems a coupon. */
    { key: "replyLine", kind: "text", max: 80 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 70 },
    /** Her title on the passport ("VIP Hugger"). */
    { key: "hugTitle", kind: "text", max: 24 },
  ],
};

export default config;
