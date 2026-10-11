import type { ValentineDayConfig } from "../valentineDays";

/**
 * happy-teddy-day-premium — "The Teddy House", the premium twin of happy-teddy-day.
 *
 * A bright honey-and-pink dollhouse her teddy moves into, one room per scene: a delivery box on the doorstep (a
 * sleepy teddy pops out), a satin heart she rubs warm, kisses and tucks into his chest so he wakes up and says his
 * first words (she names him), a wardrobe of accessories that each pop the sender's note, a sofa where every squeeze
 * makes him say the next bit of the letter, his photo album, a kitchen where catching treats unlocks his house rules
 * on the fridge, a toy phone ringing with the sender's voice, bedtime (pull the blanket up, a P.S. under his pillow),
 * then "Will you keep him forever?" on the song's drop as teddies rain into a heart around her photo, and an
 * Adoption Certificate keepsake.
 * Client mirror: client/app/(templates)/_valentine/days/happy-teddy-day-premium.ts (same keys and limits;
 * PINNED_KEYS in valentineDays.test.ts pins them). teddyName, parcelNote, firstWords, careLines, birthPlace,
 * temperament and signOff keep v2's keys; `outfit` keeps the $2 day's key and shape so an upgrade carries it over.
 *
 * Shared premium fields (voice note, scheduled unlock, reply, P.S. letter…) are NOT extras — they live in the
 * top-level `premium` sub-document (see PremiumFields in ../valentineDays.ts).
 */
const config: ValentineDayConfig = {
  title: "The Teddy House",
  premium: true,
  maxPhotos: 12,
  letterMax: 3000,
  asksQuestion: false,
  gifSlots: ["td1-hello", "td2-heart", "td3-dress", "td4-squeeze", "td5-sleep", "td6-yes"],
  extras: [
    { key: "teddyName", kind: "text", max: 20 },
    /** Handwritten on the delivery box's label. */
    { key: "parcelNote", kind: "text", max: 60 },
    /** What he says when he wakes up with his new heart. */
    { key: "firstWords", kind: "text", max: 50 },
    /** The wardrobe: each piece pops the sender's note when it goes on (the $2 day's shape). */
    {
      key: "outfit",
      kind: "objlist",
      maxItems: 4,
      item: [
        { key: "item", kind: "enum", options: ["bow", "sweater", "crown", "glasses", "scarf", "flower", "cap", "bowtie"], default: "bow" },
        { key: "note", kind: "text", max: 60 },
      ],
    },
    /** House rules on the fridge (love notes as rules), unlocked by catching treats. */
    { key: "careLines", kind: "list", maxItems: 5, minItems: 3, itemMax: 70 },
    /** Certificate fields. */
    { key: "birthPlace", kind: "text", max: 40 },
    { key: "temperament", kind: "text", max: 40 },
    /** Under the letter. */
    { key: "signOff", kind: "text", max: 40 },
    { key: "question", kind: "text", max: 60 },
    { key: "yesLine", kind: "text", max: 80 },
  ],
};

export default config;
