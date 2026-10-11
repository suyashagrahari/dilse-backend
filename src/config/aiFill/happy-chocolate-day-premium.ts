import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-chocolate-day-premium — "The Sweetheart Chocolate Factory", the premium twin of happy-chocolate-day
 * (Valentine's week, 9 Feb). A bright, cute chocolate factory the sender builds for the recipient; she takes the tour
 * station by station, one little game each.
 *
 * Where each field shows: the golden ticket (extras.openingLine) at the gate; six truffles she packs into her box,
 * each a flavour (extras.flavours[i].name) with the reason it is in there (extras.flavours[i].reason); the full box's
 * label (extras.boxLine); photo 1 pressed into a giant chocolate bar (its caption under it); photos 2–4 dipped in
 * chocolate like strawberries, each showing its caption and note; the catch game's score unit (extras.catchPrize:
 * "23 kisses I owe you"); the line under the melting chocolate heart (extras.heartLine), then the letter signed with
 * extras.signOff; the voice-note line (premium.voiceCaption) in a music box; the last-piece line (extras.lastPiece);
 * then the keepsake "Box of Us" with extras.coupon, endLine, "est. {sinceDate}" and the sealed P.S.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-chocolate-day-premium.ts. Not declared: houseName (the page prints "{sender}'s Chocolate
 * Factory" when it is blank, and thin stories put the recipient's name there), sinceDate (a date the sender picks),
 * and every media / timing / switch premium field. The P.S. has no example: an example there leaks.
 */

const TRUFFLES = 6;

/** Long, intimate fields drifted into Hinglish on English stories full of Indian places: pin the choice. */
const SAME_LANGUAGE =
  " Same language as every other field on this page: when the sender's own sentences are English, this is English too, however many Indian names, places, foods and songs the story mentions.";

const truffleFields = (): AiFillField[] =>
  Array.from({ length: TRUFFLES }, (_, i) => [
    {
      path: `extras.flavours[${i}].name`,
      label: `Truffle ${i + 1} flavour`,
      kind: "text" as const,
      max: 24,
      guide: `The name of truffle ${i + 1} of the six she packs into her box, written like a cute chocolate-shop label: two or three words that pair a real ingredient with a word from the reason it goes with, so the name itself winks at the memory (a rainy drive → Monsoon mint crunch; late-night noodles → Midnight masala; her giggle → Giggle fizz caramel). Sentence case, under 22 characters. All six names different, and never a single bare ingredient word.${i === TRUFFLES - 1 ? " This last one is the special one, the heart-shaped gold truffle: its name says it is the last or the best one." : ""}`,
      example: i === 0 ? "Hazelnut crunch" : undefined,
    },
    {
      path: `extras.flavours[${i}].reason`,
      label: `Truffle ${i + 1} reason`,
      kind: "text" as const,
      max: 60,
      required: true,
      guide: `Why truffle ${i + 1} is in her box: one short, specific thing the sender loves about her, written as a noun phrase that completes 'In this one: …' on a little card, starting with 'your' or 'how you' (or 'tumhari' / 'jab tum' in Hinglish), lowercase start, no full stop. Take it from the story: a habit, a laugh, a phrase she says, something she does for the sender. At least four of the six carry a concrete detail from the story; when the story runs out, write a small everyday tenderness instead of inventing an event. Under 55 characters.${i === TRUFFLES - 1 ? " The sixth is the simplest and biggest reason: just her." : ""}` + VW_TONE,
      example: i === 0 ? "your laugh, the loud one" : undefined,
    },
  ]).flat();

/** Thin stories pushed the letter into inventing her habits for the joke: give the joke somewhere true to go. */
const THIN_LETTER =
  " When the story is only a sentence or two, the laugh-out-loud line teases the sender instead (the effort of building a whole chocolate factory, their own sweet tooth), never a habit, date or trip of theirs that the story does not mention.";

/** Thin stories got anniversary dinners, road trips and ducks in their captions: offer the true substitute. */
const THIN_CAPTION =
  "A story of a sentence or two names no moments at all: then every caption is 'us' plus what the story does say (us, year two · still us · just us · my favourite two years), never a dinner, trip, date, place or outfit.";
const THIN_NOTE =
  " When its caption is one of those plain 'us' captions, the note is one line about how the sender feels looking at the two of them in it, with no event, place, meal or outfit.";

const common = valentineCommon({
      dayName: "Chocolate Day",
      letterWhere:
        "It is hidden under a chocolate heart they melt with their thumb in the factory's melting room, and it types itself out line by line on cream wrapper paper, after a short line on the heart and before the sender's voice note. One chocolate image (melting, the last piece, sweet) is welcome once, never more.",
      letterMax: 3000,
      endLineWhere: "printed under their keepsake 'Box of Us' at the very end of the page.",
      photosWhere:
        "photo 1 is pressed into a giant chocolate bar they unwrap and its caption sits under it; photos 2, 3 and 4 are dipped in chocolate like strawberries, and each shows its caption on the polaroid and its note on a card. When the story names fewer moments than there are photos, the remaining captions are simply 'us' plus what the story does say (us, year two · us, still · just us) and their notes say how the sender feels looking at them, never a date, dress, meal, trip or event the story does not mention.",
      photoCount: 4,
      notes: true,
      signaturePrinted: "The page prints the sign-off field below it.",
      captionExtra: THIN_CAPTION,
    }).map((f) => {
      if (f.path === "letter") return { ...f, guide: f.guide + THIN_LETTER + SAME_LANGUAGE };
      if (/^photos\[\d+\]\.note$/.test(f.path)) return { ...f, guide: f.guide + THIN_NOTE };
      return f;
    });

export const chocolateDayPremium: AiFillTemplateSchema = {
  slug: "happy-chocolate-day-premium",
  audience: "partner",
  premise:
    "A bright, cute Chocolate Day page the sender builds for the recipient, shaped like a candy-pastel chocolate factory made just for them: they scratch a golden ticket, pack six kawaii truffles into a box (each flavour comes with a reason the sender loves them), unwrap a giant chocolate bar that turns out to be their photo, dip their photos in chocolate, play a little catch-the-chocolates game, melt a chocolate heart to find the letter, open a music box with the sender's voice, get the bigger half of the last piece, and pull the lever on a chocolate fountain whose river carries their photos into the box on the chorus of their song. Short, playful, specific and sweet, never cheesy or formal; light chocolate puns are welcome, one at a time. Every line stays true to the story: when the story is short, write simpler lines about what it does say rather than adding trips, habits or events of your own." +
    VW_LANGUAGE +
    " Indian place names, foods, trains and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...common.filter((f) => !f.path.startsWith("photos[")),
    {
      path: "extras.openingLine",
      label: "The fine print on her golden ticket",
      kind: "text",
      max: 60,
      required: true,
      guide: "The fine print on their golden ticket to the chocolate factory, written like real ticket small print in three short parts separated by ' · ', the last one promising forever or always, with one detail from the story where it fits (their city, their thing, their favourite treat). Under 52 characters.",
      example: "Admit one · unlimited chocolate · forever",
    },
    ...truffleFields(),
    {
      path: "extras.boxLine",
      label: "The label on her full box",
      kind: "text",
      max: 60,
      required: true,
      guide: "The label that pops onto the box once all six truffles are packed (and again at the finale, when the box is full of their photos): a short, sweet line in the sender's voice about what this box is made of (six reasons, the two of them, their years). One sentence or three tiny ones, 4–8 words in all, ends with a full stop.",
    },
    {
      path: "extras.catchPrize",
      label: "What each chocolate she catches is worth",
      kind: "text",
      max: 28,
      required: true,
      guide: "The unit of the score in a catch-the-chocolates game, printed right after the number ('23 ___'): a plural treat the sender promises them for every chocolate caught, in lowercase, ending with 'I owe you'. Take the treat from the story: the food, drink, dessert or favour they love most there. Only when the story has no such thing, use kisses. 2–5 words, under 26 characters, no number in it.",
      example: "kisses I owe you",
    },
    {
      path: "extras.heartLine",
      label: "The line inside the melting heart",
      kind: "text",
      max: 60,
      required: true,
      guide: "The line they find once the chocolate heart melts under their thumb, right before the letter: one tender sentence in the sender's voice about saving the sweetest part for them or how they melt the sender, with a small nod to the story if one fits. Starts with a capital letter, 5–10 words, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.lastPiece",
      label: "When she takes the last piece",
      kind: "text",
      max: 60,
      required: true,
      guide: "One piece of chocolate is left; the sender's button runs away, they take it, the bar snaps and the bigger half slides over to them with this line: a short, sweet promise about always giving them the bigger half, the last bite, the better seat (one detail from the story if it fits). 5–10 words, ends with a full stop.",
    },
    {
      path: "extras.coupon",
      label: "Her coupon",
      kind: "text",
      max: 50,
      required: true,
      guide: "A coupon printed in their keepsake that they can claim: one real, specific treat the sender promises, shaped like coupon text ('Valid for …'), built from the story (their café, their dessert, their city). Under 46 characters, ends with a full stop.",
      example: "Valid for one real chocolate date. My treat.",
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Forever yours, Rohan",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "Your note (caption for your voice note)",
      kind: "text",
      max: 90,
      guide: "One line in the sender's voice (always written, however short the story) shown in a little chocolate music box with their voice note, or, when there is none, typed out on its own as a message from them: first person, to them, one small detail or inside joke from the story, a little self-mocking. Under 85 characters, no hashtags." + SAME_LANGUAGE,
      example: "I tried to say this without smiling. Didn't work.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. they open from the keepsake at the very end of the factory tour. Its first line is one complete sentence on its own: 'Open only if' followed straight away, on that same line, by a moment or feeling specific to these two (in the story's language); then a blank line; then two to four short sentences to them in first person, quieter and more intimate than the letter, built on one specific detail from the story the letter did not use; when the story has no detail left (a story of a sentence or two never does), the condition and the sentences are about this exact moment instead (them reading this right now, the sender waiting to hear what they think, the years the story names), never a first date, trip or event the story does not mention. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE + SAME_LANGUAGE,
    },
    // The photo captions (which may stay empty) last.
    ...common.filter((f) => f.path.startsWith("photos[")),
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ["Won", "ka"].join(""), ["soul", "mate"].join("")],
};
