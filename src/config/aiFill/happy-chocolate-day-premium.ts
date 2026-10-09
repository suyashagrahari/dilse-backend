import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-chocolate-day-premium — "La Boîte", the premium twin of happy-chocolate-day (Valentine's week, 9 Feb).
 *
 * The page: a chocolatier's box made for one person. The recipient pulls the ribbon, lifts the lid, and on the song's
 * chorus the tissue parts on up to nine bonbons, each topped with one of the couple's photos. Tapping a bonbon turns it
 * over to its flavour (extras.flavours[i].name, bonbon i sits on photo i) and the memory it tastes of (the photo's
 * caption + note). The last piece is a heart dusted in cocoa (extras.heartLine), then the letter on the box's menu
 * card ("Notes from the chocolatier", headed with extras.houseName), the voice note and a keepsake card (the lid).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-chocolate-day-premium.ts. Four photos and four flavours are declared (six left the letter missing on a Hinglish run) (the demo seeds nine; the
 * page names the rest from the house list). Not declared: houseName (the page uses 'Maison {sender}'; live runs put the recipient's name there on thin stories), sinceDate (a date the sender picks), boxColor (a visual
 * choice), and every media / timing / switch premium field. The P.S. has no example: an example there leaks.
 */
const PIECES = 4;

const flavourFields = (): AiFillField[] =>
  Array.from({ length: PIECES }, (_, i) => ({
    path: `extras.flavours[${i}].name`,
    label: `Bonbon ${i + 1} flavour`,
    kind: "text" as const,
    max: 28,
    guide: `The flavour of bonbon ${i + 1}, which sits on photo ${i + 1} and goes with that photo's caption: a short dessert-menu flavour that matches the feeling of that memory (a rainy evening → hot cocoa praline; a spicy street-food night → chilli dark; a first anniversary → champagne truffle). Built from real flavours and ingredients (caramel, coffee, chai, raspberry, mango, cardamom, hazelnut…), optionally with one place or moment word from the story; generic words, sentence case, 1–4 words, under 24 characters. Every bonbon a different flavour. When the caption for photo ${i + 1} is empty, pick a classic (salted caramel, hazelnut praline, raspberry ganache…).`,
    example: i === 0 ? "Salted caramel" : undefined,
  }));

export const chocolateDayPremium: AiFillTemplateSchema = {
  slug: "happy-chocolate-day-premium",
  audience: "partner",
  premise:
    "A cinematic Chocolate Day page shaped like a luxury chocolatier's box made by the sender for one person. The recipient pulls a satin ribbon, lifts the lid, and on the chorus of the sender's song the tissue parts on a box of glossy bonbons, each one topped with a photo of the two of them. Tapping a bonbon turns it over to its flavour and the memory it tastes of. The last piece is a ruby heart dusted in cocoa that they brush clean, then the sender's letter printed on the box's cream menu card, the sender's voice, and a keepsake card. Elegant, warm, slow and a little playful: the feeling is 'every piece of this is us'. Every line stays true to the story: when the story is short, write simpler lines about what it does say (who they are to each other, how long, how it feels) rather than adding trips, habits or events of your own. When the story names a particular chocolate bar, call it simply 'chocolate' or 'your favourite chocolate'." +
    VW_LANGUAGE +
    LANGUAGE_BY_WORDS +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Chocolate Day",
      letterWhere: "It is printed on the chocolate box's cream menu card under the heading 'Notes from the chocolatier', after the last heart-shaped piece, and reveals itself paragraph by paragraph. You may use one chocolate image (patience, tempering, the last piece) once, never more. A chocolate bar the story names becomes simply 'chocolate' or 'your favourite chocolate' in the letter.",
      letterMax: 3000,
      greetingPrinted: "The page prints 'Notes for {their name}' above the letter.",
      endLineWhere: "the very last line, set large over the keepsake card (the box's lid with both their names).",
      photosWhere: "the photo is the glossy top of a bonbon; when they turn the bonbon over, its flavour shows and this caption is the memory it tastes of, set large in italic. When the story names fewer moments than there are photos, the remaining captions and notes simply describe the two of them as the story does (married, best friends, years together) and add no new event, place or object.",
      photoCount: PIECES,
      notes: true,
      signaturePrinted: "The page prints the sign-off field below it.",
    }),
    {
      path: "extras.openingLine",
      label: "The line over the closed box",
      kind: "text",
      max: 60,
      guide: "The first line they read, over the closed, ribbon-tied box, just before they lift the lid: in the sender's own voice, a quiet, slightly playful promise about what is inside, shaped by this couple's story (how long, what they kept, how carefully it was made). One short sentence, 4–10 words, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.boxLine",
      label: "The line over the open box",
      kind: "text",
      max: 60,
      guide: "One short sentence that appears over the open box at the moment they realise every bonbon is a photo of the two of them: it says, tenderly and in the sender's voice, what this box is made of, using something only this couple has (their years together, their city, the way they met). 4–9 words, ending with a full stop." + VW_TONE,
    },
    ...flavourFields(),
    {
      path: "extras.heartLine",
      label: "The line on the last piece",
      kind: "text",
      max: 60,
      guide: "The line they read once they brush the cocoa off the last piece, a heart-shaped bonbon the sender kept back for them: a tender sentence about saving the best for them or always choosing them, with a small nod to the story if one fits. 5–11 words, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the menu card: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Printed in italic under the letter. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Forever yours, Rohan",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide: "One line shown with the sender's voice note near the end of the page (or on its own, large, as the sender's spoken words when there is no recording). First person, addressed to them, one small detail or inside joke from the story, as if said out loud. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. behind a gold foil seal at the very end of the page. The first line is one complete sentence on its own: 'Open only if' followed straight away, on that same line, by a moment or feeling taken from this couple's story (in the story's language). Then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ["Won", "ka"].join("")],
};
