import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-valentines-day-premium — "Be My Valentine Carnival", the premium twin of happy-valentines-day (flagship).
 *
 * A pastel funfair made for her: she tears her ADMIT ONE ticket, pops heart balloons that spell the sender's line,
 * breaks a love-tester machine past 999%, opens gacha capsules holding their photos, rides a Ferris wheel of
 * memories, knocks over the seven cans of Valentine's week, opens the letter at the kissing-booth mailbox, hears the
 * voice note on a carnival radio, then the question, whose YES lands on the song's chorus with heart fireworks.
 * Ends on a ticket stub + photobooth strip keepsake.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-valentines-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key
 * (ticketLine, weekLines, togetherSince, question, noLines, datePlan) so an upgrade carries them over. The chorus
 * second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "Be My Valentine Carnival",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["vc1-ticket", "vc2-balloons", "vc3-meter", "vc4-letter", "vc5-please", "vc6-yes"],
  extras: [
    /** The fine print on her ADMIT ONE ticket (gate + keepsake stub). */
    { key: "ticketLine", kind: "text", max: 50 },
    /** One word per heart balloon (≤ 8 words are shown). */
    { key: "balloonLine", kind: "text", max: 48 },
    /** The broken love-tester's screen. */
    { key: "meterLine", kind: "text", max: 36 },
    /** Rose Day → Kiss Day, one per can at the prize stall. */
    { key: "weekLines", kind: "list", maxItems: 7, itemMax: 70 },
    /** YYYY-MM-DD or "" (the stub hides the days count). */
    { key: "togetherSince", kind: "text", max: 10 },
    /** On the carnival radio, next to the voice note. */
    { key: "songNote", kind: "text", max: 60 },
    { key: "question", kind: "text", max: 60 },
    /** What "No" says as it hides; after the last, No becomes a second Yes. */
    { key: "noLines", kind: "list", maxItems: 4, itemMax: 40 },
    /** "Next ride" on the stub. Optional. */
    { key: "datePlan", kind: "text", max: 80 },
  ],
};

export default config;
