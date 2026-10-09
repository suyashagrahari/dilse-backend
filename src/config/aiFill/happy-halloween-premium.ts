import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-halloween-premium — "Boo-tiful Night", the ULTRA-PREMIUM twin of
 * happy-halloween. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are defined in
 * ../premiumDays/happy-halloween-premium.ts (client mirror:
 * client/app/(templates)/_valentine/days/happy-halloween-premium.ts).
 *
 * The demo seeds 4 photos, 5 treats, 3 ingredients and 3 perks, so those
 * indices always exist while the sender builds. `tone` is declared as an enum
 * on purpose: who the page is for is something a story decides.
 *
 * Language: the platform rule (the sender's own language and script) wins;
 * the template's own copy is English. Forcing English here fought the fill
 * prompt's top rule and produced mixed scripts on a Hinglish story (tested).
 *
 * Never declared: extras.costumeDuo (an optional, playful field the sender
 * types; an invented costume is a fabricated fact), music, GIFs, photos' URLs,
 * premium.voiceNote / songDropAt / unlockAt / allowReply.
 */
const LANGUAGE =
  " Write in the language and script of the sender's story — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. Never invent a memory, a past Halloween, a costume, a trip or a 'first time' the story does not mention: when the story is short, write about who they are and what they love right now, or a plan for tonight, instead of a past event. A pet's name (a cat, a dog) is never a nickname for the recipient. Cute-spooky and romantic, never scary or gory: no blood, no death, no skulls, no real curses or demons, no religious imagery. Ghosts are cute and blush. When the story names a product brand, write what the thing is instead.";

export const halloweenPremium: AiFillTemplateSchema = {
  slug: "happy-halloween-premium",
  audience: "partner",
  premise:
    "A premium Happy Halloween page, 'Boo-tiful Night': a bright, cute, candy-coloured Halloween night with blushing ghosts, never scary. A ghost pops out of a haunted mailbox with a letter; the recipient taps a trick-or-treat bag and catches candies that each open to one line (a sweet 'Treat:' or a cute 'Trick:' dare); carves a pumpkin; shoos away ghosts hiding their photos in a ghost photo booth; pours three little bottles of ingredients into a cauldron to brew a love potion that casts one spell; a cute bat delivers the sender's letter as a scroll (with a sealed P.S.); a spirit radio plays the sender's voice; then 'Will you be my boo?' as their song drops, and a Boo License keepsake with perks printed on it. Usually for a partner or crush, but it can be for a best friend, family, or a child — follow the story." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Halloween",
      letterWhere:
        "A cute little bat flies in carrying it and it unrolls like a scroll in the middle of the night, so it should feel warm and close, with a light Halloween wink (a costume, a scary movie they hid from, candy, a ghost joke) only where the story gives you one — never horror. If the page is for a child or family, keep it gentle and sweet. Only recall a moment the story actually tells; when the story tells none, tease them about what it does say and look forward to tonight instead of remembering anything.",
      letterMax: 3000,
      endLineWhere: "printed big over their Boo License, the keepsake they save at the end.",
      photosWhere:
        "each photo hides behind a cute ghost in a photo booth until they shoo the ghost away; the caption is handwritten under the polaroid, so keep it a short label for the moment (a place, an occasion), not a sentence.",
      captionMax: 30,
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with the sender's name underneath.",
    }),
    {
      path: "extras.tone",
      label: "Who it's for",
      kind: "enum",
      options: ["romantic", "friends", "family", "kids"],
      guide:
        "Who the page is for, from the story: 'romantic' for a partner, spouse or crush; 'friends' for a best friend or friend; 'family' for a parent, sibling, cousin or other grown-up relative; 'kids' only when the recipient is clearly a child. When unsure, 'romantic'.",
    },
    {
      path: "extras.houseName",
      label: "Name of the haunted house",
      kind: "text",
      max: 40,
      guide:
        "The name of their cute haunted house, painted on the mailbox and printed on the Boo License. A short, affectionate Halloween pun built from ONE detail of the story — their street, a running joke, a place they love, a pet's name — in the style of 'Villa Boo-tiful'. Two to four words, under 30 characters, no emoji.",
      example: "Casa de Boo",
    },
    ...[0, 1, 2, 3, 4].map((i) => ({
      path: `extras.treats[${i}]`,
      label: `Candy ${i + 1}`,
      kind: "text" as const,
      max: 70,
      guide:
        `Candy ${i + 1} of five in the trick-or-treat bag: when they catch it, it opens to this one line. ` +
        (i % 2 === 0
          ? "Start with 'Treat: ' and give them something sweet the sender will really do or give, built on one detail from the story (their food, a habit, a thing they share)."
          : "Start with 'Trick: ' and give them a cute, harmless dare or IOU they owe the sender (hugs, a dance, sharing their fries), built on one detail from the story.") +
        " One short sentence after the label, under 60 characters in all, no emoji. Five candies, five different details." +
        VW_TONE,
    })),
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.ingredients[${i}].name`,
        label: `Potion bottle ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide:
          "The label on a little bottle they pour into the love potion: a measure plus one thing about them or the two of them, like a recipe — 'A pinch of …', 'A drop of …', 'A sprinkle of …', 'A spoonful of …' (use a different measure on each of the three). Two to six words, under 28 characters, no emoji.",
      },
      {
        path: `extras.ingredients[${i}].line`,
        label: `What bottle ${i + 1} really is`,
        kind: "text" as const,
        max: 70,
        guide:
          "What that bottle really is, shown as it pours: a lowercase fragment that starts with 'your' or 'the way you' and names one thing about them the story says (a habit, a quality, what they love, something they did in the story), matching the bottle's label. When the story tells real moments, name them here (the moment itself, not a general quality). Under 60 characters, no full stop, no emoji. Three bottles, three different details.",
      },
    ]),
    {
      path: "extras.potionSpell",
      label: "What the potion does",
      kind: "text",
      max: 90,
      guide:
        "The spell the finished love potion casts, shown when the cauldron puffs out a heart: one or two short sentences from the sender, a sweet promise or plan with a wink, built on the story ('One sip and you're stuck with me…' style, in your own words). Under 85 characters." +
        VW_TONE,
    },
    ...[0, 1, 2].map((i) => ({
      path: `extras.perks[${i}]`,
      label: `License perk ${i + 1}`,
      kind: "text" as const,
      max: 40,
      guide:
        "One perk printed on their official Boo License: a short, funny-sweet privilege they now hold, from the story ('Unlimited hoodie access', 'First pick of the momos'). Title-case-free, two to six words, under 34 characters, no full stop, no emoji. Three different perks.",
    })),
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide:
        "The big question, asked in the moonlight next to their photo. It must match the 'Who it's for' field you chose: romantic → a 'Will you be my boo…?' question; friends → a 'Will you be my boo-st friend forever?' question; family → a 'Will you be my favourite little pumpkin?' question; kids → a 'Ready for a spooky-sweet adventure?' question. The adventure wording is ONLY for a child. You may work in one detail from the story. Under 55 characters, ends with a question mark, no emoji.",
      example: "Will you be my boo, this Halloween and every one after?",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide:
        "What appears the moment they say yes, while bats make a heart around their photo: the sender's reply in first person, joyful, one short sentence with a playful callback to the story. Under 70 characters." +
        VW_TONE,
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    {
      path: "premium.voiceCaption",
      label: "On the spirit radio",
      kind: "text",
      max: 90,
      guide:
        "The line that comes through a cute spirit radio once they tune it: it captions the sender's recorded voice note or, if there is none, it IS the message. First person, as if the sender is talking to them on the radio right now: sweet with a little Halloween wink, built on one small detail from the story. Start it your own way. Under 85 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A P.S. under the letter, sealed with a little pumpkin wax seal they tap open. Begin with 'P.S. ', then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail the story states that the letter did not use; when the story has no second detail, make it a small promise for tonight instead of a memory. No salutation, no sign-off, no sender's name. Under 420 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN],
};
