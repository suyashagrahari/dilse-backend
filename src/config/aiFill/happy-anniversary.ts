import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-anniversary — "Our Little Love Museum", an evergreen anniversary page
 * on the Valentine's-week engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * What makes an anniversary page land is the couple's own timeline and their
 * inside jokes ("specific beats sentimental"), so every exhibit, reason and
 * plaque comes from the story. The demo seeds 4 milestones, 4 reasons and 3
 * promises, so those indices always exist.
 *
 * Not declared: palette and tone (visual / voice choices the sender makes),
 * togetherSince (a date picker; stories say "three years", not a day) and
 * awardTitle (the tone's default is a better title than an invented one).
 */
const ANNI_TONE = " Warm, a little funny and sincere, like someone who has loved them for a while and still can't believe their luck. Nothing possessive." + VW_TONE;

export const happyAnniversary: AiFillTemplateSchema = {
  slug: "happy-anniversary",
  audience: "partner",
  premise:
    "An interactive anniversary page built as a tiny museum about the couple. The recipient tears the stub off an admission ticket, pulls a lever that rolls up how long they have been together (years, months, days, hours, with fun stats), swipes through their photos hung as framed artworks with museum plaques (each photo's caption is the artwork's title, its note the plaque's caption), taps the numbers on an audio guide to hear the milestones of their story, brushes the dust off an old painting that shows their first date, shakes a snow globe until one reason the sender loves them settles out of the snow each time, watches the sender's letter write itself into the museum guestbook, reads a 'next exhibition' poster with the sender's promises for the coming year, answers 'Another year of us?', and unveils a 'Masterpiece of the Year' award with their name on it. For a girlfriend, boyfriend, wife, husband or partner — dating or married, follow the story. Every exhibit, reason and promise comes from the sender's own story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "anniversary",
      letterWhere:
        "It is the sender's anniversary letter, written into the museum's guestbook near the end. Look back at what this time together has been (only events the story states), say what the sender loves about them in specific terms, thank them for one real thing, and look forward to the next year together.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their 'Masterpiece of the Year' award, the keepsake at the very end.",
      photosWhere: "each photo hangs in a gilt frame in the museum's portrait gallery, and the caption is the artwork's title on its plaque.",
      captionExtra: "Write it as a playful museum artwork title in Title Case, e.g. 'Portrait of a Good Day' or 'Two Fools in the Rain'.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.relation",
      label: "They are your…",
      kind: "enum",
      options: ["girlfriend", "boyfriend", "wife", "husband", "partner"],
      guide:
        "Who the recipient is to the sender, from the story: 'wife' or 'husband' when they are married, 'girlfriend' or 'boyfriend' when they are dating, 'partner' when the story makes neither clear. It is printed on their award ('the best <word> in the whole collection').",
    },
    {
      path: "extras.ticketLine",
      label: "Small print on their ticket",
      kind: "text",
      max: 50,
      guide: "A tiny, funny line in the small print of their admission ticket, about this museum or the two of them (an inside joke works best). Lowercase-casual, under 44 characters, at most one emoji.",
      example: "valid for one cuddle at the exit",
    },
    {
      path: "extras.funStat",
      label: "One fun stat",
      kind: "text",
      max: 60,
      guide:
        "One playful made-up statistic about the two of them, shown with the sunrises and heartbeats: a label, a colon and a number, built on a habit or an inside joke from the story (food they steal, songs they sing, times one of them was late). Under 54 characters, at most one emoji.",
      example: "Times you stole my hoodie: all of them 🧥",
    },
    // All four exhibits are always written (a skipped one would keep the demo's exhibit).
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.milestones[${i}].when`,
        label: `Exhibit ${i + 1} — when`,
        kind: "text" as const,
        max: 24,
        guide:
          i === 3
            ? "When exhibit 4 happens: the year or month the story gives for its newest milestone, or 'Today'. Under 20 characters."
            : `A short label for exhibit ${i + 1}, taken from the story's own words: the year or month only when the story attaches it to this exact moment, otherwise the place it happened (e.g. 'Irani café', 'Coorg') or 'Every day'. Under 20 characters.`,
      },
      {
        path: `extras.milestones[${i}].title`,
        label: `Exhibit ${i + 1} — title`,
        kind: "text" as const,
        max: 36,
        guide:
          i === 3
            ? "Exhibit 4's title: the most recent milestone in the story — for a married couple usually the wedding, otherwise the latest big moment (moving in, the proposal), or 'Us, today' when the story has none. Under 32 characters."
            : `The title of exhibit ${i + 1}: one milestone from the story, in order (how they met, the first date, the first trip, moving in, the proposal…), keeping the newest milestone for exhibit 4. When the story has fewer milestones than exhibits, make this one about something the story says they love or do together (a habit, a song, a flower, a joke). Under 32 characters.`,
      },
      {
        path: `extras.milestones[${i}].line`,
        label: `Exhibit ${i + 1} — the guide says`,
        kind: "text" as const,
        max: 110,
        guide: `What the audio guide says about exhibit ${i + 1}: one or two short sentences, first person to them, built only from what the story says about that moment (what they said, ordered, laughed at). Under 104 characters.` + ANNI_TONE,
        example: "Two coffees, four hours, and a waiter who gave up on us.",
      },
    ]),
    {
      path: "extras.firstPlace",
      label: "The restored painting's title",
      kind: "text",
      max: 40,
      guide: "The title of the old painting of where it all began: the place of their first date or first meeting exactly as the story names it, written like a painting title, with the year only if the story gives it. When the story names no such place, title it after something the story says they love (e.g. 'Still Life with Sunflowers'). Under 36 characters, no emoji.",
      example: "The Corner Bookshop, 2020",
    },
    {
      path: "extras.firstMemory",
      label: "What the painting shows",
      kind: "longtext",
      max: 160,
      guide: "What the painting shows, revealed when the dust is brushed off: one or two sentences, first person to them, retelling the single most vivid detail the story gives about how it all began (what they did or said). When the story says nothing about how they met, write about the thing named in the painting's title instead. Under 150 characters." + ANNI_TONE,
      example: "You spilled coffee on my notes and apologised by buying me three more.",
    },
    {
      path: "extras.reasons",
      label: "Snow globe reasons",
      kind: "list",
      max: 4,
      itemMax: 80,
      guide:
        "Exactly 4 short lines, one revealed each time they shake the snow globe: each a different, specific reason the sender loves them — a habit, a quality, a way they make the sender feel — using the story's details where it gives them. Second person. Each under 74 characters." +
        ANNI_TONE,
      example: "You still hold my hand like it's the first time.",
    },
    {
      path: "extras.promises",
      label: "Next year's exhibition",
      kind: "list",
      max: 3,
      itemMax: 70,
      guide:
        "Exactly 3 short items 'featuring' on the poster for the couple's next year together: concrete, keepable plans or promises tied to the story (a trip they keep talking about, a habit to keep, something to do more of). Short phrases, not full sentences, each under 48 characters.",
      example: "More road trips, fewer screens",
    },
    {
      path: "extras.plan",
      label: "Opening night",
      kind: "text",
      max: 80,
      guide: "The plan for the anniversary or the coming year that the story mentions, keeping the story's own place and its own timing words exactly ('next year', 'this December'). When the story mentions no plan, write: 'A surprise. Keep the evening free 🤫'. Under 70 characters.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide: "The question on the 'next exhibition' poster — asking for another year together (both buttons answer yes). You may use their pet name. Under 54 characters, ends with a question mark and at most one emoji.",
      example: "Another year of us? 🥺💗",
    },
    {
      path: "extras.yesLine",
      label: "When they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, overjoyed, one short sentence, ideally with a callback to the story. Under 75 characters." + VW_TONE,
      example: "Best answer ever. Happy anniversary, my favourite human 💗",
    },
  ],
  // A sender missing from the story came back as the literal string "null".
  forbiddenOutput: [...VW_FORBIDDEN, "null"],
};
