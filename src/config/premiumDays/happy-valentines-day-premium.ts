import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-valentines-day-premium — "Us, Wrapped", the premium twin of happy-valentines-day (flagship of the tier).
 *
 * Their year in love as a Wrapped-style story: top song, top 3 memories, stats only they kept, the recipient's
 * top trait (scratch card), fast-cut reasons over their photos, a voice note, the letter, then the days-together
 * counter that slams to its number on the song's drop and cuts to their best photo, where the question waits.
 * Ends on a shareable "Us, Wrapped" card.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-valentines-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key
 * (togetherSince, stats, question, noLines, datePlan) so an upgrade carries them over. The chorus second is the
 * shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "Us, Wrapped",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pv4-please", "pv5-yes"],
  extras: [
    /** YYYY-MM-DD or "" (the big number shows "∞"). */
    { key: "togetherSince", kind: "text", max: 10 },
    /** The line under their top song. */
    { key: "songNote", kind: "text", max: 60 },
    { key: "topPhrase", kind: "text", max: 40 },
    { key: "topPlace", kind: "text", max: 40 },
    {
      key: "stats",
      kind: "objlist",
      maxItems: 2,
      item: [
        { key: "label", kind: "text", max: 30 },
        { key: "value", kind: "text", max: 24 },
      ],
    },
    /** Scratched off a foil card. */
    { key: "topTrait", kind: "text", max: 28 },
    /** Fast cuts over their photos. */
    { key: "reasons", kind: "list", maxItems: 5, itemMax: 70 },
    { key: "question", kind: "text", max: 60 },
    /** What the runaway "No" says, one per dodge; after the last, No becomes a second Yes. */
    { key: "noLines", kind: "list", maxItems: 4, itemMax: 40 },
    /** "Coming soon" on the Wrapped card. Optional. */
    { key: "datePlan", kind: "text", max: 80 },
  ],
};

export default config;
