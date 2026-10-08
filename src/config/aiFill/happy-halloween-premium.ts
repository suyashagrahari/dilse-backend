import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-halloween-premium — "The Midnight Manor", the ULTRA-PREMIUM twin of
 * happy-halloween. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are defined in
 * ../premiumDays/happy-halloween-premium.ts (client mirror:
 * client/app/(templates)/_valentine/days/happy-halloween-premium.ts).
 *
 * The demo seeds 4 photos, 4 candle memories, 3 spirit-board questions and 3
 * spell ingredients, so those indices always exist while the sender builds.
 * `tone` and each question's `answer` are declared as enums on purpose: who
 * the page is for, and whether the board answers YES / NO / ALWAYS / SOON, are
 * things a story decides, and the whisper line must agree with the answer.
 *
 * Never declared: music, GIFs, photos' URLs, premium.voiceNote / songDropAt /
 * unlockAt / allowReply (media and switches — nothing a story says).
 *
 * forbiddenOutput: brand names (VW_FORBIDDEN) plus the one word the board must
 * never be called (it is a "spirit board" / "Magic Letter Board" on the page).
 * Words the page prints itself ("Happy Halloween", "boo") are NOT forbidden —
 * the end line is supposed to wish them a happy Halloween.
 */
const LANGUAGE =
  " Write in the language and script of the sender's story — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. Cute-spooky and romantic, never scary or gory: no blood, no death, no real curses or demons, no religious imagery. Ghosts are cute and the manor is beautiful. When the story names a product brand, write what the thing is instead.";

export const halloweenPremium: AiFillTemplateSchema = {
  slug: "happy-halloween-premium",
  audience: "partner",
  premise:
    "A premium Happy Halloween page: a moonlit haunted manor holding a midnight ball for one guest, the recipient. They break the wax seal on a black invitation (it names the manor and the night), push open an iron gate, strike a match and light candles that each write one small true memory on the wallpaper, wake sepia portraits of the two of them in a gallery, watch a cute ghost planchette on a spirit board spell their name and then a secret word and answer three questions, tune an old radio to hear the sender's voice, warm a letter written in invisible ink with a candle, trace three sigils into a cauldron (one ingredient each) that turns into a crystal ball showing a prophecy, and finally, as the clock tower strikes twelve on their song, answer one question; YES turns the bats into firework hearts and the storm into a sunrise, and their portrait is hung in the manor's gallery. Usually for a partner or crush, but it can be for a best friend, family, or a child — follow the story." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Halloween",
      letterWhere:
        "It is written in invisible ink on parchment in the manor's attic; they warm it with a candle and the words appear line by line, so it should feel like a secret told by candlelight: intimate and warm, with a light Halloween wink (a costume, a scary movie, candy, the dark, a ghost story) only where the story gives you one — never horror. If the page is for a child or family, keep it gentle and sweet.",
      letterMax: 3000,
      endLineWhere: "shown at sunrise under the portrait of the two of them that now hangs in the manor's gallery.",
      photosWhere: "the photos hang as sepia portraits in gilded frames down the manor's gallery, and the caption is engraved on each frame's small brass plaque.",
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
      label: "Name of the manor",
      kind: "text",
      max: 40,
      guide:
        "The name of the haunted manor, engraved on the iron gate's plaque and on their portrait's plaque. A short, affectionate pun built from ONE detail of the story — their street, a running joke, a place they love, a pet's name — in the style of 'Villa Boo-tiful'. Two to four words, under 30 characters, no emoji.",
      example: "Casa de Boo",
    },
    {
      path: "extras.nightTitle",
      label: "Name of the night",
      kind: "text",
      max: 40,
      guide:
        "The name of tonight's midnight ball, printed on the sealed invitation like the title of a gothic love story about these two. Build it from ONE concrete noun in the story — a nickname, a food, a place, an object they fight over — inside a gothic frame: 'The Haunting of <it>', 'The Curse of <it>', 'A Midnight <it> Affair', '<it> After Dark'. Two to six words, title case, under 34 characters, no quotation marks, no emoji. For family or a child keep it sweet ('The Pumpkin Patch Mystery' style).",
    },
    {
      path: "extras.candleMemories",
      label: "Memories the candles light",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide:
        "Four candles in the foyer; each one, when lit, writes one memory on the wallpaper in light. Each item is ONE small, true, specific moment from the story, written as a short phrase addressed to them or about the two of them ('our 3 a.m. Maggi in the hostel kitchen', 'you holding my hand through the whole movie'). Four DIFFERENT moments, in the order they happened. Under 60 characters each, no full stop at the end. Gentle and happy only. Every item must come from something the story actually says: when the story runs out of moments, turn a plain fact it gives into a small present-tense truth instead (a story that only says she loves the rain → 'the way you open the window for every storm'), and write three items rather than four if that is all it supports.",
    },
    {
      path: "extras.spiritWord",
      label: "What the spirit board spells",
      kind: "text",
      max: 10,
      guide:
        "After spelling their name by itself, the spirit board spells ONE more word only these two would understand — a nickname, an inside-joke word, or a word like MINE or ALWAYS. Capital letters A–Z only: one word, 3 to 8 letters, no spaces, no digits, no emoji, no punctuation.",
      example: "MINE",
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.spiritQA[${i}].q`,
        label: `Spirit question ${i + 1}`,
        kind: "text" as const,
        max: 60,
        guide: `Question ${i + 1} of 3 that the recipient asks the spirit board, written in THEIR voice as a playful question about the sender or about the two of them, built on a real habit or joke from the story ('Does he still have my hoodie?', 'Will she ever let me pick the movie?'). Three different questions across the three. Under 55 characters, ends with a question mark.`,
      },
      {
        path: `extras.spiritQA[${i}].answer`,
        label: `Spirit answer ${i + 1}`,
        kind: "enum" as const,
        options: ["YES", "NO", "ALWAYS", "SOON"],
        guide: `Where the planchette glides for question ${i + 1}: the answer that makes the funniest or sweetest sense for that question, from what the story says. Use NO only for a teasing question whose honest answer is a cheeky no; vary the answers across the three questions.`,
      },
      {
        path: `extras.spiritQA[${i}].line`,
        label: `Spirit whisper ${i + 1}`,
        kind: "text" as const,
        max: 70,
        guide: `The sender's whispered line that appears after the board answers question ${i + 1}: a cheeky or tender one-liner in the sender's voice that agrees with the answer you chose and adds one specific detail ('It lives here now.', 'Also at 2:07, 2:15 and 3.'). Under 60 characters.` + VW_TONE,
      },
    ]),
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.ingredients[${i}].name`,
        label: `Spell ingredient ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide: `The name of spell ingredient ${i + 1} of 3, dropped into the cauldron when they trace a sigil: a real memory or quality from the story written like a recipe ingredient — a measure plus one thing ('A pinch of your laugh', 'One stolen fry'). Three different details across the three. 2–5 short words, at most 24 characters; never cut a word off — pick a shorter phrase instead.`,
      },
      {
        path: `extras.ingredients[${i}].line`,
        label: `Ingredient ${i + 1} — what it really is`,
        kind: "text" as const,
        max: 70,
        guide: `The little line that rises in a bubble with ingredient ${i + 1}: what that ingredient really is, said to them ('you'), specific and smiling — the moment behind it. Under 60 characters, lowercase-casual is fine.`,
      },
    ]),
    {
      path: "extras.prophecy",
      label: "The crystal ball's prophecy",
      kind: "text",
      max: 100,
      guide:
        "What the crystal ball shows when the spell is cast: a small, specific future for the two of them, built from a plan, wish or running joke the story itself mentions — a place they want to go plus one detail of how it will feel, ending with a playful callback to something real about them. When the story mentions no plan, make the future an ordinary night of the thing they already love doing together. One or two short sentences, under 90 characters, warm with a wink." +
        VW_TONE,
    },
    {
      path: "extras.question",
      label: "The midnight question",
      kind: "text",
      max: 60,
      guide:
        "The question asked after the clock tower's twelfth bell. It must match the 'Who it's for' field you chose: romantic → a 'Will you be my boo…?' question; friends → a 'Will you be my boo-st friend forever?' question; family → a 'Will you be my favourite little pumpkin?' question; kids → a 'Ready for a spooky-sweet adventure?' question. The adventure wording is ONLY for a child. You may work in one detail from the story. Under 55 characters, ends with a question mark, no emoji.",
      example: "Will you be my boo, tonight and every Halloween after?",
    },
    {
      path: "extras.yesLine",
      label: "After they say YES",
      kind: "text",
      max: 80,
      guide:
        "What appears the moment they say yes, as the bats turn into firework hearts and the sun comes up over the manor: the sender's reply in first person, joyful, one short sentence with a playful callback to the story. Under 70 characters." +
        VW_TONE,
      example: "Booked. Booed. Yours. See you at sunrise.",
    },
    {
      path: "extras.specialGuest",
      label: "A special guest at the ball",
      kind: "text",
      max: 40,
      guide:
        "One extra guest signed into the manor's guest book at the end: a pet, a best friend or a place the story names, with a tiny playful role in brackets ('Biscuit the cat (as himself)'). When the story names no pet, friend or place, sign in the thing the recipient loves most in the story instead, the same way ('The monsoon (as itself)'). Under 36 characters.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    {
      path: "premium.voiceCaption",
      label: "What's on the spirit radio",
      kind: "text",
      max: 90,
      guide:
        "The line on the old radio when the recipient tunes in to the sender's frequency: it captions the sender's recorded voice note or, if there is none, it IS the typed transmission. First person, as if the sender is speaking over the radio to them right now, with one small detail from the story ('Testing, testing… this is me, calling from the other side of the city.'). Under 85 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A second envelope in the attic, sealed with black wax and labelled 'Open only if…'. Begin with that condition as its own first line, specific to these two (for a partner or friend: 'Open only if you're scared.' or 'Open only if you can't sleep tonight.'; for a child or family: 'Open only at bedtime.'), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 520 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ["Oui", "ja"].join("")],
};
