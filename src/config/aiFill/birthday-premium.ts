import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * birthday-premium — "Birthday Surprise ✦ Premium", a pop-up birthday
 * storybook on the Valentine's-week engine. Paths resolve against
 * `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys
 * are defined in server/src/config/valentineDays.ts.
 *
 * What makes these pages land (the paid "birthday website" makers): a
 * years-together timeline that reads their story back to them, specific
 * reasons over generic praise, a real gift or plan revealed at the end. The
 * demo seeds 5 wishes, 4 milestones and 6 reasons, so those indices exist.
 *
 * Not declared: palette (a visual choice), togetherSince (a date the sender
 * types, never guessed) and askWhen (the sender's own decision in the form).
 */
/** Milestones 1–3 when the story runs out of moments; the 4th is always today. */
const MILESTONE_FALLBACK = [
  { when: "The beginning", title: "The day we met 👋" },
  { when: "A little later", title: "The first I love you 💗" },
  { when: "Somewhere along", title: "Every ordinary day ☀️" },
  { when: "Today", title: "Your birthday 🎂" },
] as const;

const BP_TONE = " Celebrate them, not the sender: specific, warm and a little playful; a real detail from the story beats any compliment." + VW_TONE;

export const birthdayPremium: AiFillTemplateSchema = {
  slug: "birthday-premium",
  audience: "partner",
  premise:
    "An interactive pop-up birthday storybook. The birthday person peels open a storybook with their name on the cover, blows a dandelion whose seeds each carry a wish for their year, rides a hot-air balloon over the milestones of the couple's story, plays a claw machine where every capsule holds one reason the sender loves them, watches a photo-booth strip of their photos develop, bakes a birthday cake (stacks the tiers, picks the frosting, sprinkles), scratches a golden ticket that reveals a real birthday surprise, reads the sender's pop-up letter, answers a question and ends with a stamped birthday passport. Usually for a girlfriend, boyfriend or spouse — follow the story. Cute, romantic and celebratory." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "birthday",
      letterWhere:
        "It is the sender's birthday letter, the last chapter of the storybook, read on a pop-up page. Recall one or two real moments from the story, say what the sender loves about who they are, and wish them something specific for the year ahead. Only events the story states. With a short story, write only feelings and wishes — how the sender feels about them today and what they hope this year brings them — with no remembered scenes and no habits of theirs at all; every sentence must be true of anyone the sender loves this much.",
      letterMax: 1500,
      endLineWhere: "printed on the last page of their birthday passport, the keepsake at the very end — a short toast to their new year.",
      photosWhere: "the photos print out of a photo booth as a strip of frames that slowly develop.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with a sign-off line and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the birthday person), taken from the story — never a nickname the birthday person uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "The feel",
      kind: "enum",
      options: ["cute", "emotional", "funny"],
      guide:
        "The voice the story asks for: 'emotional' when it is deep, sentimental or long-distance; 'funny' when it is full of jokes, teasing or banter; otherwise 'cute'.",
    },
    {
      path: "extras.age",
      label: "The topper on the cake",
      kind: "text",
      max: 3,
      guide: "The age they are turning, as digits only, ONLY when the story states it outright. Otherwise leave it empty — the cake then gets a heart topper.",
      example: "24",
    },
    {
      path: "extras.coverLine",
      label: "On the storybook cover",
      kind: "text",
      max: 60,
      guide: "A short line printed under their name on the storybook cover, like the subtitle of a children's book about them. Under 50 characters, at most one emoji.",
      example: "a little book about my favourite person 📖",
    },
    {
      path: "extras.wishes",
      label: "Dandelion wishes",
      kind: "list",
      max: 5,
      itemMax: 40,
      guide:
        "Exactly 5 very short wishes for their year ahead, one on each dandelion seed — tied to their dreams, plans or small joys from the story where it names any (a trip, a job, a hobby, more sleep). Each 2–6 words, under 36 characters, no emoji." +
        BP_TONE,
      example: "the Goa trip, finally",
    },
    // The balloon ride: three moments from their story, in order, then always "today".
    ...MILESTONE_FALLBACK.flatMap((fb, i) => [
      {
        path: `extras.milestones[${i}].when`,
        label: `Milestone ${i + 1} — when`,
        kind: "text" as const,
        max: 24,
        guide:
          i === 3
            ? "Always exactly 'Today'."
            : `When milestone ${i + 1} happened: the month and year or season the story gives for it; when it gives none, '${fb.when}'. Under 22 characters.`,
        example: i === 3 ? "Today" : "June 2023",
      },
      {
        path: `extras.milestones[${i}].title`,
        label: `Milestone ${i + 1} — title`,
        kind: "text" as const,
        max: 40,
        guide:
          i === 3
            ? "Always exactly 'Your birthday 🎂' — the ride ends on today."
            : `Milestone ${i + 1} of 3 on a balloon ride over their story, oldest first: the ${["first", "second", "third"][i]} real moment the story gives (how they met, the first date, moving in, a trip they took). When the story has no ${["first", "second", "third"][i]} moment, exactly '${fb.title}'. Under 36 characters, at most one emoji.`,
        example: i === 3 ? "Your birthday 🎂" : "Our first chai date ☕",
      },
      {
        path: `extras.milestones[${i}].line`,
        label: `Milestone ${i + 1} — the memory`,
        kind: "text" as const,
        max: 80,
        guide:
          (i === 3
            ? "One short first-person sentence for today, their birthday: how the sender feels celebrating them."
            : `One short first-person sentence about milestone ${i + 1}: what the sender remembers or felt. Only details the story states; for '${fb.title}', a feeling with no scene in it.`) +
          " Under 75 characters." +
          VW_TONE,
        example: i === 3 ? "And somehow I love you more than on page one." : "You were 20 minutes late and I'd have waited 20 years.",
      },
    ]),
    {
      path: "extras.reasons",
      label: "Claw machine: reasons I love you",
      kind: "list",
      max: 6,
      itemMax: 80,
      guide:
        "Exactly 6 short lines, one inside each capsule they win from a claw machine, each a different specific thing the sender loves about them: a habit, a quirk, a way they make the sender feel, something they did. Pull details from the story; never invent events. When the story gives few details, write six lines about who they are and how they make the sender feel — qualities, not habits or scenes — so the list is never empty. Each under 75 characters." +
        BP_TONE,
      example: "How you narrate your day like a podcast. I'd subscribe forever.",
    },
    {
      path: "extras.cakeLine",
      label: "After they bake the cake",
      kind: "text",
      max: 90,
      guide: "A short, sweet line that appears once they have baked and decorated their birthday cake — playful, about cake and them, using a treat they love from the story where it names one. Under 85 characters." + BP_TONE,
      example: "Best baker in the world. Still not as sweet as you 🍰",
    },
    {
      path: "extras.ticketTitle",
      label: "The golden ticket",
      kind: "text",
      max: 32,
      guide: "The name of the real birthday surprise they scratch off a golden ticket: a plan or gift from the story where it names one (a dinner, a trip, a concert, a day out); with no plan in the story, a simple promise such as a perfect birthday date or a day of their favourite things. Always fill it. Under 30 characters, at most one emoji.",
      example: "Dinner at the rooftop café 🌇",
    },
    {
      path: "extras.ticketLine",
      label: "The small print",
      kind: "text",
      max: 90,
      guide: "The ticket's small print: when or what to expect, or a cute condition. First person, under 85 characters. Do not invent a time or place the story does not give." + VW_TONE,
      example: "Wear the blue dress. I'll handle everything else.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide: "The question they answer at the end: asking to spend their birthday together — a date, a dinner, the evening — which they then answer with tonight, this weekend or 'you plan it'. Keep any trip or big plan for the golden ticket instead. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Birthday date with me tonight? 🥂",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, excited and sweet, one short sentence, ideally a hint at the plan from the story. Under 75 characters." + VW_TONE,
      example: "Best birthday gift? You saying yes. Wear something cute 💗",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
