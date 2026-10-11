import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-propose-day-premium — "The Little Proposal", the premium twin of happy-propose-day.
 *
 * A tiny, cute love story with a ring at the end: she knocks on a little door (a shy panda opens it), swipes the
 * story cards of how it started, taps through a comic of him rehearsing, finds the ring in one of three gift boxes,
 * opens his heart-sealed letter, hears his voice note, then the question. On yes the ring box opens on the song's
 * chorus, the ring lands on a heart-shaped photo, a sticker wall pops in, and she signs an "Officially Taken"
 * certificate with her ring finger.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-propose-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key
 * (teaser, moments, stoneColor, question, noLines, afterYes). The chorus second is premium.songDropAt.
 */
const config: ValentineDayConfig = {
  title: "The Little Proposal",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pp-door", "pp-story", "pp-peek", "pp-ask", "pp-please", "pp-yes"],
  extras: [
    /** The nervous hello when the little door opens. */
    { key: "teaser", kind: "text", max: 70 },
    /** Story cards: a label + one line each, paired with the photos in order. */
    {
      key: "moments",
      kind: "objlist",
      maxItems: 4,
      item: [
        { key: "when", kind: "text", max: 20 },
        { key: "what", kind: "text", max: 70 },
      ],
    },
    /** The 4-panel rehearsal comic. */
    { key: "rehearsal", kind: "list", maxItems: 4, itemMax: 60 },
    /** Notes in the two gift boxes without the ring. */
    { key: "decoys", kind: "list", maxItems: 2, itemMax: 48 },
    { key: "stoneColor", kind: "enum", options: ["diamond", "ruby", "rosegold"], default: "diamond" },
    { key: "question", kind: "text", max: 60, min: 6 },
    /** What "No" says as it runs, before it gives up. */
    { key: "noLines", kind: "list", maxItems: 5, itemMax: 28 },
    /** The sender's line under the yes sticker wall. */
    { key: "afterYes", kind: "text", max: 120 },
    /** The fine print on the "Officially Taken" certificate. */
    { key: "terms", kind: "list", maxItems: 3, itemMax: 48 },
  ],
};

export default config;
