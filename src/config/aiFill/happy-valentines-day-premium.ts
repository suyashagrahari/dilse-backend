import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-valentines-day-premium — "Be My Valentine Carnival", the flagship premium page: a bright pastel funfair the
 * sender builds for the recipient, one cute game per stall, ending on "Will you be my Valentine?".
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ./../premiumDays/happy-valentines-day-premium.ts. Not declared: togetherSince (a date the sender picks),
 * datePlan (logistics), every media/music/drop/unlock field, and the photo notes (this page shows captions only).
 * Photo 1 is on her ticket stub, photos 2–5 sit in the four gacha capsules, so five captions are declared.
 */

const CARNIVAL_FORBIDDEN = [["soul", "mate"].join(""), ["soul", "mates"].join("")];

const common = valentineCommon({
  dayName: "Valentine's Day",
  letterWhere:
    "She opens it from a heart-shaped mailbox at the kissing booth near the end of the fair, and it types itself out line by line, right before his voice note and the big question, so it is the quiet, honest stop between the games.",
  letterMax: 3000,
  endLineWhere: "printed on her keepsake ticket stub, the last thing on the page.",
  photosWhere:
    "photo 1 is printed on her ticket stub and lights up the moment she says yes; photos 2, 3, 4 and 5 each pop out of a gacha capsule she wins, so the caption names that memory like a little prize label.",
  photoCount: 5,
  notes: false,
  signaturePrinted: "The page signs the letter itself with the sender's name.",
});

/** The long, intimate fields drifted into Hinglish on English stories full of Indian places: pin the choice. */
const SAME_LANGUAGE =
  " Same language as every other field on this page: when the sender's own sentences are English, this is English too, however many Indian names, places, foods and songs the story mentions.";

const extras: AiFillField[] = [
  {
    path: "extras.question",
    label: "The big question",
    kind: "text",
    max: 60,
    required: true,
    guide: "The question at the last stall of the fair, with a big Yes and a shy No under it: asking them to be the sender's Valentine (for this year, or every year), fitting the relationship in the story. Do not start with their name. Under 50 characters, ends with a question mark.",
    example: "Will you be my Valentine?",
  },
  {
    path: "extras.balloonLine",
    label: "The balloon line",
    kind: "text",
    max: 48,
    required: true,
    guide: "One short sentence split across heart balloons, one word per balloon, that she pops one by one until the whole line is revealed: something warm the sender feels about them every day, built from the story. Four to eight words, no word longer than 12 letters, no emoji, no full stop at the end.",
    example: "You make every day feel like Valentine's",
  },
  {
    path: "extras.ticketLine",
    label: "Her ticket's fine print",
    kind: "text",
    max: 50,
    required: true,
    guide: "The fine print on her ADMIT ONE carnival ticket, written like real ticket small print in three short parts separated by ' · ', the last one promising forever or always, with one detail from the story where it fits (their city, their thing). Under 46 characters.",
    example: "Admit one · all the rides · forever",
  },
  {
    path: "extras.meterLine",
    label: "What the broken love meter says",
    kind: "text",
    max: 36,
    required: true,
    guide: "The joke on the screen of a carnival love-tester machine after her thumb pushes it past 999% and it breaks with sparks, in the machine's own voice: a short system message, a warning label or the machine giving up, about how much love there is between these two (a detail from the story makes it land: their thing, their city, their habit). Under 30 characters.",
  },
  {
    path: "extras.weekLines",
    label: "One line per day of the week",
    kind: "list",
    max: 7,
    itemMax: 70,
    required: true,
    guide: "Exactly 7 lines, in this order, one per can she knocks over at the prize stall: 1 a rose, 2 asking them out or proposing (told as something the sender would do again, not asked now), 3 something sweet to eat, 4 a teddy or something soft to keep close, 5 a promise, 6 a hug, 7 a kiss (family-safe). Each line is about that day's object AND about them; at least four of the seven carry a concrete detail from the story (a place, a food, a habit, a joke, a song), the rest a specific feeling rather than a generic wish. All seven are statements, none ends with a question mark. Do not write the day's name in the line. Each under 65 characters." + VW_TONE,
    example: "The rose was just an excuse to see you smile.",
  },
  {
    path: "extras.noLines",
    label: "What “No” says as it hides",
    kind: "list",
    max: 4,
    itemMax: 40,
    required: true,
    guide: "Exactly 4 short lines that appear one by one each time they try to tap No, while the No button hides behind a sticker and shrinks, the joke always on the button or the sender and never on them: 1 a gentle double-check, 2 the sender pretending to be heartbroken, 3 a sweet bribe taken from the story (their food, their place, their habit), 4 the button giving up and announcing that it is a Yes now. Each under 34 characters. These are always written, however short the story.",
    example: "Are you sure? 🥺",
  },
  // ── Premium-only text leaves (the `premium` sub-document) ───────────────
  {
    path: "premium.voiceCaption",
    label: "Your note (caption for your voice note)",
    kind: "text",
    max: 90,
    guide: "One line in the sender's voice (always written, however short the story) shown on a carnival radio with their voice note, or, when there is none, on its own as a message from them: first person, to them, one small detail or inside joke from the story, a little self-mocking. Under 85 characters, no hashtags." + SAME_LANGUAGE,
    example: "I practised this eleven times. You still make me forget my lines.",
  },
  {
    path: "extras.songNote",
    label: "A line about your song",
    kind: "text",
    max: 60,
    guide: "One short line shown on the carnival radio under the couple's song: when it became theirs or what it is tied to, taken from the story (a drive, a call, a wedding, a night). When the story names no moment for a song, write about when the sender thinks of them instead (still my favourite, because of you). Under 55 characters, sentence case, ends with a full stop.",
    example: "On repeat since the drive back from Goa.",
  },
  {
    path: "premium.psLetter",
    label: "The sealed P.S.",
    kind: "longtext",
    max: 600,
    guide: "A sealed P.S. they open from the keepsake at the very end of the fair. Its first line is the condition on its own line, starting 'Open only if' and specific to these two; then a blank line; then two to four short sentences to them in first person, quieter and more intimate than the letter, built on one specific detail from the story the letter did not use; when the story has no detail left, write about this exact moment instead (them reading this, the sender waiting for their answer), never an event the story does not mention. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE + SAME_LANGUAGE,
    example: "Open only if you can't sleep tonight.\n\nI still have the bill from that first chai. You paid, and I've been trying to pay you back ever since.",
  },
];

export const valentinesDayPremium: AiFillTemplateSchema = {
  slug: "happy-valentines-day-premium",
  audience: "partner",
  premise:
    "A bright, cute Valentine's Day page made by the sender for the recipient, built like a pastel funfair just for them: they tear their ADMIT ONE ticket, pop heart balloons that spell a line, break a love-tester machine, win gacha capsules with their photos, ride a Ferris wheel of memories, knock over seven cans for the seven days of Valentine's week, open a letter at the kissing booth, hear a voice note on a carnival radio, and answer 'Will you be my Valentine?' as the chorus of their song lands with heart fireworks. Short, playful, specific and warm, never cheesy or formal." +
    VW_LANGUAGE +
    " Indian place names, foods, trains and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  // Always-written fields first, the photo captions (which may stay empty) last.
  fields: [
    ...common.filter((f) => !f.path.startsWith("photos[")).map((f) => (f.path === "letter" ? { ...f, guide: f.guide + SAME_LANGUAGE } : f)),
    ...extras,
    ...common.filter((f) => f.path.startsWith("photos[")),
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ...CARNIVAL_FORBIDDEN],
};
