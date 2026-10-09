import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-chocolate-day-premium — "La Boîte", the premium twin of happy-chocolate-day.
 *
 * A chocolatier's box made for one person: a foil-stamped lid and a satin ribbon; under it, bonbons topped with the
 * couple's photos (each turns over to its flavour and memory), a cocoa-dusted heart kept for last, the letter on the
 * menu card, the voice note and a keepsake card.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-chocolate-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. The chorus second is the shared premium.songDropAt.
 */
const config: ValentineDayConfig = {
  title: "La Boîte",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pc3-yum", "pc6-box"],
  extras: [
    /** Foil-stamped on the lid and the menu card ("Maison Aryan"). */
    { key: "houseName", kind: "text", max: 28 },
    /** Over the closed box, before the lid comes off. */
    { key: "openingLine", kind: "text", max: 60 },
    /** Over the open box of photo bonbons. */
    { key: "boxLine", kind: "text", max: 60 },
    /** Bonbon i's flavour (bonbon i sits on photo i); blank = the page's house flavour. */
    { key: "flavours", kind: "objlist", maxItems: 9, item: [{ key: "name", kind: "text", max: 28 }] },
    /** On the cocoa-dusted heart, the last piece. */
    { key: "heartLine", kind: "text", max: 60 },
    /** Free text ("2022", "our first monsoon"), printed as "Est. …". */
    { key: "sinceDate", kind: "text", max: 24 },
    { key: "signOff", kind: "text", max: 40 },
    { key: "boxColor", kind: "enum", options: ["cacao", "raspberry", "midnight", "ivory"], default: "cacao" },
  ],
};

export default config;
