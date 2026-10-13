import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * miss-you — "I Miss You", an evergreen long-distance page on the Valentine's
 * engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * Written to what long-distance couples say lands: the small, specific things
 * they miss (not generic "I miss your smile"), a reunion to look forward to,
 * reassurance instead of guilt ("you're always on my mind", never "you don't
 * call enough"), and open-when letters for the real moments (can't sleep, a bad
 * day, missing me). The demo seeds 6 jar notes and 4 envelopes, so those
 * indices always exist.
 *
 * Not declared: palette (a visual choice), distanceKm (worked out from the two
 * cities on the page) and answerMode / noTries (the sender's own decision).
 */
const MY_TONE = " Warm, cute and reassuring: longing without guilt-tripping, never 'you never call', never sad-for-effect." + VW_TONE;

export const missYou: AiFillTemplateSchema = {
  slug: "miss-you",
  audience: "partner",
  premise:
    "An interactive 'I miss you' page for someone far away. The recipient's phone 'rings' with a call from the sender and they slide to answer; a map draws a dotted route between the sender's city and theirs and counts the kilometres, then they fold the map to 0 km; a live countdown runs to the day they meet; they pull glowing notes out of a jar of little things the sender misses about them; flip through photos; open 'open when…' envelopes; unfold a paper plane into the sender's letter; hold a button to send a hug across the map; and answer a question like 'Video call tonight?' while the No button runs away. It ends on a 'See you soon' boarding pass. Usually for a girlfriend, boyfriend or spouse in a long-distance relationship, sometimes a crush or a best friend — follow the story." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "miss-you",
      letterWhere:
        "It is the sender's letter, read after the open-when envelopes and before the hug. Say what the distance feels like in the story's own terms (only places, events and habits the story states), the specific things the sender misses, what they love about them, and something to look forward to when they meet again. Longing, never guilt; hopeful at the end.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their 'See you soon' boarding pass, the keepsake at the very end.",
      photosWhere: "the photos are a strip of polaroids they swipe through under 'Our little moments'.",
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
      label: "When they pick up the call",
      kind: "text",
      max: 60,
      guide: "The first thing the sender 'says' when the recipient answers the love call: short, casual, first person, saying they miss them. Under 50 characters, at most one emoji.",
      example: "Hi. Nothing. Just missed your voice 🥺",
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
      path: "extras.missThings",
      label: "Things I miss about you",
      kind: "list",
      max: 6,
      itemMax: 70,
      guide:
        "Exactly 6 short lines, one per glowing note in the jar, each a different small, specific thing the sender misses about THEM or about being together (a habit, a sound, a ritual, a place, a silly thing they do). Use the story's details where it gives them; never invent events. Each under 65 characters." +
        MY_TONE,
      example: "Your sleepy voice on our late-night calls.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.openWhen[${i}].when`,
        label: `Envelope ${i + 1} — open when…`,
        kind: "text" as const,
        max: 40,
        guide: `What completes 'Open when…' on envelope ${i + 1}: a real moment the recipient might face apart (you miss me, you can't sleep, you've had a bad day, you need a laugh, the night before we meet), each envelope different, lowercase, with one emoji. Under 36 characters.`,
        example: "you can't sleep 🌙",
      },
      {
        path: `extras.openWhen[${i}].note`,
        label: `Envelope ${i + 1} — the note`,
        kind: "longtext" as const,
        max: 160,
        guide: `The short note inside envelope ${i + 1}, written for exactly that moment: first person, comforting or playful as the moment needs, using the story's details where it gives them. Under 150 characters.` + MY_TONE,
        example: "Look at the moon. I'm under the same one. Breathe slow, and dream of our next date.",
      },
    ]),
    {
      path: "extras.hugLine",
      label: "With the hug",
      kind: "text",
      max: 80,
      guide: "What appears when the hug they send across the map arrives: first person, warm, one short sentence promising the real hug soon. Under 75 characters." + VW_TONE,
      example: "Hug delivered. Keep it till I give you the real one 🤗",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button runs away: a small, real ask that fits long distance (a video call tonight, waiting for the sender, a visit this weekend), matching 'Who you're missing'. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
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
