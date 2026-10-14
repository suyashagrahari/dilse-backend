import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * proposal-premium — "The Proposal ✦ Premium", the premium edition of the
 * proposal page on the Valentine's-week engine: a fairytale garden at golden
 * hour. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * What makes someone say yes (and cry) is specificity: every carousel
 * chapter, petal reason and promise comes from the couple's own story, never
 * from a generic love-quote pool. The demo seeds 4 chapters and 7 reasons, so
 * those indices always exist.
 *
 * Not declared: palette (a visual choice), since (a real date the sender
 * picks in a date input — the model must not guess it) and answerMode /
 * noTries (whether an honest "Let me think about it" is allowed is the
 * sender's own decision).
 */
const PROPOSAL_TONE = " Dreamy, sincere and a little nervous; playful where the story is playful. No pressure, no guilt, nothing possessive or clingy." + VW_TONE;

export const proposalPremium: AiFillTemplateSchema = {
  slug: "proposal-premium",
  audience: "partner",
  premise:
    "A premium interactive proposal page set in a pastel garden at golden hour: the sender asks the recipient to be theirs, to be their boyfriend, or to marry them. The recipient presses a wax seal until an invitation opens ('<sender> requests the pleasure of <recipient>… for one very important question'), lights a string of fairy lights where every bulb reveals one word of a short line, spins a carousel where every horse holds one chapter of their story from the first meeting to today, drags a key into a heart-shaped love lock that counts their days together, plucks a flower petal by petal where every petal is one reason the sender loves them (it always ends on 'loves me'), swipes through photos, pulls a ribbon to unroll the sender's love letter, swipes open a ring box where the ring rises with the sender's promise, and finally answers the big question while the No button wilts. Saying yes sets off hearts, they slide the ring onto a hand, and they get an 'Officially Ours' certificate and a save-the-date card for the couple's first date as a couple. Romantic, soft and sincere. Every chapter, petal and promise comes from the sender's own story; all four chapters are always written, even from a short story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "proposal",
      letterWhere:
        "It is the sender's love letter, rolled into a scroll tied with a ribbon, read just before the ring box and the proposal. Say when and how the sender started falling for them (only events the story states), what they love about them in specific terms, how life feels with them, and what the sender wants with them now — building up to the question without asking it outright (the page asks it after the ring box). With a short story, stay in the present: how the sender feels and what they hope for.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their 'Officially Ours' certificate, the keepsake at the very end.",
      photosWhere: "the photos are a deck of keepsake cards they swipe away one by one under 'Our little keepsakes'.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with 'Forever yours,' and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "What you're asking",
      kind: "enum",
      options: ["girlfriend", "boyfriend", "marry"],
      guide:
        "What the sender is asking, from the story: 'marry' for a marriage proposal (they are already together and the sender wants to marry them); 'boyfriend' to ask a man to be their boyfriend; otherwise 'girlfriend' (asking her, or anyone, to be theirs).",
    },
    {
      path: "extras.openingLine",
      label: "On the invitation",
      kind: "text",
      max: 60,
      guide: "A short line on the wax-sealed invitation, under a heading that already says 'You're invited' and a greeting with their name — so do not greet them, use their name or repeat 'invited'. Lowercase-casual and dreamy, hinting at something special without asking the question. Under 50 characters, at most one emoji.",
      example: "a garden I grew just for you 🌷",
    },
    {
      path: "extras.lightsLine",
      label: "On the string lights",
      kind: "text",
      max: 48,
      guide: "A short sentence of 4 to 7 words, one word per fairy-light bulb, lit one by one: about how they light up the sender's life, in the story's own spirit. No emoji, no punctuation except an apostrophe, all lowercase.",
      example: "you light up my whole world",
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
            : `A short label for carousel chapter ${i + 1}, in order from the first meeting onwards. Use the story's own timing words (a year, a month, 'Last month', 'Second year'); when the story gives no timing, name the place or the moment instead (e.g. the café, the trek) — never invent a time span the story does not state. Under 20 characters.`,
      },
      {
        path: `extras.story[${i}].title`,
        label: `Chapter ${i + 1} — title`,
        kind: "text" as const,
        max: 36,
        guide:
          i === 3
            ? "Chapter 4's title: where they are now — the sender building this little garden for them because they cannot keep it in. One emoji. Under 32 characters."
            : `The title of carousel chapter ${i + 1}: one moment from the story, in order (how they met, the first long talk or date, the moment the sender knew…). Only moments the story states; when the story has fewer moments than chapters, make this one about something they share every day (a habit, a place, a joke) — chapter 4 alone is about today. One emoji. Under 32 characters.`,
      },
      {
        path: `extras.story[${i}].line`,
        label: `Chapter ${i + 1} — what happened`,
        kind: "text" as const,
        max: 100,
        guide: `One sentence about chapter ${i + 1}, first person to them, with one small specific detail from the story (what they said, wore, ordered, laughed at). Never invent events, and never ask the big question here — the page asks it at the end. Under 95 characters.` + PROPOSAL_TONE,
        example: "You laughed at my terrible joke and I forgot the rest of my sentence.",
      },
    ]),
    {
      path: "extras.reasons",
      label: "Reasons I love you (the petals)",
      kind: "list",
      max: 7,
      itemMax: 70,
      guide:
        "Exactly 7 short lines, one on each petal they pluck: each a different, specific reason the sender loves them — a habit, a quality, a way they make the sender feel — using the story's details where it gives them. Second person ('Your laugh…', 'You remember…'). The last one is the sweetest. Each under 65 characters." +
        PROPOSAL_TONE,
      example: "You remember the tiny things nobody else notices.",
    },
    {
      path: "extras.promise",
      label: "Your promise (inside the ring box)",
      kind: "text",
      max: 140,
      guide:
        "What the sender promises if they say yes, rising out of the ring box with the ring: start with 'If you say yes, I promise' and give one or two warm, concrete promises tied to the story (their favourite things, how the sender will show up for them). No 'forever and ever' clichés. Under 130 characters.",
      example: "If you say yes, I promise to hold your hand through every boring Monday and every big adventure.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button wilts. It must match 'What you're asking': girlfriend → a 'Will you be mine?' or 'Will you be my girlfriend?' question; boyfriend → a 'Will you be my boyfriend?' question; marry → a 'Will you marry me?' question. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you be mine? 💗",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, overjoyed, one short sentence, ideally with a callback to the story. Under 75 characters." + VW_TONE,
      example: "You just made me the happiest person in the whole world 🥹",
    },
    {
      path: "extras.datePlan",
      label: "Save the date",
      kind: "text",
      max: 80,
      guide:
        "Their first date as an official couple, printed on a save-the-date card after the yes: a place and a time, taken from the story's favourite places or habits when it gives them (their café, a drive, street food), e.g. 'Dinner at our café, this Saturday at 8'. Never invent a calendar date. Under 70 characters, at most one emoji.",
      example: "Dinner at our café, this Saturday at 8 🌙",
    },
  ],
  // The first screen already prints a "Psst, <name>…" greeting and "You're invited" above the opening line.
  forbiddenOutput: [...VW_FORBIDDEN, "Psst"],
};
