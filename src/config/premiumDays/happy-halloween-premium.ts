import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-halloween-premium — "A Night at the Manor", the premium twin of happy-halloween.
 *
 * Cute-spooky: a dark manor where the recipient finds the two of them — a
 * torch-lit Hall of Portraits with notes on the walls, a talking board that
 * spells their name and a word, a three-card tarot reading, a voice from
 * beyond, a candle-lit letter, and the last portrait in the dark (the reveal
 * on the song's drop), then the question and a costume-duo poster. Client
 * mirror: client/app/(templates)/_valentine/days/happy-halloween-premium.ts
 * (same keys and limits; PINNED_KEYS in valentineDays.test.ts pins them).
 * `tone`, `houseName`, `question` and `yesLine` keep the $2 day's keys so an
 * upgrade carries them over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "A Night at the Manor",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["h1-hall", "h6-yes"],
  extras: [
    /** Who it's for — the default question, and gentle (family/kids) mode. */
    { key: "tone", kind: "enum", options: ["romantic", "friends", "family", "kids"], default: "romantic" },
    /** The manor's name (the door at the start, the poster). */
    { key: "houseName", kind: "text", max: 40 },
    /** The night's name, over the last portrait and on the poster. */
    { key: "nightTitle", kind: "text", max: 40 },
    /** Notes scrawled on the walls of the Hall of Portraits. */
    { key: "wallNotes", kind: "list", maxItems: 3, minItems: 1, itemMax: 48 },
    /** A–Z after normalising on the client; the board spells it after their name. */
    { key: "spiritWord", kind: "text", max: 10, min: 2 },
    { key: "spiritLine", kind: "text", max: 80 },
    /** Past, Present, Future. */
    {
      key: "tarot",
      kind: "objlist",
      maxItems: 3,
      minItems: 3,
      item: [
        { key: "card", kind: "text", max: 24 },
        { key: "line", kind: "text", max: 90 },
      ],
    },
    { key: "costumeDuo", kind: "text", max: 40 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 80 },
  ],
};

export default config;
