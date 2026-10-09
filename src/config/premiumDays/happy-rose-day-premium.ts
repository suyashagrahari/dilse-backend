import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-rose-day-premium — "The Bloom of Us", the premium twin of happy-rose-day.
 *
 * The buyer's photos are the petals: a velvet bud they hold to warm, which unfurls on the song's drop into a rose
 * whose every petal is one of their photos; then photos pressed under vellum, the letter, the voice note and a
 * keepsake card.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-rose-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key. The chorus
 * second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "The Bloom of Us",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["pr3-petals", "pr6-forever"],
  extras: [
    { key: "roseColor", kind: "enum", options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"], default: "red" },
    { key: "colorReason", kind: "text", max: 90 },
    /** Over the closed bud, before it is warmed open. */
    { key: "openingLine", kind: "text", max: 60 },
    /** Over the open rose of photos. */
    { key: "bloomLine", kind: "text", max: 60 },
    /** Free text ("14 Feb 2022", "our first monsoon"), printed on the keepsake card. */
    { key: "sinceDate", kind: "text", max: 24 },
    { key: "signOff", kind: "text", max: 40 },
    { key: "shayari", kind: "longtext", max: 160 },
  ],
};

export default config;
