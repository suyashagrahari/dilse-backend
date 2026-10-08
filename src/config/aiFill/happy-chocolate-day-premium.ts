import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-chocolate-day-premium — "The Midnight Chocolatier", the ULTRA-PREMIUM twin of happy-chocolate-day. Owned by
 * that template's builder: started as a copy of ./happy-chocolate-day.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-chocolate-day.ts):
 * happy-chocolate-day — "Ek Dabba Pyaar" (Valentine's week, 9 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: boxSize (a visual choice).
 */
export const chocolateDayPremium: AiFillTemplateSchema = {
  slug: "happy-chocolate-day-premium",
  audience: "partner",
  premise:
    "A Chocolate Day page: the recipient pulls a ribbon and opens a box of foil-wrapped chocolates; peeling each piece reveals one 'sweet reason' the sender loves them, a gooey-centre piece reveals a photo, and the last heart truffle melts into the sender's letter. Cosy cocoa-and-gold mood, sweet and funny." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Chocolate Day",
      letterWhere: "It appears when the last heart-shaped truffle melts, written on the wrapper paper. A chocolate pun or 'kuch meetha ho jaaye' nod is welcome once, not more.",
      letterMax: 3000,
      endLineWhere: "under the empty box on the final screen.",
      photosWhere: "the photos sit in 'The Assortment', each one a chocolate in a paper cup with a menu label.",
      notes: true,
      captionExtra: "Write it as 'memory: flavour' — the moment, a colon and a space, then a made-up dessert-menu flavour that matches it (a spicy memory → chilli truffle; a rainy trip → hot cocoa). Flavours are generic words, never a product name. Under 38 characters in total.",
    }),
    {
      path: "extras.giftTag",
      label: "Gift tag on the box",
      kind: "text",
      max: 80,
      guide: "The little gift tag tied to the box ribbon, addressed to them. One sentence, sweet and teasing, with a nod to something from the story, under 75 characters." + VW_TONE,
      example: "For the person sweeter than every chocolate in this box.",
    },
    {
      path: "extras.reasons",
      label: "Sweet reasons (one per piece)",
      kind: "list",
      max: 9,
      itemMax: 90,
      required: true,
      guide: "Exactly 9 'sweet reasons' (shown as 'Reason #1'…), one under each chocolate's foil. Each is about THEM — something they do, say or are, taken from the story — said to them ('you'), with a little wit; never about what the sender misses or plans. No two about the same detail, and when the story runs out of details, use small true-sounding things about how they make the sender feel rather than repeating one. Under 85 characters each. Reason 5 is the soft gooey centre: the most tender one. Reason 9 is the heart truffle: the simplest, biggest one." + VW_TONE,
      example: "You steal my fries and then offer me one. Generous.",
    },
    {
      path: "extras.finalAsk",
      label: "One more piece…",
      kind: "text",
      max: 60,
      guide: "The playful last line offered as one more piece after the box is empty, inviting them to stay with the sender for good — in the story's language, in your own words. Under 55 characters.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "The one handwritten line printed under the sender's voice note, read just before they press play (or, if no voice note is recorded, shown as a short typed 'transmission' from the sender). First person, addressed to them, one small detail or inside joke from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. envelope at the very end of the page, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you miss me tonight / open only if you ever doubt this), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
