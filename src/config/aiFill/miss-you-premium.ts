import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * miss-you-premium — "Miss You ✦ Premium", the premium edition of Miss You on
 * the Valentine's engine: one long-distance day from morning to sunrise. Paths
 * resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * Written to what long-distance couples treasure: the tiny daily rituals
 * (good-morning texts, voice notes), a date to look forward to, the specific
 * things they miss, reassurance instead of guilt. The demo seeds 3 voice notes,
 * 5 picnic lines and 6 things I miss, so those indices always exist.
 *
 * Not declared: palette (a visual choice), distanceKm / unit (worked out from
 * the two cities on the page) and answerMode (the sender's own decision).
 */
const MY_TONE = " Warm, cute and reassuring: longing without guilt-tripping, never 'you never call', never sad-for-effect." + VW_TONE;

const PICNIC: readonly (readonly [item: string, example: string])[] = [
  ["the picnic basket", "Packed with everything you like. And nothing you don't."],
  ["the chai", "Two cutting chais. Yours, and the half of mine you'll steal."],
  ["the strawberries", "I'll feed you the biggest one. Don't argue."],
  ["one earphone each (a shared song)", "Our playlist, one earphone each, heads touching."],
  ["the sunflowers", "Because you said they look like happy little suns."],
];

export const missYouPremium: AiFillTemplateSchema = {
  slug: "miss-you-premium",
  audience: "partner",
  premise:
    "A premium interactive 'I miss you' page for someone far away, told as one day from morning to the next sunrise. The recipient draws the curtains open and a little plane writes their name in the sky; tunes a radio dial to find the sender's 'voice notes' (shown as text); pulls a photo-booth strip of their photos; sets up a virtual picnic date by dragging things onto a blanket, each with a line from the sender; tears calendar pages off down to the day they meet; drags a message in a bottle out of the waves and reads the sender's letter; taps along until their two heartbeats sync; joins stars into their initials, each line lighting a thing the sender misses; and answers 'Video call tonight?' on a tin-can phone. It ends at sunrise with an airmail postcard. Usually for a girlfriend, boyfriend or spouse in a long-distance relationship, sometimes a crush or a best friend — follow the story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "miss-you-premium",
      letterWhere:
        "It is the sender's letter, found inside a message in a bottle at golden hour. Say what the distance feels like in the story's own terms (only places, events and habits the story states), the specific things the sender misses, what they love about them, and something to look forward to when they meet again. Longing, never guilt; hopeful at the end.",
      letterMax: 1500,
      endLineWhere: "handwritten on the back of their airmail postcard, the keepsake at the very end.",
      photosWhere: "the photos come out of a photo booth as a strip, developing one by one.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with 'Missing you, always,' and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "Who you're missing",
      kind: "enum",
      options: ["partner", "crush", "bestie"],
      guide:
        "Who the page is for, from the story: 'partner' for a girlfriend, boyfriend, spouse or partner; 'crush' when they are not together yet or it is complicated; 'bestie' for a best friend or friend. When unsure, 'partner'.",
    },
    {
      path: "extras.openingLine",
      label: "When the curtains open",
      kind: "text",
      max: 60,
      guide: "A short good-morning line from the sender, shown when the recipient opens the curtains: first person or a greeting, casual, about being far apart under the same sky. Under 50 characters, at most one emoji.",
      example: "Good morning from far away ☀️",
    },
    {
      path: "extras.yourCity",
      label: "Their city",
      kind: "text",
      max: 30,
      guide: "The city the RECIPIENT lives in now, only if the story names it (just the city name, e.g. 'Mumbai'). Leave empty if the story does not say — never guess.",
      example: "Mumbai",
    },
    {
      path: "extras.myCity",
      label: "Your city",
      kind: "text",
      max: 30,
      guide: "The city the SENDER lives in now, only if the story names it (just the city name). Leave empty if the story does not say — never guess.",
      example: "Bengaluru",
    },
    {
      path: "extras.meetDate",
      label: "When you'll see them",
      kind: "date",
      guide: "The date the two will next meet, as YYYY-MM-DD, ONLY if the story states a specific future date. Otherwise leave it empty (the page then says 'soon').",
    },
    {
      path: "extras.voiceNotes",
      label: "Voice notes on the radio",
      kind: "list",
      max: 3,
      itemMax: 90,
      guide:
        "Exactly 3 short 'voice notes' the recipient finds by tuning a radio, written the way the sender would actually talk in a voice message: casual, first person, everyday (a good-morning check-in, a small thing that reminded the sender of them, a goodnight). Use the story's details where it gives them; never invent events. Each under 85 characters." +
        MY_TONE,
      example: "Good morning, sleepyhead. Did you drink water? Okay, now drink water. Miss you.",
    },
    ...PICNIC.map(([item, example], i) => ({
      path: `extras.picnicLines[${i}]`,
      label: `Picnic — ${item}`,
      kind: "text" as const,
      max: 70,
      guide: `The sender's line for ${item} on their planned picnic date, shown when the recipient drags it onto the blanket: first person, playful or sweet, about doing it together (use the story's favourites where it gives them). Under 65 characters.` + VW_TONE,
      example,
    })),
    {
      path: "extras.heartLine",
      label: "When your heartbeats sync",
      kind: "text",
      max: 80,
      guide: "What appears when the two hearts on the page beat as one: first person, tender, one short sentence about being close despite the distance. Under 75 characters." + VW_TONE,
      example: "Two cities, one heartbeat. Yours. 💓",
    },
    {
      path: "extras.missThings",
      label: "Things I miss about you",
      kind: "list",
      max: 6,
      itemMax: 70,
      guide:
        "Exactly 6 short lines, each lit as they join the stars into their initials: a different small, specific thing the sender misses about THEM or about being together (a habit, a sound, a ritual, a place, a silly thing they do). Use the story's details where it gives them; never invent events. Each under 65 characters." +
        MY_TONE,
      example: "Your head on my shoulder in auto rides.",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide:
        "The question asked on a tin-can phone at dusk: a small, real ask that fits long distance (a video call tonight, chai over video, a visit this weekend), matching 'Who you're missing'. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Video call tonight? 📞",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, joyful, one short sentence with a cute specific (a time, a ritual from the story). Under 75 characters." + VW_TONE,
      example: "Calling you at 10. Wear the hoodie I left 🥹",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
