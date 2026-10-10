import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-halloween-premium — "Boo-tiful Night", the premium twin of happy-halloween.
 *
 * Cute-spooky and romantic, never scary: a haunted mailbox with a ghost and a
 * letter, a treat bag of candies that open to sweet lines and cute dares, a
 * pumpkin they carve, a ghost photo booth hiding their photos, a love potion
 * they brew, a bat that delivers the letter, a spirit radio with the sender's
 * voice, "Will you be my boo?" on the song's drop, and a Boo License keepsake.
 * Client mirror: client/app/(templates)/_valentine/days/happy-halloween-premium.ts
 * (same keys and limits; PINNED_KEYS in valentineDays.test.ts pins them).
 * `tone`, `houseName`, `ingredients`, `potionSpell`, `question` and `yesLine`
 * keep the $2 day's keys (and shapes) so an upgrade carries them over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…)
 * are NOT extras — they live in the top-level `premium` sub-document
 * (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "Boo-tiful Night",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: true,
  /** The haunted piano loop — the default background music. */
  musicTrack: true,
  gifSlots: ["hb1-hello", "hb2-treats", "hb3-pumpkin", "hb4-booth", "hb5-potion", "hb6-yes"],
  extras: [
    /** Who it's for — the default question, and gentle (family/kids) mode. */
    { key: "tone", kind: "enum", options: ["romantic", "friends", "family", "kids"], default: "romantic" },
    /** The haunted house's name (the mailbox, the Boo License). */
    { key: "houseName", kind: "text", max: 40 },
    /** One line per candy in the treat bag ("Treat: …" / "Trick: …"). */
    { key: "treats", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
    /** Three bottles poured into the cauldron. */
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
    { key: "potionSpell", kind: "text", max: 90 },
    /** Printed on the Boo License. */
    { key: "perks", kind: "list", maxItems: 3, minItems: 1, itemMax: 40 },
    { key: "costumeDuo", kind: "text", max: 40 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 80 },
  ],
};

export default config;
