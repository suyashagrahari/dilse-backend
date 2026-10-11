import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-valentines-day — "Our Valentine Night" (Valentine's week finale, 14 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts. The demo
 * seeds 7 week lines, 4 stats and 5 "No" lines.
 * Not declared: togetherSince (a date the sender picks), datePlan (logistics).
 */
export const valentinesDay: AiFillTemplateSchema = {
  slug: "happy-valentines-day",
  audience: "partner",
  premise:
    "The Valentine's Day finale page, a midnight-and-lanterns night: the recipient tears an ADMIT TWO ticket, lights seven lanterns (one per day of Valentine's week, each with a line), flips through 'Love Wrapped' stat cards about the couple, pulls the ribbon of a gift box to read the sender's letter, and answers 'Be my Valentine forever?' while the No button runs away. Cinematic, grateful, a little funny." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Valentine's Day",
      letterWhere: "It rises out of the grand gift box and unfolds by candlelight. It may nod to the week (roses, teddies, too many chocolates). The big question is asked on a later screen, so the letter contains no question to them at all; its last line just hints that one more thing is coming.",
      letterMax: 2000,
      endLineWhere: "under the rising lanterns at the very end.",
      photosWhere: "the photos hang on a gallery wall under a following spotlight.",
      notes: true,
    }),
    {
      path: "extras.ticketLine",
      label: "Ticket tagline",
      kind: "text",
      max: 50,
      guide: "The fine-print tagline on the ADMIT TWO ticket, like the small print on a cinema ticket, with one detail from the story. Under 46 characters.",
      example: "Admit two · one night · forever seats",
    },
    {
      path: "extras.weekLines",
      label: "One line per day of the week",
      kind: "list",
      max: 7,
      itemMax: 70,
      guide: "Exactly 7 lines, in this order, one per lantern: 1 a rose, 2 the moment they said yes (told as a memory, not asked again), 3 something sweet to eat, 4 a teddy or something soft to keep close, 5 a promise, 6 a hug, 7 a kiss (family-safe). Each line is about that day's object AND about them, with a detail from the story where one fits. All seven are statements — none ends with a question mark. Do not write the day's name in the line. Each under 65 characters." + VW_TONE,
      example: "The rose was just an excuse to see you smile.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.stats[${i}].label`,
        label: `Love Wrapped card ${i + 1} — label`,
        kind: "text" as const,
        max: 30,
        guide: `The label of 'Love Wrapped' stat card ${i + 1}, worded like a year-in-review app category (top destination, most-said phrase, snack on repeat, things stolen…), not like a photo caption. Each card a different category. Under 28 characters.`,
        example: "Our song on repeat",
      },
      {
        path: `extras.stats[${i}].value`,
        label: `Love Wrapped card ${i + 1} — value`,
        kind: "text" as const,
        max: 24,
        guide: `The big value on stat card ${i + 1}, taken from the story — a phrase, a place, a food, a time. Use a number only if the story gives it; never estimate or invent a count — use '∞' or a word for the funny ones instead. Under 22 characters.`,
        example: "2 a.m., on call",
      },
    ]),
    {
      path: "extras.metPlace",
      label: "Where you met",
      kind: "text",
      max: 40,
      guide: "Where they first met, from the story, short (a place and a city). Under 38 characters. Leave empty if the story does not say.",
      example: "College canteen, Pune",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      required: true,
      guide: "The final question, asked with the runaway No button. A Valentine-forever question that fits the relationship in the story, in the story's language and script (Latin letters for a Hinglish story), with the right gender for the recipient. Under 55 characters, ends with a question mark.",
      example: "Will you be my Valentine… forever?",
    },
    {
      path: "extras.noLines",
      label: "What the No button says",
      kind: "list",
      max: 5,
      itemMax: 40,
      guide: "Exactly 5 lines the runaway 'No' button says as it dodges their finger, escalating into comedy: an error message, the button getting tired, a bribe taken from the story (their favourite food, the thing they always steal), finally giving up. Light and silly — the joke is always on the button itself. Each under 36 characters, same language as the story.",
      example: "Error 404: No not found",
    },
    {
      path: "extras.ps",
      label: "P.S.",
      kind: "text",
      max: 100,
      guide: "An optional playful P.S. after the letter (the page adds 'P.S.' itself if missing), a tease about tonight or a callback to an inside joke. Under 95 characters." + VW_TONE,
      example: "P.S. Dress up. I have plans 😌",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
