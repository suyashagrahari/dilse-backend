import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * dandiya-partner — "Be My Dandiya Partner", a Navratri Dandiya-night
 * invitation. Runs on the Valentine's-week engine, so paths resolve against
 * `ValentineDayData` (client/app/(templates)/_valentine/types.ts) and the
 * extras keys are defined in server/src/config/valentineDays.ts.
 *
 * The demo seeds 4 photos and 9 night lines. `tone` is declared as an enum on
 * purpose (who the invitation is for is something a story DOES say, and it
 * changes the question). Not declared: myColor (a pure visual choice) and
 * eventDate (the sender picks a date; a story rarely names one and the model
 * cannot know the year). Venue, time and dress code are declared but must come
 * from the story or stay empty — see their guides.
 */
export const dandiyaPartner: AiFillTemplateSchema = {
  slug: "dandiya-partner",
  audience: "partner",
  premise:
    "A Navratri invitation page that asks someone to be the sender's Dandiya partner. The recipient opens an embroidered envelope by clashing a pair of dandiya sticks, lights nine diyas (one line from the sender under each, one per night of Navratri), plays a short dhol-beat game, picks the colour they will dance in and sees the sender's colour beside it, watches their photos dance round a garba circle, reads the sender's note, sees an invitation ticket with the night's details, and finally answers a question while the No button twirls away. It ends on a 'Dandiya Pass'. Usually for a partner or a crush, sometimes a best friend as a garba buddy — follow the story. Festive, cute, romantic, never religiously preachy." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Dandiya invitation",
      letterWhere:
        "It is a note tucked into a bandhani dupatta that they read just before seeing the invitation, so it should say why the sender wants THEM as their Dandiya partner this Navratri: a garba or festival memory from the story if there is one, otherwise something real about them, and a warm, playful ask. Every past moment in it must be one the story itself tells. With a short story, keep the whole letter in the present and the coming nine nights: how the sender feels right now, the moment they decided to ask, what they are looking forward to in the circle, and a playful promise (practising the steps, saving them the first round). Never describe rituals or worship.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their Dandiya Pass, the keepsake at the very end.",
      photosWhere: "the photos dance round a garba circle in round mirror-work frames.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with the sender's name underneath.",
    }).map((f) =>
      // Measured: "She calls me Golu" came back as THEIR pet name. Say whose nickname it is.
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "Who you're inviting",
      kind: "enum",
      options: ["romantic", "crush", "friends"],
      guide:
        "Who the invitation is for, from the story: 'romantic' for a partner, spouse, girlfriend or boyfriend; 'crush' when the sender has not told them yet or they are only getting to know each other; 'friends' for a best friend or friend. When unsure, 'romantic'.",
    },
    {
      path: "extras.openingLine",
      label: "On the envelope",
      kind: "text",
      max: 60,
      guide:
        "A short teaser printed under 'Psst, <their name>…' on the very first screen, lowercase-casual, with a light Navratri touch (the dhol, the garba circle, the nine nights) and one detail from the story where it fits. Under 50 characters, at most one emoji.",
      example: "the dhol is calling 🥁",
    },
    {
      path: "extras.nightLines",
      label: "Nine nights, nine diyas",
      kind: "list",
      max: 9,
      itemMax: 70,
      guide:
        "Exactly 9 short lines, one under each diya they light (the page already labels each diya with its night number, so never write the night or its number), said to them ('you'). Use the real things the story gives — a habit, a memory, something they do that the sender loves, an inside joke — one per line. When the story runs out of facts, the remaining lines say what the sender feels or hopes for this Navratri (saving them the first round, practising the steps, the two of them in the circle), never a habit, memory or event the story does not state. Each under 65 characters." +
        VW_TONE,
      example: "You, laughing at my terrible jokes anyway.",
    },
    {
      path: "extras.lookLine",
      label: "After they pick a colour",
      kind: "text",
      max: 70,
      guide:
        "One playful line the sender says when the recipient has picked the colour they'll dance in and sees the sender's colour beside it — about the two of them being the best-looking pair in the garba circle. Under 65 characters." + VW_TONE,
      example: "We're going to be the brightest pair in the circle.",
    },
    {
      path: "extras.eventTime",
      label: "Time",
      kind: "text",
      max: 24,
      guide:
        "The time the Dandiya night starts, ONLY when the story states one (for example '8 PM onwards'). If the story gives no time, return an empty string.",
    },
    {
      path: "extras.venue",
      label: "Venue",
      kind: "text",
      max: 60,
      guide:
        "Where the garba or Dandiya night is, ONLY when the story names the place (a society ground, a club, a pandal, a city venue). Copy the story's own words, shortened. If the story names no place, return an empty string.",
    },
    {
      path: "extras.dressCode",
      label: "Dress code",
      kind: "text",
      max: 50,
      guide:
        "The dress code for the night, ONLY when the story mentions what to wear or a colour theme. Otherwise return an empty string.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button twirls away. It must match the 'Who you're inviting' field: romantic → a 'Will you be my Dandiya partner?' question; crush → a 'Be my Dandiya partner this Navratri?' question; friends → a 'Will you be my garba buddy, all nine nights?' question. You may work in one detail from the story. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you be my Dandiya partner? 💛",
    },
    {
      path: "extras.yesLine",
      label: "After they say YES",
      kind: "text",
      max: 80,
      guide:
        "What appears the moment they say yes: first person, joyful, one short sentence with a playful Dandiya callback (every song, every round, the sticks, the circle) tied to the story where possible. Under 75 characters." + VW_TONE,
      example: "Then it's a date. Every song, every round, every night.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
