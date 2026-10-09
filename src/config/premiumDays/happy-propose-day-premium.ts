import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-propose-day-premium — "The Premiere", the premium twin of happy-propose-day.
 *
 * Their relationship screened as a film: a ticket, a projector leader, opening titles, three acts cut from the
 * sender's photos with subtitles (how it started · the moment I knew · coming soon), the director's commentary
 * (voice note), the last page of the script (the letter), then the question as the final title card. On yes the
 * letterbox opens, the song drops and the credits roll.
 *
 * The client mirror is client/app/(templates)/_valentine/days/happy-propose-day-premium.ts (same keys and
 * limits); PINNED_KEYS in ../valentineDays.test.ts pins the order. Keys shared with the $2 day keep its key
 * (question, noLines, afterYes). The chorus second is the shared premium.songDropAt, not an extra.
 */
const config: ValentineDayConfig = {
  title: "The Premiere",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["pp4-please", "pp5-yes"],
  extras: [
    /** The film's title: ticket, opening title card, poster. */
    { key: "filmTitle", kind: "text", max: 40 },
    /** The poster tagline. */
    { key: "tagline", kind: "text", max: 70 },
    /** Act I subtitle: how it started. */
    { key: "actOne", kind: "text", max: 90 },
    /** Act II subtitle: the moment I knew. */
    { key: "actTwo", kind: "text", max: 90 },
    /** Act III: 1–3 "coming soon" trailer cards. */
    { key: "comingSoon", kind: "list", minItems: 1, maxItems: 3, itemMax: 48 },
    { key: "question", kind: "text", max: 60, min: 6 },
    /** What "No" says as it dodges, before it gives up. */
    { key: "noLines", kind: "list", maxItems: 4, itemMax: 28 },
    /** The sender's subtitle on the yes reveal. */
    { key: "afterYes", kind: "text", max: 120 },
    /** Inside-joke end credits. */
    {
      key: "credits",
      kind: "objlist",
      maxItems: 5,
      item: [
        { key: "role", kind: "text", max: 32 },
        { key: "name", kind: "text", max: 40 },
      ],
    },
    /** "Filmed on location in …" */
    { key: "location", kind: "text", max: 60 },
  ],
};

export default config;
