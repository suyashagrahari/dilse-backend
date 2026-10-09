import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-rose-day-premium — "The Rose Garden", the premium twin of happy-rose-day: a seed packet with the
 * recipient's name, a sprout they water, a rose they colour, loves-me-loves-me-not, the letter tied to a rose at
 * their door, the sender's voice from a singing rose, a bouquet of their photos they arrange, one sweet yes/no
 * question (roses bloom across the screen on the yes) and a diary-page keepsake.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-rose-day-premium.ts. Four photo captions + notes (the bouquet flowers).
 * roseColor is declared so the colour and its reason agree (live runs named the story's colour in the reason).
 * Not declared: sinceDate (a date the sender picks), the optional couplet (live runs
 * wrote it in Hinglish for English stories; the sender adds one by hand), and every media/music/drop/unlock field.
 * The P.S. has no example: an example there leaks into the other fields.
 */
export const roseDayPremium: AiFillTemplateSchema = {
  slug: "happy-rose-day-premium",
  audience: "partner",
  premise:
    "A bright, cute, playful Rose Day page: a little rose garden that grows for the recipient. They tear open a seed packet with their name on it, water a sprout in a pot until it grows a bud, pick the colour of their rose, play loves-me-loves-me-not on its petals (it always ends on 'loves me'), pull a ribbon to untie the sender's letter from a rose left at their door, hear the sender's voice, arrange their photos into a bouquet, and answer one sweet yes/no question; when they say yes, roses bloom all over the screen. It ends on a diary page with the bouquet pressed inside. The feeling is sweet, warm and a little teasing, like a boyfriend's real texts: short, specific, funny, never formal or poetic. Every line stays true to the story: when the story is short, write simpler lines about what it does say (who they are to each other, how long, how it feels) rather than adding trips, habits or events of your own." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Rose Day",
      letterWhere: "It is tied with a ribbon to a rose left at their door; they pull the ribbon and the letter types itself out on a little notepaper card.",
      letterMax: 3000,
      endLineWhere: "the very last line, handwritten on the diary page with the pressed bouquet and both their names.",
      photosWhere: "the photo is one flower of the bouquet they arrange, and the caption is written on its tag. When the story names fewer than four moments, the remaining captions and notes simply describe the two of them as the story does (married, best friends, years together) and add no new event, place or object.",
      photoCount: 4,
      notes: true,
      signaturePrinted: "The page already prints the sign-off field below it.",
    }),
    {
      path: "extras.openingLine",
      label: "The first line",
      kind: "text",
      max: 60,
      guide: "The first line they read, over a little pot with a sprout they are about to water: in the sender's voice, says playfully that the sender grew them something, shaped by this couple's story (distance, how long they have been together, what they are to each other). One short sentence, 5–10 words, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.question",
      label: "Your question",
      kind: "text",
      max: 60,
      guide: "The one sweet yes/no question near the end, over a rose in a pot, with a Yes button and a shy No that wilts and runs away. It asks them to keep the sender's rose (or the sender) for good, in the sender's own words, nudged by what the story says they are to each other (dating, engaged, married). 4–9 words, ends with a question mark." + VW_TONE,
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 70,
      guide: "One short line that appears as roses bloom across the whole screen right after the recipient tapped yes. It is the SENDER reacting to their yes, in first person, to them: relief, delight or a little tease about how quickly (or slowly) they said it, maybe handing them the rose for good. It reacts to their answer and never answers the question itself. 4–10 words, can end with one emoji, written in the same language as the story's own sentences (a Hinglish story gets a Hinglish line here too)." + VW_TONE,
    },
    {
      path: "extras.roseColor",
      label: "Your rose's colour",
      kind: "enum",
      options: ["red", "pink", "lavender", "peach", "white", "yellow", "orange", "coral"],
      guide: "The colour of their rose. Pick the colour the story itself ties to them (something they wore, their favourite flower, a rose the sender once gave them); when the story names no colour, 'red' for a partner or spouse, 'pink' for a crush or a new relationship.",
    },
    {
      path: "extras.colorReason",
      label: "Why this rose colour",
      kind: "text",
      max: 90,
      guide: "One sentence on a sticky note next to their rose, saying why the sender picked the rose colour chosen above for them: tie that colour to a real thing or moment from the story. Under 85 characters." + VW_TONE,
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Handwritten under the letter. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Forever yours, Rohan",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide: "One line shown under the sender's voice note, next to a little singing rose (or, when there is no recording, in the rose's speech bubble as the sender's own words). First person, addressed to them, one small detail or inside joke from the story, as if said out loud. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. behind a wax seal under the diary page at the very end, labelled 'open only if…'. Begin with that condition as its own first line, 'Open only if' followed by a moment or feeling taken from this couple's story, then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN],
};
