import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-valentines-day-premium — "Our Film", the flagship premium page: the couple's love story screened as a
 * film the sender directed and the recipient stars in.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ./../premiumDays/happy-valentines-day-premium.ts. Not declared: metDate / togetherSince / dateOn (dates the
 * sender picks), datePlan (logistics), every media/music/drop/unlock field, and the photo notes (this page
 * shows captions only, as lower-thirds).
 *
 * The letter is the one field built here instead of in valentineCommon: the page binds it as a three-part book
 * split at lines of "---", so the model has to write three parts, not "three or four paragraphs".
 */

const FILM_FORBIDDEN = [
  ["Net", "flix"].join(""),
  ["Bolly", "wood"].join(""),
  ["soul", "mate"].join(""),
  ["soul", "mates"].join(""),
];

const common = valentineCommon({
  dayName: "Valentine's Day",
  letterWhere: "",
  letterMax: 3000,
  endLineWhere: "printed at the bottom of the movie poster of the two of them that ends the page, like a release line.",
  photosWhere: "each photo is a shot in a short film of them set to their song, and the caption is its lower-third title, like a scene name in a trailer.",
  notes: false,
}).filter((f) => f.path !== "letter");

const letter: AiFillField = {
  path: "letter",
  label: "Your letter, in three parts",
  kind: "longtext",
  max: 1200,
  required: true,
  guide:
    "THE MAIN LETTER, from the sender to them, in first person. The page binds it as a small book of three pages they turn one at a time, one paragraph per page, so write EXACTLY three paragraphs separated by blank lines. Paragraph one, 'then': the beginning, told through one or two concrete details from the story (where, what was said, what they noticed first). Paragraph two, 'now': what this person is in the sender's everyday life today, with one tease about a real habit from the story and one plainly sincere line. Paragraph three, 'always': what the sender wants for every chapter after this one, quieter and more vulnerable, ending on the feeling that one more thing is coming on the next screen — no question to them anywhere in the letter, because the big question is asked on a later screen. " +
    "Open with their name (or pet name) alone on the first line, then a blank line, then paragraph one. Use only memories the story actually gives; when it gives few, write about what it does say (how long it has been, how they make the sender feel, what the sender hopes for) instead of inventing scenes. The page signs the letter itself with the sender's name, so the last line is the last real sentence of paragraph three — no closing phrase, no 'yours', no name after it. Each paragraph two to four sentences; 700–1100 characters in total." +
    VW_TONE,
};

export const valentinesDayPremium: AiFillTemplateSchema = {
  slug: "happy-valentines-day-premium",
  audience: "partner",
  premise:
    "A cinematic Valentine's Day page that presents the couple's love story as a film directed by the sender and starring the recipient. It opens with a cinema ticket and opening titles (the film's title, a poster tagline, a 'Previously on…' recap of the seven days of Valentine's week), then the night they met as a constellation, a montage of their photos cut to their song, a director's commentary, a letter bound as a three-part book, their relationship 'by the numbers', and finally the big question shot in black and white, where every 'No' is a playful retake called by the director, before colour, fireworks and end credits. Grand but warm, specific, with wit in the director's lines." +
    VW_LANGUAGE +
    " Indian place names, foods, trains and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...common.slice(0, 3), // recipientName, senderName, petName
    letter,
    ...common.slice(3), // endLine, photo captions
    {
      path: "extras.filmTitle",
      label: "Your film's title",
      kind: "text",
      max: 40,
      required: true,
      guide: "The title of their love story as a film, shown on the title card, the end credits and the movie poster. Built from one specific thing in the story (the place they met, an inside joke, the first thing said), the way a real romantic film is titled. Title case, no quotation marks, no names of real films. Under 36 characters.",
      example: "Two Seats, One Story",
    },
    {
      path: "extras.tagline",
      label: "Poster tagline",
      kind: "text",
      max: 70,
      guide: "The one-line tagline printed under the title on their movie poster, in the clipped rhythm of a real film poster (short fragments with full stops are good), grounded in the story's real setting. Under 64 characters.",
      example: "Two strangers. One train. Every day since.",
    },
    {
      path: "extras.weekLines",
      label: "\"Previously on…\" — one line per day of the week",
      kind: "list",
      max: 7,
      itemMax: 60,
      guide: "Exactly 7 short lines for a 'Previously on…' recap that flicks past in the opening titles, one frame per day of Valentine's week, in this order: 1 a rose, 2 the moment they said yes (told as a memory, never asked again), 3 something sweet to eat, 4 a teddy or something soft, 5 a promise, 6 a hug, 7 a kiss (family-safe). The page prints each day's name above its line, so the line itself never names the day. Each line is about them and that day's object, with a story detail where one fits; where the story gives none, make it a warm line about the object and them rather than a made-up event. None is a question. Each under 55 characters." + VW_TONE,
      example: "You kept every single petal.",
    },
    {
      path: "extras.metPlace",
      label: "Where you met",
      kind: "text",
      max: 40,
      guide: "Where they first met, from the story, as a place and a city. It appears under the constellation of the night they met and as 'Filmed on location in…' in the end credits. Under 38 characters. Leave it empty if the story does not say where they met.",
      example: "College canteen, Pune",
    },
    {
      path: "extras.chapterTitles",
      label: "The letter's three part titles",
      kind: "list",
      max: 3,
      itemMax: 24,
      guide: "Exactly 3 short titles, one for each part of the letter above (the beginning, now, always), each one to three words, like chapter titles in a book. They can be plain ('Then', 'Now', 'Always') or carry a detail from the story. Under 22 characters each.",
    },
    ...[0, 1, 2].flatMap((i): AiFillField[] => [
      {
        path: `extras.stats[${i}].label`,
        label: `Your number ${i + 1} — what it counts`,
        kind: "text",
        max: 30,
        guide: `The label of stat card ${i + 1} in the couple's 'by the numbers' screen, after cards the page works out itself (days together, heartbeats, sunsets): something only these two would count, taken from a habit, joke or ritual the story mentions, worded like a stat category (things stolen, most-said line, song on repeat). Each card a different habit. When the story has no habit left for this card, leave both its label and value empty. Under 28 characters.`,
      },
      {
        path: `extras.stats[${i}].value`,
        label: `Your number ${i + 1} — the value`,
        kind: "text",
        max: 24,
        guide: `The big value on stat card ${i + 1}, taken from the story: a phrase, a place, a time, a food. Write digits only when the story itself states that number; otherwise a word or short phrase ('countless', 'every single time', 'one, unforgettable'). Under 22 characters.`,
      },
    ]),
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      required: true,
      guide: "The final question, asked in black and white under one spotlight after the whole film. A Valentine-forever question that fits the relationship in the story (it may nod to films: sequels, every scene), with the right gender for the recipient. The page prints their name on the line above, so do not start with their name. Under 55 characters, ends with a question mark.",
      example: "Will you be my Valentine… for every sequel?",
    },
    {
      path: "extras.noTakes",
      label: "The director's line for each \"No\" take",
      kind: "list",
      max: 4,
      itemMax: 50,
      guide: "Exactly 4 lines a film director calls out each time they tap 'No', escalating in comedy: line 1 starts with 'CUT! Take 2.', line 2 starts with 'Take 3.', line 3 with 'Take 4.', line 4 with 'Take 5.'; after each, a short director's remark (more feeling, endless patience, the crew is hungry, a bribe taken from something they love in the story). The joke is always on the director and the retakes, never on them. Each under 46 characters.",
      example: "CUT! Take 2. With feeling this time.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    {
      path: "premium.voiceCaption",
      label: "Your director's note (caption for your voice note)",
      kind: "text",
      max: 90,
      guide: "One line in the sender's voice for the 'Director's commentary' screen: printed with the voice note, or, when there is none, shown on its own as the sender's spoken line in a screenplay. First person, to them, one small detail or inside joke from the story, a little self-mocking about directing this film. Under 85 characters, no hashtags.",
      example: "I rewrote this scene forty times. It's still just “I love you.”",
    },
    {
      path: "premium.psLetter",
      label: "The deleted scene (sealed P.S.)",
      kind: "longtext",
      max: 600,
      guide: "A sealed 'deleted scene' they open after the end credits. Its first line is the condition on its own line, starting 'Open only if' and specific to these two (open only if you ever doubt this, open only if you can't sleep tonight); then a blank line; then two to four short sentences to them in first person, quieter and more intimate than the letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ...FILM_FORBIDDEN],
};
