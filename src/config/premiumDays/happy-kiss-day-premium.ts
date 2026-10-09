import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-kiss-day-premium — "Mwah Booth", the premium twin of happy-kiss-day.
 *
 * A bright kissing booth: a lipstick twists up to open it, they kiss the
 * sender's photo three times, pick a kiss off a menu (forehead, cheek, nose,
 * hand), decorate a kiss-cam photo strip, catch flying kisses, open a letter
 * sealed with a kiss, hear a whispered voice note and answer "Kiss me?"
 * (Later runs away) — the yes lands on the song's chorus. Client mirror:
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
  title: "Mwah Booth",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["km1-gate", "km2-mwah", "km3-booth", "km4-catch", "km5-letter", "km6-yes"],
  extras: [
    /** lipstick = a lip print; cute = a heart stamp. Both family-safe. */
    { key: "kissStyle", kind: "enum", options: ["lipstick", "cute"], default: "lipstick" },
    { key: "lipShade", kind: "enum", options: ["ruby", "gulabi", "berry", "nude"], default: "ruby" },
    /** The line under their name on the lipstick (gate) screen. */
    { key: "openingLine", kind: "text", max: 60 },
    /** 1-based index into photos: the photo they kiss three times. */
    { key: "kissFrame", kind: "number", min: 1, max: 12, default: 1 },
    /** The kiss menu: one line per kind of kiss. */
    { key: "foreheadLine", kind: "text", max: 90 },
    { key: "cheekLine", kind: "text", max: 90 },
    { key: "noseLine", kind: "text", max: 90 },
    { key: "handLine", kind: "text", max: 90 },
    /** "Kisses I owe you", unlocked after the flying-kiss game. */
    { key: "kissNotes", kind: "list", maxItems: 6, minItems: 3, itemMax: 70 },
    /** The yes / later question before the finale. */
    { key: "question", kind: "text", max: 60 },
    /** YYYY-MM-DD; the keepsake strip counts the days since. */
    { key: "sinceDate", kind: "text", max: 10 },
    { key: "kissBackText", kind: "text", max: 80 },
  ],
};

export default config;
