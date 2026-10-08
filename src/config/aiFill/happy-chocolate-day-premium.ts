import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-chocolate-day-premium — "The Midnight Chocolatier", the ULTRA-PREMIUM twin of
 * happy-chocolate-day (Valentine's week, 9 Feb). Owned by that template's builder.
 *
 * The page: a tiny chocolate atelier opens after hours for one person. They flip
 * a CLOSED sign, pour a chocolate heart, smash it with a gold hammer, taste the
 * truffles inside (each one a flavour + a reason), unwrap a golden ticket (a real
 * promise), read a letter whose first line is piped in chocolate on marble and
 * the rest written as a "Recipe for us" card, browse photos as bonbons in a lit
 * display case, then tie the box.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are in server/src/config/premiumDays/happy-chocolate-day-premium.ts.
 * Not declared: embossNames, boxColor (visual choices), drizzleWord (the page
 * derives it from their name), reasons[5] (five truffles is the sweet spot; the
 * sender may add a sixth), and every media / timing / switch premium field.
 */
// The heart is always the last truffle: it is the only option there and absent from the others.
const TRUFFLE_FLAVOURS = ["hazelnut", "sea-salt", "raspberry", "gold-leaf", "pistachio", "rose"] as const;
const TRUFFLES = 5;

const truffleFields = (): AiFillField[] => {
  const out: AiFillField[] = [];
  for (let i = 0; i < TRUFFLES; i++) {
    const last = i === TRUFFLES - 1;
    out.push({
      path: `extras.reasons[${i}].flavour`,
      label: `Truffle ${i + 1} flavour`,
      kind: "enum",
      options: last ? ["heart"] : TRUFFLE_FLAVOURS,
      guide: last
        ? "The flavour of the last, heart-shaped truffle."
        : "The flavour of this truffle, chosen to match its reason below: hazelnut for something warm or clever, sea-salt for sweet-with-a-bite or comfort on bad days, raspberry for something bright or cheeky, gold-leaf for the rare or precious thing, pistachio for something unexpected or soft, rose for the old-fashioned romantic one. Every truffle a different flavour; when nothing fits, use them in the listed order.",
    });
    out.push({
      path: `extras.reasons[${i}].reason`,
      label: `Truffle ${i + 1} reason`,
      kind: "text",
      max: 90,
      required: i < 3,
      guide:
        (last
          ? "The reason inside the last, heart-shaped truffle: the simplest, biggest reason of all, about them, in a few words. "
          : `The reason hidden inside truffle ${i + 1}, revealed when they bite it, under a flavour label. One thing about THEM — something they do, say or are, taken from the story — said to them ('you'), with a little wit. `) +
        "Never about what the sender misses or plans, and no two about the same detail. When the story runs out of details, write a small true-sounding thing about how they make the sender feel rather than repeating one. Under 80 characters." +
        VW_TONE,
      ...(last ? {} : { example: "You remember every tiny thing I say. Slightly scary. Mostly sweet." }),
    });
  }
  return out;
};

export const chocolateDayPremium: AiFillTemplateSchema = {
  slug: "happy-chocolate-day-premium",
  audience: "partner",
  premise:
    "A cinematic Chocolate Day page set in a tiny chocolate shop that opens at midnight just for the recipient. They pour and set a chocolate heart, smash it open with a little gold hammer, and taste the truffles hidden inside — each truffle carries a flavour and one reason the sender loves them. Then they unwrap a chocolate bar to find a golden ticket printed with a real, doable promise from the sender, read the sender's letter (its first line is piped in chocolate, the rest is written on the shop's 'Recipe for us' card), see their photos as labelled bonbons in a glass display case, and tie the box with a ribbon. Cosy, candle-lit, sweet and funny, made-by-hand." + VW_LANGUAGE + LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Chocolate Day",
      letterWhere:
        "It is the method on a cream 'Recipe for us' card in the chocolate shop, under a list of ingredients the page prints itself; you may lean into the recipe idea once (a pinch of this, a slow stir of that), never more.",
      letterMax: 3000,
      greetingPrinted: "The page pipes its own first line (the 'written in chocolate' field) above the letter.",
      signaturePrinted: "The page prints the sign-off field under it.",
      endLineWhere: "under the tied box on the final screen.",
      photosWhere: "each photo is a bonbon in a lit glass display case, and the caption is the little paper label in front of it.",
      notes: true,
      captionExtra:
        "Write it as 'memory: flavour': the moment, a colon and a space, then a made-up dessert-menu flavour that matches it (a spicy memory → chilli truffle; a rainy trip → hot cocoa). Flavours are generic words, never a product name. Under 38 characters in total.",
    }),
    {
      path: "extras.welcomeNote",
      label: "Note on the counter",
      kind: "text",
      max: 80,
      guide: "The handwritten note left on the shop counter for them when the lights come on: the sender kept this place open late, just for them. One sentence in the sender's voice, warm, a little playful, with a tiny nod to the story if one fits. Under 70 characters." + VW_TONE,
      example: "Kept the lights on past midnight. Don't tell the landlord.",
    },
    ...truffleFields(),
    {
      path: "extras.crackLine",
      label: "Line before the smash",
      kind: "text",
      max: 50,
      guide: "What the sender says as they hand over a little gold hammer to smash the chocolate heart open (something sweet is hidden inside). Playful and inviting, never sad or about real heartbreak. Under 45 characters." + VW_TONE,
      example: "Go on. Hit it. I made it unbreakable-ish.",
    },
    {
      path: "extras.ticketPromise",
      label: "Golden ticket: what it's good for",
      kind: "text",
      max: 70,
      required: true,
      guide: "The promise printed on the golden ticket they find inside a chocolate bar wrapper; they can redeem it with the sender. One concrete, doable treat or plan the sender will really give them — a specific date, outing, meal or favour that fits the story (their favourite place, a trip they keep talking about). Written as a short ticket line, not a sentence to them. Under 65 characters." + VW_TONE,
      example: "One long drive to the hills. Your playlist. My snacks.",
    },
    {
      path: "extras.letterTitle",
      label: "Written in chocolate (first line)",
      kind: "text",
      max: 24,
      guide: "The first line of the letter, piped in chocolate script on a marble slab: a short salutation to them with their name or pet name and a comma, in the same language and script as the story (a Hinglish story gets a Hinglish salutation). Under 20 characters.",
    },
    {
      path: "extras.insideNote",
      label: "Folded note inside the heart",
      kind: "text",
      max: 60,
      guide: "A folded note found inside the smashed heart, tucked next to the first photo. One short line about the moment in that first photo (the first caption's memory) — why it is a favourite. Under 55 characters. When the story names no moment for it, write a line about their smile or about keeping this for them instead of describing a memory." + VW_TONE,
      example: "That beach, that sunburn, that laugh.",
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the letter at the bottom of the recipe card: a short closing phrase plus the sender's first name, in the same language and script as the story, the way they would really sign off to this person. Under 35 characters.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "A one-line note from the sender shown with their voice message in the chocolate shop (or, without a recording, as a short handwritten note on its own). First person, addressed to them, one small detail or inside joke from the story. Under 85 characters, no hashtags." + VW_TONE,
      example: "Shop's closed. I stayed back anyway. Headphones on, please.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. tucked under the box at the very end. Begin with an 'open only if…' condition as its own first line, specific to these two (open only if you miss me tonight / open only if you're craving something sweet at 2 a.m.), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use; when the story has no detail left, make it a small promise or a feeling instead, never an invented memory. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ["Won", "ka"].join("")],
};
