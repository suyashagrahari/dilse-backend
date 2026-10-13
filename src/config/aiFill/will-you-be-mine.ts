import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * will-you-be-mine — "Will You Be Mine?", an evergreen proposal page on the
 * Valentine's-week engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * What makes someone say yes (and cry) is specificity: the page is built from
 * the couple's own story — how they met, the moment the sender knew, inside
 * jokes — so every line here must come from the story, never from a generic
 * love-quote pool. The demo seeds 4 chapters, 6 reasons and 3 quiz questions,
 * so those indices always exist. Only the first two quiz questions are
 * declared (the field cap is 40); the third is the demo's universal "Who fell
 * first?".
 *
 * Not declared: palette (a visual choice) and answerMode / noTries (whether an
 * honest "Let me think about it" is allowed is the sender's own decision).
 */
const MINE_TONE = " Sweet, a little nervous and sincere; playful where the story is playful. No pressure, no guilt, nothing possessive or clingy." + VW_TONE;

export const willYouBeMine: AiFillTemplateSchema = {
  slug: "will-you-be-mine",
  audience: "partner",
  premise:
    "An interactive proposal page: the sender asks the recipient to be their girlfriend or boyfriend, to go out with them, or to marry them. The recipient taps open a velvet ring box (it is empty — 'the ring comes at the end'), walks a little heart path through the chapters of their story from the first meeting to today, connects stars into a heart constellation where every star holds one reason the sender fell for them, takes a three-question love quiz about the two of them (a love meter fills whatever they answer), swipes through photos, opens the sender's love letter, holds a heart until it fills and the ring box opens with the sender's promise, and finally answers the big question while the No button runs away. Saying yes sets off fireworks and an 'Officially Mine' certificate. Cute, romantic and sincere. Every story chapter, star reason and quiz answer comes from the sender's own story; all four chapters are always written, even from a short story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "proposal",
      letterWhere:
        "It is the sender's love letter, opened after the photos and just before the proposal. Say when and how the sender started falling for them (only events the story states), what they love about them in specific terms, how life feels with them, and what the sender wants with them now — building up to the question without asking it outright (the page asks it next). With a short story, stay in the present: how the sender feels and what they hope for.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their 'Officially Mine' certificate, the keepsake at the very end.",
      photosWhere: "the photos are a strip of polaroids they swipe through under 'The ones I replay'.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with a closing line and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "What you're asking",
      kind: "enum",
      options: ["girlfriend", "boyfriend", "marry", "date"],
      guide:
        "What the sender is asking, from the story: 'girlfriend' to ask a woman to be their girlfriend; 'boyfriend' to ask a man to be their boyfriend; 'marry' for a marriage proposal (they are already together and the sender wants to marry them); 'date' for a crush they are not dating yet, asking them out. When the story only says 'propose' to someone they are not yet dating, pick 'girlfriend' or 'boyfriend' by the recipient's gender, else 'date'.",
    },
    {
      path: "extras.openingLine",
      label: "On the ring box",
      kind: "text",
      max: 60,
      guide: "A short, shy teaser line on the first screen, under a greeting that already says their name — so do not greet them or use their name here. Lowercase-casual, hinting there is a question without asking it (e.g. about opening it with a smile, or the sender being nervous). Under 50 characters, at most one emoji.",
    },
    // All four chapters are always written (a skipped one would keep the demo's chapter).
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.story[${i}].when`,
        label: `Chapter ${i + 1} — when`,
        kind: "text" as const,
        max: 24,
        guide:
          i === 3
            ? "When chapter 4 happens: it is always now, e.g. 'Today'. Under 20 characters."
            : `A short label for chapter ${i + 1} of their story, in order from the first meeting onwards. Use the story's own timing words (a year, a month, 'Last month', 'Second year'); when the story gives no timing, name the place or the moment instead (e.g. the café, the trek) — never invent a time span the story does not state. Under 20 characters.`,
      },
      {
        path: `extras.story[${i}].title`,
        label: `Chapter ${i + 1} — title`,
        kind: "text" as const,
        max: 36,
        guide:
          i === 3
            ? "Chapter 4's title: where they are now — the sender making this page because they cannot keep it in. One emoji. Under 32 characters."
            : `The title of chapter ${i + 1}: one moment from the story, in order (how they met, the first long talk or date, the moment the sender knew…). Only moments the story states; when the story has fewer moments than chapters, make this one about something they share every day (a habit, a place, a joke) — chapter 4 alone is about today. One emoji. Under 32 characters.`,

      },
      {
        path: `extras.story[${i}].line`,
        label: `Chapter ${i + 1} — what happened`,
        kind: "text" as const,
        max: 100,
        guide: `One sentence about chapter ${i + 1}, first person to them, with one small specific detail from the story (what they said, wore, ordered, laughed at). Never invent events, and never ask the big question here — the page asks it at the end. Under 95 characters.` + MINE_TONE,
        example: "You laughed at my terrible joke and I forgot the rest of my sentence.",
      },
    ]),
    {
      path: "extras.reasons",
      label: "Reasons I fell for you",
      kind: "list",
      max: 6,
      itemMax: 70,
      guide:
        "Exactly 6 short lines, one inside each star they connect into a heart: each a different, specific reason the sender fell for them — a habit, a quality, a way they make the sender feel — using the story's details where it gives them. Second person ('Your laugh…', 'You remember…'). Each under 65 characters." +
        MINE_TONE,
      example: "You remember the tiny things nobody else notices.",
    },
    // Two quiz questions are written from the story; the third stays the demo's
    // "Who fell first?", which fits every couple (and keeps the schema ≤ 40 fields).
    ...[0, 1].flatMap((i) => [
      {
        path: `extras.quiz[${i}].q`,
        label: `Quiz ${i + 1} — question`,
        kind: "text" as const,
        max: 60,
        guide: `Love-quiz question ${i + 1} about the two of them (where they met, a first, an inside joke, who fell first, the sender's favourite thing about them), answerable from the story. Each question different, and never 'Who fell first?' (the page already asks it third). Under 55 characters, ends with a question mark.`,
        example: "Where did we first meet?",
      },
      {
        path: `extras.quiz[${i}].right`,
        label: `Quiz ${i + 1} — right answer`,
        kind: "text" as const,
        max: 30,
        guide: `The right answer to quiz question ${i + 1}, taken from the story; short (a few words), at most one emoji. Under 28 characters.`,
        example: "College canteen",
      },
      {
        path: `extras.quiz[${i}].wrong1`,
        label: `Quiz ${i + 1} — wrong answer`,
        kind: "text" as const,
        max: 30,
        guide: `A believable but wrong answer to quiz question ${i + 1}, the same kind of thing as the right answer, different from it. Under 28 characters.`,
        example: "A cousin's wedding",
      },
      {
        path: `extras.quiz[${i}].wrong2`,
        label: `Quiz ${i + 1} — another wrong answer`,
        kind: "text" as const,
        max: 30,
        guide: `A second wrong answer to quiz question ${i + 1}, a little funny, different from the other two. Under 28 characters.`,
        example: "On Instagram",
      },
    ]),
    {
      path: "extras.promise",
      label: "Your promise",
      kind: "text",
      max: 140,
      guide:
        "What the sender promises if they say yes, written inside the ring box: one or two warm, concrete promises tied to the story (their favourite things, how the sender will show up for them). First person, no 'forever and ever' clichés. Under 130 characters.",
      example: "I'll hold your hand through every boring Monday and every big adventure.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button runs away. It must match 'What you're asking': girlfriend → a 'Will you be my girlfriend?' question; boyfriend → a 'Will you be my boyfriend?' question; marry → a 'Will you marry me?' question; date → a 'Will you go out with me?' question. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you be my girlfriend? 💗",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, overjoyed, one short sentence, ideally with a callback to the story. Under 75 characters." + VW_TONE,
      example: "Best day of my life. I'm never letting go of your hand 💗",
    },
  ],
  // The first screen already prints a "Psst, <name>…" greeting above the opening line.
  forbiddenOutput: [...VW_FORBIDDEN, "Psst"],
};
