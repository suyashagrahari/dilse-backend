import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * anniversary-premium — "The Book of Us", the flagship anniversary page on the
 * Valentine's-week engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * What makes an anniversary page land is specificity (research: "specific
 * beats sentimental every time"): the chapters, firsts, little habits and
 * inside jokes must come from the couple's own story, never a love-quote pool.
 * The demo seeds 4 chapters, 4 firsts, 6 little things, 8 reasons, 4 promises
 * and 4 plans, so those indices always exist.
 *
 * Not declared (field cap 40): palette (a visual choice); since / metOn /
 * openOn (exact dates the sender types; a model would invent them); the lock
 * and its hint (the sender's own decision); chapter seasons (cosmetic);
 * ourSong and datePlan (facts the sender knows, never to be invented); the
 * custom stats (made-up numbers would ring false).
 */
const ANNI_TONE = " Warm, grateful and specific; playful where the story is playful. Nothing possessive, no clichés like 'my everything' or 'forever and always'." + VW_TONE;

export const anniversaryPremium: AiFillTemplateSchema = {
  slug: "anniversary-premium",
  audience: "partner",
  premise:
    "An interactive anniversary storybook for a girlfriend, boyfriend, wife, husband or partner, written by the sender. The recipient pulls focus on their names in film-style opening titles, traces two paths (theirs and the sender's) until they meet at the place they met, spins a 'time machine' ring through the chapters of their years together (each chapter is a year or milestone with a title and one line), drops their 'firsts' (first date, first trip, first fight they survived, first 'I love you') on a record player, lifts things off a breakfast tray to find the little daily habits the sender loves, stitches a heart-shaped quilt whose patches are photos and reasons the sender loves them, turns the pages of the sender's letter bound as a little book, watches their 'year in numbers', flicks lanterns carrying promises for the next year into the sky, raises the sun over the plans for next year, and finally answers the sender's question by dragging their heart into the sender's. It ends with a 'Certificate of Forever'. It works for dating and married couples. Every chapter, first, habit, reason and joke comes from the sender's own story; all four chapters and four firsts are always written, even from a short story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "anniversary",
      letterWhere:
        "It is the anniversary letter, hand-bound into a little book they page through near the end (one paragraph per page, so keep paragraphs short and whole). Look back at what this year or these years together meant (only events the story states), say what the sender is grateful for in specific terms, and end looking forward to the next year together.",
      letterMax: 2500,
      endLineWhere: "printed at the bottom of their 'Certificate of Forever', the keepsake at the very end.",
      photosWhere: "the photos are patches in a heart-shaped memory quilt, and the first ones also appear inside the year-by-year time machine.",
      greetingPrinted: "The book already prints a 'Dear <their name>,' salutation above the first page.",
      signaturePrinted: "The last page already signs it 'Forever yours,' with the sender's name.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "Who it's for",
      kind: "enum",
      options: ["girlfriend", "boyfriend", "wife", "husband", "partner"],
      guide:
        "Who the page is for, from the story: 'wife' or 'husband' when they are married (by the recipient's gender); 'girlfriend' or 'boyfriend' when they are dating; 'partner' when the story uses that word or the gender is unclear.",
    },
    {
      path: "extras.openingLine",
      label: "Under your names on the title",
      kind: "text",
      max: 60,
      guide: "A short line in the opening credits, under both names (already printed, so do not repeat them). Like a film's tagline for their love story, ideally with a tiny nod to the story. Lowercase-casual is fine, under 50 characters, no emoji.",
      example: "a love story, still being written",
    },
    {
      path: "extras.metPlace",
      label: "Where your paths met",
      kind: "text",
      max: 40,
      guide: "Where they first met, from the story (a place, an event, an app). Short, like a caption. Leave empty if the story does not say. Under 36 characters.",
      example: "a tiny café in Bandra",
    },
    {
      path: "extras.metLine",
      label: "How we met",
      kind: "text",
      max: 120,
      guide: "One sentence about the moment they met, first person to them ('You…'), with one small specific detail from the story. Never invent events. Under 110 characters." + ANNI_TONE,
      example: "You laughed at my terrible joke and I knew I was in trouble.",
    },
    // All four chapters are always written (a skipped one would keep the demo's chapter).
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.chapters[${i}].when`,
        label: `Chapter ${i + 1} — when`,
        kind: "text" as const,
        max: 20,
        guide:
          i === 3
            ? "When chapter 4 happens: always the most recent year or simply 'This year'. Under 16 characters."
            : `A short label for chapter ${i + 1}, in order from the beginning: a year ('2023') or a month and year when the story gives them, otherwise the milestone itself ('The first trip', 'Moving in'). Never invent a year the story does not state. Under 16 characters.`,
      },
      {
        path: `extras.chapters[${i}].title`,
        label: `Chapter ${i + 1} — title`,
        kind: "text" as const,
        max: 40,
        guide:
          i === 3
            ? "Chapter 4's title: where they are now, this year. No emoji. Under 34 characters."
            : `The title of chapter ${i + 1}: one milestone from the story, in order (met, first date, first trip, moved in, engaged, married, a hard year they got through…). When the story has fewer milestones than chapters, make this one about something they share every day (a habit, a place, a ritual). No emoji. Under 34 characters.`,
      },
      {
        path: `extras.chapters[${i}].line`,
        label: `Chapter ${i + 1} — one line`,
        kind: "text" as const,
        max: 120,
        guide: `One sentence for chapter ${i + 1}, first person, with one small specific detail from the story (what they said, ate, wore, laughed at). Never invent events. Under 110 characters.` + ANNI_TONE,
        example: "Goa, one sunburn, two broken flip-flops, and the best sunset of my life.",
      },
    ]),
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.firsts[${i}].title`,
        label: `First ${i + 1} — which first`,
        kind: "text" as const,
        max: 30,
        guide: `The name of one 'first' they shared, printed on a record sleeve: ${["their first date", "their first trip", "the first fight they survived (keep it light)", "the first 'I love you'"][i]}, or another first from the story when that one is missing (first movie, first gift, first time cooking together). Each record a different first. Under 26 characters, starts with 'Our first' or 'First'.`,
        example: ["Our first date", "Our first trip", "Our first fight", "First “I love you”"][i],
      },
      {
        path: `extras.firsts[${i}].line`,
        label: `First ${i + 1} — what happened`,
        kind: "text" as const,
        max: 110,
        guide: `One sentence about that first, first person to them, with a small specific (ideally funny) detail from the story. Never invent events; with no detail in the story, say something sweet and general about that first instead. Under 100 characters.` + ANNI_TONE,
        example: "You were 20 minutes late and I pretended I'd just arrived too.",
      },
    ]),
    {
      path: "extras.littleThings",
      label: "The little things",
      kind: "list",
      max: 6,
      itemMax: 70,
      guide:
        "Exactly 6 short lines, each a small daily habit of theirs the sender loves (how they make the chai, steal the blanket, hum while cooking, text 'reached?'), hidden under things on a breakfast tray. Use the story's habits first. Second person or noun phrases ('How you…', 'Your…'). Each under 64 characters." +
        ANNI_TONE,
      example: "How you make my chai exactly right without asking",
    },
    {
      path: "extras.reasons",
      label: "Reasons I love you",
      kind: "list",
      max: 8,
      itemMax: 70,
      guide:
        "Exactly 8 short lines, one on each quilt patch: each a different, specific reason the sender loves them — a quality, a habit, a way they make the sender feel — using the story's details where it gives them. Second person ('You…', 'Your…'). Each under 48 characters (they sit on small patches)." +
        ANNI_TONE,
      example: "You laugh at my worst jokes",
    },
    {
      path: "extras.mostSaid",
      label: "Our most-said thing",
      kind: "text",
      max: 40,
      guide: "An inside joke or a phrase they say to each other all the time, from the story, in quotes as they say it. Leave empty if the story has none rather than inventing one. Under 36 characters.",
      example: "“khaana khaya?”",
    },
    {
      path: "extras.promises",
      label: "Promises for the next year",
      kind: "list",
      max: 5,
      itemMax: 80,
      guide:
        "Exactly 4 short promises for the next year, each carried up by a lantern: concrete and keepable, tied to the story where possible (more of something they love, less of something that bugs them, showing up in a specific way). First person ('I'll…'). Each under 72 characters." +
        ANNI_TONE,
      example: "More slow Sundays, fewer phones at dinner",
    },
    {
      path: "extras.plans",
      label: "Where we'll be next year",
      kind: "list",
      max: 4,
      itemMax: 60,
      guide:
        "Exactly 4 short plans or dreams for the next year together, revealed as the sun rises: a trip, a home project, something to learn together, a small ritual. Use plans the story mentions first; otherwise gentle, plausible ones. Noun phrases, each under 44 characters.",
      example: "Mountains in the snow, just us two",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 70,
      guide:
        "The sweet question at the end, answered by dragging a heart (there is no No): for a married couple something like 'Will you keep choosing me, year after year?'; for a dating couple 'Will you spend the next year with me too?'. You may use their pet name. Under 60 characters, ends with a question mark and at most one emoji.",
      example: "Will you spend the next year with me too? 💗",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 90,
      guide: "What appears the moment they say yes: first person, overjoyed, one short sentence, ideally with a callback to the story. Under 80 characters." + VW_TONE,
      example: "Best answer, best person, best years. Here's to forever 🥂",
    },
  ],
  // The page prints "The Book of Us", "Certificate of Forever" and "Forever yours" itself.
  forbiddenOutput: [...VW_FORBIDDEN, "The Book of Us", "Certificate of Forever", "Forever yours"],
};
