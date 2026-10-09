import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-rose-day-premium — "The Rose Garden", the premium twin of happy-rose-day.
 *
 * A little garden that grows for them: a seed packet with their name, a sprout they water, a rose they colour,
 * loves-me-loves-me-not, the letter tied to a rose at their door, the voice note from a singing rose, a bouquet
 * of their photos, one sweet question (roses bloom across the screen on the yes) and a diary-page keepsake.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-rose-day-premium.ts (same keys and limits);
 * PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key. The chorus
 * second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "The Rose Garden",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["rg1-peek", "rg2-water", "rg3-blush", "rg4-lovesme", "rg5-note", "rg6-yes"],
  extras: [
    { key: "roseColor", kind: "enum", options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"], default: "red" },
    { key: "colorReason", kind: "text", max: 90 },
    /** Over the pot, while they water the sprout. */
    { key: "openingLine", kind: "text", max: 60 },
    /** The yes/no question near the end ("Will you keep my rose forever?"). */
    { key: "question", kind: "text", max: 60 },
    /** Shown as the roses bloom after the yes. */
    { key: "yesLine", kind: "text", max: 70 },
    /** Free text ("14 Feb 2022", "our first monsoon"), written on the diary-page keepsake. */
    { key: "sinceDate", kind: "text", max: 24 },
    { key: "signOff", kind: "text", max: 40 },
    { key: "shayari", kind: "longtext", max: 160 },
  ],
};

export default config;
