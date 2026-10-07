import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-chocolate-day — "Ek Dabba Pyaar" (Valentine's week, 9 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: boxSize (a visual choice).
 */
export const chocolateDay: AiFillTemplateSchema = {
  slug: "happy-chocolate-day",
  audience: "partner",
  premise:
    "A Chocolate Day page: the recipient pulls a ribbon and opens a box of foil-wrapped chocolates; peeling each piece reveals one 'sweet reason' the sender loves them, a gooey-centre piece reveals a photo, and the last heart truffle melts into the sender's letter. Cosy cocoa-and-gold mood, sweet and funny." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Chocolate Day",
      letterWhere: "It appears when the last heart-shaped truffle melts, written on the wrapper paper. A chocolate pun or 'kuch meetha ho jaaye' nod is welcome once, not more.",
      letterMax: 1500,
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
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
