import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-kiss-day-premium — "A Thousand Kisses", the premium twin of happy-kiss-day.
 *
 * Kisses as the medium: a perfumed envelope, a wax seal, catching falling
 * kisses, two thousand kisses that assemble into their photo, a lipstick
 * letter on a mirror, a kiss booth strip, "kiss the screen" back. Client
 * mirror: client/app/(templates)/_valentine/days/happy-kiss-day-premium.ts
 * (same keys + limits; PINNED_KEYS in valentineDays.test.ts). kissStyle,
 * lipShade, openingLine, kissTarget, kissNotes and kissBackText keep the $2
 * keys so an upgrade carries them over.
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
    /** cute = family-safe X's, hearts, cheek kisses; lipstick = glam lip-prints, still sweet. */
    { key: "kissStyle", kind: "enum", options: ["cute", "lipstick"], default: "cute" },
    { key: "lipShade", kind: "enum", options: ["ruby", "gulabi", "berry", "nude"], default: "ruby" },
    /** Written on the perfumed envelope. */
    { key: "openingLine", kind: "text", max: 60 },
    { key: "kissTarget", kind: "number", min: 5, max: 30, default: 14 },
    /** "A kiss for…" slips that pop while they catch. */
    { key: "kissNotes", kind: "list", maxItems: 6, minItems: 3, itemMax: 70 },
    /** 1-based index into photos: the one that becomes the kiss mosaic. */
    { key: "mosaicPhoto", kind: "number", min: 1, max: 12, default: 1 },
    /** YYYY-MM-DD; the mosaic counts the days since. */
    { key: "sinceDate", kind: "text", max: 10 },
    /** 0 = count the days since sinceDate. */
    { key: "kissCount", kind: "number", min: 0, max: 99999, default: 0 },
    { key: "kissBackText", kind: "text", max: 80 },
  ],
};

export default config;
