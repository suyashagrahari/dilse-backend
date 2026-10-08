import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-halloween-premium — "The Midnight Manor", the premium twin of happy-halloween.
 *
 * Owned by this template's builder: edit only this file (and
 * config/aiFill/happy-halloween-premium.ts). The extras below started as a literal copy of
 * happy-halloween's; change them freely, then keep the client mirror and the
 * PINNED_KEYS entry in valentineDays.test.ts in step.
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
    /** Who it's for — changes the default question, the license and kids-safe mode. */
    { key: "tone", kind: "enum", options: ["romantic", "friends", "family", "kids"], default: "romantic" },
    { key: "houseName", kind: "text", max: 40 },
    { key: "trickLine", kind: "text", max: 80 },
    { key: "carveWord", kind: "text", max: 10 },
    {
      key: "costume",
      kind: "enum",
      options: ["ghost", "witch", "vampire", "pumpkin", "black-cat", "skeleton", "mummy", "bat"],
      default: "ghost",
    },
    { key: "costumeWhy", kind: "text", max: 70 },
    {
      key: "ingredients",
      kind: "objlist",
      maxItems: 5,
      minItems: 3,
      item: [
        { key: "name", kind: "text", max: 30 },
        { key: "line", kind: "text", max: 70 },
      ],
    },
    { key: "potionSpell", kind: "text", max: 90 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 80 },
  ],
};

export default config;
