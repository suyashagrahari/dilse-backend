import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-rose-day-premium — "The Glasshouse Rose", the premium twin of happy-rose-day.
 *
 * A glasshouse at dusk: a fogged door with their name, thorns (hard times you got through), a garden of roses that
 * blooms in a heart on the song's drop, falling word-petals, a pressed-book letter, dew-drop photos and the rose
 * sealed under an engraved glass dome.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-rose-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key. The chorus
 * second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "The Glasshouse Rose",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pr1-door", "pr2-thorn", "pr3-petals", "pr4-letter", "pr5-memories", "pr6-forever"],
  extras: [
    { key: "roseColor", kind: "enum", options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"], default: "red" },
    { key: "colorReason", kind: "text", max: 90 },
    { key: "roseCount", kind: "enum", options: ["1", "3", "7", "9", "11", "12", "99"], default: "99" },
    { key: "openingLine", kind: "text", max: 70 },
    /** 0–5 gentle "hard times we got through" lines; empty = the thorn scene is skipped. */
    { key: "thorns", kind: "list", maxItems: 5, itemMax: 60 },
    /** ≤ 7 words, one per falling petal. */
    { key: "petalSentence", kind: "text", max: 60, min: 12 },
    /** Free text ("14 Feb 2022", "our first monsoon"). */
    { key: "sinceDate", kind: "text", max: 24 },
    { key: "engraving", kind: "text", max: 40 },
    { key: "secretLine", kind: "text", max: 80 },
    { key: "signOff", kind: "text", max: 40 },
    { key: "shayari", kind: "longtext", max: 160 },
  ],
};

export default config;
