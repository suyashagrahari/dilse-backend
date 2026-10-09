import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-halloween-premium — "A Night at the Manor", the ULTRA-PREMIUM twin of
 * happy-halloween. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are defined in
 * ../premiumDays/happy-halloween-premium.ts (client mirror:
 * client/app/(templates)/_valentine/days/happy-halloween-premium.ts).
 *
 * The demo seeds 4 photos, 3 wall notes and 3 tarot cards, so those indices
 * always exist while the sender builds. `tone` is declared as an enum on
 * purpose: who the page is for is something a story decides.
 *
 * Never declared: extras.costumeDuo (an optional, playful field the sender
 * types; a story rarely names a costume, and an invented one is a fabricated
 * fact), music, GIFs, photos' URLs, premium.voiceNote / songDropAt / unlockAt /
 * allowReply (media and switches — nothing a story says).
 *
 * forbiddenOutput: brand names (VW_FORBIDDEN) plus the one word the board must
 * never be called (it is a "talking board" / "spirit board" on the page).
 * Words the page prints itself ("Happy Halloween", "boo") are NOT forbidden —
 * the end line is supposed to wish them a happy Halloween.
 */
const LANGUAGE =
  " Write in the language and script of the sender's story — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. Cute-spooky and romantic, never scary or gory: no blood, no death, no real curses or demons, no religious imagery. Ghosts are cute and the manor is beautiful. When the story names a product brand, write what the thing is instead.";

export const halloweenPremium: AiFillTemplateSchema = {
  slug: "happy-halloween-premium",
  audience: "partner",
  premise:
    "A premium Happy Halloween page, 'A Night at the Manor'. The recipient is asked 'Trick or treat?' at the door of a dark manor (both answers are a treat), then drags a torch beam through a dark Hall of Portraits to find photos of the two of them hung in gilt frames and short notes scrawled on the walls; rests a finger on a talking board whose planchette spells their name and then one secret word; turns over three tarot cards (their past, present and future) that each carry a personal fortune; hears the sender's voice from a crystal ball; lights a candle to read the sender's letter on old parchment, with a sealed P.S.; and finally finds the last portrait in the dark — the two of them — which winks as their song drops, before one question. It ends on a costume-duo movie poster of the two of them. Usually for a partner or crush, but it can be for a best friend, family, or a child — follow the story." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Halloween",
      letterWhere:
        "They light a candle and it appears on old parchment near the end of the night, just before the last portrait, so it should feel like a secret told by candlelight: intimate and warm, with a light Halloween wink (a costume, a scary movie, candy, the dark, a ghost story) only where the story gives you one — never horror. If the page is for a child or family, keep it gentle and sweet.",
      letterMax: 3000,
      endLineWhere: "the big closing line of the night, printed over the costume-duo poster of the two of them.",
      photosWhere:
        "the photos hang as gilt-framed portraits in a dark hall that the recipient lights up with a torch; the caption is engraved on each frame's small brass plaque, so keep it a short title for the moment (a place, an occasion), not a sentence.",
      captionMax: 30,
      notes: false,
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
      label: "Name of the manor",
      kind: "text",
      max: 40,
      guide:
        "The name of the haunted manor, shown at the door and on the poster. A short, affectionate pun built from ONE detail of the story — their street, a running joke, a place they love, a pet's name — in the style of 'Villa Boo-tiful'. Two to four words, under 30 characters, no emoji.",
      example: "Casa de Boo",
    },
    {
      path: "extras.nightTitle",
      label: "Name of the night",
      kind: "text",
      max: 40,
      guide:
        "The title of tonight's story, shown over the last portrait at the big reveal and on the poster like the title of a gothic love film about these two. Build it from ONE concrete noun in the story — a nickname, a food, a place, an object they fight over — inside a gothic frame: 'The Haunting of <it>', 'The Curse of <it>', 'A Midnight <it> Affair', '<it> After Dark'. Two to six words, title case, under 34 characters, no quotation marks, no emoji. For family or a child keep it sweet ('The Pumpkin Patch Mystery' style).",
    },
    {
      path: "extras.wallNotes",
      label: "Notes on the walls",
      kind: "list",
      max: 3,
      itemMax: 48,
      guide:
        "Three short notes the sender scrawled on the walls of the dark hall, found one by one with a torch. Each is ONE small, true, specific moment or habit from the story, written the way you'd scribble it — a fragment, lowercase is fine, addressed to them ('you snorted at the food court', 'Lonavala, no umbrella'). Three DIFFERENT details. Under 40 characters each, no full stop, no emoji. Every note must come from something the story actually says — never a first time, an outing or an event it does not mention. When the story runs out of moments, turn a plain fact it gives into a tiny present-tense truth about them instead (a story that only says she loves the rain → 'you, opening every window for a storm'), and write two notes, or one, rather than invent. Count the concrete details the story gives first: a story of one or two sentences gets one note per detail it names, never more.",
    },
    {
      path: "extras.spiritWord",
      label: "What the talking board spells",
      kind: "text",
      max: 10,
      guide:
        "After spelling their name by itself, the talking board spells ONE more word only these two would understand — a nickname, an inside-joke word, or a word like MINE or ALWAYS. Capital letters A–Z only: one word, 3 to 8 letters, no spaces, no digits, no emoji, no punctuation.",
      example: "MINE",
    },
    {
      path: "extras.spiritLine",
      label: "The board's last whisper",
      kind: "text",
      max: 80,
      guide:
        "The sender's whispered line that appears once the board has spelled the word: one short sentence in the sender's voice that lands the word with a wink or a truth ('The spirits agree. So do I.'), using one detail from the story where it fits. Under 60 characters." +
        VW_TONE,
    },
    ...[
      ["their PAST", "a moment from how they met or their early days, as the story tells it; when the story tells nothing about their past, an old, still-true fact about them that the story does give, told as if the cards always knew it — never a first date, trip or event the story does not mention"],
      ["their PRESENT", "what they are to the sender right now, as short and plain as a verdict — two to six words beat a sentence here — built on the story's own detail, not a stock compliment"],
      ["their FUTURE", "a plan, wish or running joke the story mentions, told as a playful prophecy; when the story mentions no plan, an ordinary night of the thing they already love doing together"],
    ].flatMap(([pos, what], i) => [
      {
        path: `extras.tarot[${i}].card`,
        label: `Tarot card ${i + 1}`,
        kind: "text" as const,
        max: 24,
        guide: `The name of the tarot card drawn for ${pos}: a real Major Arcana card whose meaning suits the fortune you write for it (The Lovers, The Moon, The Sun, The Star, The Magician, The Wheel of Fortune, The Empress, Strength, The Hermit, The World, The Chariot, The Fool…), written with 'The' where the real card has it. Three different cards across the three. Never a card whose name sounds frightening.`,
      },
      {
        path: `extras.tarot[${i}].line`,
        label: `Tarot fortune ${i + 1}`,
        kind: "text" as const,
        max: 90,
        guide: `The fortune printed on the ${pos} card, in the sender's voice to them: ${what}. One or two short sentences, under 80 characters, specific to the story, with a wink.` + VW_TONE,
      },
    ]),
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide:
        "The question asked under the last portrait after the big reveal. It must match the 'Who it's for' field you chose: romantic → a 'Will you be my boo…?' question; friends → a 'Will you be my boo-st friend forever?' question; family → a 'Will you be my favourite little pumpkin?' question; kids → a 'Ready for a spooky-sweet adventure?' question. The adventure wording is ONLY for a child. You may work in one detail from the story. Under 55 characters, ends with a question mark, no emoji.",
      example: "Will you be my boo, tonight and every Halloween after?",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide:
        "What appears under the portrait the moment they say yes: the sender's reply in first person, joyful, one short sentence with a playful callback to the story. Under 70 characters." +
        VW_TONE,
      example: "Booked. Booed. Yours. Every October after.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    {
      path: "premium.voiceCaption",
      label: "The voice from the crystal ball",
      kind: "text",
      max: 90,
      guide:
        "The line that surfaces in a crystal ball as 'a voice from beyond': it captions the sender's recorded voice note or, if there is none, it IS the message. First person, as if the sender is speaking to them through the glass right now: playful-spooky, and built on one small detail from the story (a habit of theirs, a place, the thing they'd be doing right now). Start it your own way. Under 85 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A P.S. under the letter, sealed with oxblood wax and labelled with its first line, 'Open only if…'. Begin with that condition as its own first line, specific to these two (for a partner or friend: 'Open only if you're scared.' or 'Open only if you can't sleep tonight.'; for a child or family: 'Open only at bedtime.'), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 520 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ["Oui", "ja"].join("")],
};
