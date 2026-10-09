import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-teddy-day-premium — "Adoption Papers", the premium twin of happy-teddy-day.
 *
 * A parcel tag, a real teddy with a woven name tag, his file (the couple's photos as exhibits, satin care labels
 * that flip to love notes, the sender's letter, the voice note), then a typeset Certificate of Adoption the
 * recipient signs with a finger; the gold seal presses and ADOPTED is stamped on the song's drop.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-teddy-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys kept from v1 keep their key (teddyName,
 * parcelNote, firstWords). The chorus second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "Adoption Papers",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pt3-alive", "pt6-sleep"],
  extras: [
    { key: "teddyName", kind: "text", max: 20 },
    /** The manila parcel tag on the gate. */
    { key: "parcelNote", kind: "text", max: 60 },
    /** What the teddy says the first time he is squeezed. */
    { key: "firstWords", kind: "text", max: 50 },
    /** Certificate fields. */
    { key: "birthPlace", kind: "text", max: 40 },
    { key: "temperament", kind: "text", max: 40 },
    /** The satin care labels (love notes as instructions). */
    { key: "careLines", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
    { key: "signOff", kind: "text", max: 40 },
  ],
};

export default config;
