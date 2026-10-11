import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-promise-day-premium — "The Pinky Promise Club", the premium twin of happy-promise-day.
 *
 * Little promises, sealed forever, in a club with exactly two members: she hooks his pinky, pulls paper-star
 * promises out of a jar, signs the club's "Terms & Cuddle-tions" with her finger, strings a letter-bead bracelet,
 * unlocks his diary to read the letter, plays his voice on a cassette, flips the sticky-note promises on their
 * photos, then picks the promises she gives back. On the song's chorus the love lock clicks shut, the key flies off
 * as a shooting star and every promise floats up as a paper lantern; the keepsake is her membership card.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-promise-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day or v2 keep their key
 * (envelopeLine, pinkyPrompt, promises, bigPromise, lockEngraving, sinceDate). The chorus second is
 * premium.songDropAt.
 */
const config: ValentineDayConfig = {
  title: "The Pinky Promise Club",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pk-pinky", "pk-jar", "pk-stamp", "pk-bracelet", "pk-lock", "pk-yes"],
  extras: [
    /** The club's invitation, under their name on the gate. */
    { key: "envelopeLine", kind: "text", max: 60 },
    /** The heading over the two pinkies. */
    { key: "pinkyPrompt", kind: "text", max: 50 },
    /** His welcome once the pinkies hook. */
    { key: "welcomeLine", kind: "text", max: 80 },
    /** The paper stars in the jar. */
    { key: "promises", kind: "list", maxItems: 7, minItems: 3, itemMax: 90 },
    /** The golden star, pulled out last. */
    { key: "bigPromise", kind: "longtext", max: 140 },
    /** "Terms & Cuddle-tions" she signs. */
    { key: "clubRules", kind: "list", maxItems: 3, itemMax: 60 },
    /** Letters (A–Z) she strings on the bracelet; the client falls back to the name or "US". */
    { key: "beadWord", kind: "text", max: 6 },
    /** The sticky-note promise on each photo, in order. */
    { key: "stickyPromises", kind: "list", maxItems: 6, itemMax: 70 },
    /** The chips she can promise back at the love lock. */
    { key: "askBack", kind: "list", maxItems: 5, itemMax: 50 },
    { key: "lockEngraving", kind: "text", max: 20 },
    /** YYYY-MM-DD; "member since" on the card. */
    { key: "sinceDate", kind: "text", max: 10 },
  ],
};

export default config;
