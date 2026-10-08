import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-valentines-day-premium — "Our Film", the premium twin of happy-valentines-day (flagship of the tier).
 *
 * Their love story screened as a film: opening titles + a "Previously on…" week recap, a constellation, a
 * photo montage cut on the chorus, a three-chapter book, "By the numbers", the question in black-and-white
 * takes, and end credits with a post-credits date plan.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-valentines-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key
 * (weekLines, togetherSince, stats, metPlace, question, datePlan) so an upgrade carries them over. The chorus
 * second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "Our Film",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pv1-ticket", "pv2-starring", "pv3-stars", "pv4-please", "pv5-yes", "pv6-credits"],
  extras: [
    { key: "filmTitle", kind: "text", max: 40 },
    { key: "tagline", kind: "text", max: 70 },
    /** Seven lines, in order Rose → Kiss (index 0 = Rose Day); blanks are skipped. */
    { key: "weekLines", kind: "list", maxItems: 7, itemMax: 60 },
    { key: "metPlace", kind: "text", max: 40 },
    /** YYYY-MM-DD or "". */
    { key: "metDate", kind: "text", max: 10 },
    /** YYYY-MM-DD or "" (the computed numbers hide). */
    { key: "togetherSince", kind: "text", max: 10 },
    /** The letter's three chapter titles. */
    { key: "chapterTitles", kind: "list", maxItems: 3, itemMax: 24 },
    {
      key: "stats",
      kind: "objlist",
      maxItems: 3,
      item: [
        { key: "label", kind: "text", max: 30 },
        { key: "value", kind: "text", max: 24 },
      ],
    },
    { key: "question", kind: "text", max: 60 },
    /** One director's line per "No" take. */
    { key: "noTakes", kind: "list", maxItems: 6, itemMax: 50 },
    { key: "datePlan", kind: "text", max: 80 },
    /** YYYY-MM-DD or "" — the post-credits date (adds "Add to calendar"). */
    { key: "dateOn", kind: "text", max: 10 },
  ],
};

export default config;
