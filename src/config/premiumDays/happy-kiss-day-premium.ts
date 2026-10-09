import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-kiss-day-premium — "Photo Booth", the premium twin of happy-kiss-day.
 *
 * A vintage photo booth: four flashes print a four-frame strip of their
 * photos on the song's drop, captions on the back of each frame, the letter
 * on a booth receipt they tear off, then they kiss the screen and the kiss
 * lands on the strip. Client mirror:
 * client/app/(templates)/_valentine/days/happy-kiss-day-premium.ts (same keys
 * + limits; PINNED_KEYS in valentineDays.test.ts). kissStyle, lipShade,
 * openingLine, kissNotes and kissBackText keep the $2 keys so an upgrade
 * carries them over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Photo Booth",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pb1-booth", "pb2-kiss"],
  extras: [
    /** lipstick = a lip-print; cute = a heart stamp. Both family-safe. */
    { key: "kissStyle", kind: "enum", options: ["lipstick", "cute"], default: "lipstick" },
    { key: "lipShade", kind: "enum", options: ["ruby", "gulabi", "berry", "nude"], default: "ruby" },
    /** mono = the classic black-and-white strip. */
    { key: "stripTone", kind: "enum", options: ["mono", "colour"], default: "mono" },
    /** The line under their name on the booth curtain. */
    { key: "openingLine", kind: "text", max: 60 },
    /** 1-based index into photos: the one printed last, as "the kiss". */
    { key: "kissFrame", kind: "number", min: 1, max: 12, default: 4 },
    /** "Kisses owed" line items on the receipt. */
    { key: "kissNotes", kind: "list", maxItems: 6, minItems: 3, itemMax: 70 },
    /** YYYY-MM-DD; the receipt counts the days since. */
    { key: "sinceDate", kind: "text", max: 10 },
    { key: "kissBackText", kind: "text", max: 80 },
  ],
};

export default config;
