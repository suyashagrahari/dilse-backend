import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-halloween-premium — "The Midnight Manor", the premium twin of happy-halloween.
 *
 * A moonlit haunted manor holds a midnight ball for one guest: an invitation,
 * an iron gate, memory candles, a portrait gallery, a spirit board, a spirit
 * radio, an invisible-ink letter, a witch's kitchen and a clock tower that
 * strikes twelve. Client mirror:
 * client/app/(templates)/_valentine/days/happy-halloween-premium.ts (same keys
 * and limits; PINNED_KEYS in valentineDays.test.ts pins them). `tone`,
 * `houseName`, `ingredients`, `question` and `yesLine` keep the $2 day's keys
 * so an upgrade carries them over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Midnight Manor",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  gifSlots: ["p1-invite", "p2-candle", "p3-portrait", "p4-seance", "p5-cauldron", "p6-yes"],
  extras: [
    /** Who it's for — the default question, the board's name, and gentle (family/kids) mode. */
    { key: "tone", kind: "enum", options: ["romantic", "friends", "family", "kids"], default: "romantic" },
    /** The manor's name (the iron gate's plaque, the portrait's plaque). */
    { key: "houseName", kind: "text", max: 40 },
    /** The night's name, printed on the invitation. */
    { key: "nightTitle", kind: "text", max: 40 },
    { key: "candleMemories", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
    /** A–Z after normalising on the client; the board spells it after their name. */
    { key: "spiritWord", kind: "text", max: 10, min: 2 },
    {
      key: "spiritQA",
      kind: "objlist",
      maxItems: 3,
      minItems: 1,
      item: [
        { key: "q", kind: "text", max: 60 },
        { key: "answer", kind: "enum", options: ["YES", "NO", "ALWAYS", "SOON"], default: "YES" },
        { key: "line", kind: "text", max: 70 },
      ],
    },
    {
      key: "ingredients",
      kind: "objlist",
      maxItems: 3,
      minItems: 3,
      item: [
        { key: "name", kind: "text", max: 30 },
        { key: "line", kind: "text", max: 70 },
      ],
    },
    { key: "prophecy", kind: "text", max: 100 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 80 },
    { key: "specialGuest", kind: "text", max: 40 },
  ],
};

export default config;
