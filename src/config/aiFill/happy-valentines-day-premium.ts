import type { AiFillField, AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-valentines-day-premium — "Us, Wrapped", the flagship premium page: the couple's year in love told like a
 * music app's year-end "Wrapped" story, made by the sender for the recipient.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ./../premiumDays/happy-valentines-day-premium.ts. Not declared: togetherSince (a date the sender picks),
 * datePlan (logistics), every media/music/drop/unlock field, and the photo notes (this page shows captions only).
 * Photo 1 is the big reveal, photos 2–4 are "top 3 memories", so four captions are declared.
 */

// Brand names the page must not print (the format is generic "Wrapped"; no app is named on the page).
const WRAPPED_FORBIDDEN = [
  ["Spot", "ify"].join(""),
  ["soul", "mate"].join(""),
  ["soul", "mates"].join(""),
];

const common = valentineCommon({
  dayName: "Valentine's Day",
  letterWhere:
    "It unfolds near the end of their year-in-love story, after the stats and reasons and right before the number of days they have been together slams onto the screen, so it reads as the quiet, honest part of the year.",
  letterMax: 3000,
  endLineWhere: "printed under their shareable year-in-love summary card, the last thing on the page.",
  photosWhere: "photo 1 is the big reveal and the cover of their summary card; photos 2, 3 and 4 are ranked as their top three memories of the year (#1, #2, #3), so the caption names that memory.",
  photoCount: 4,
  notes: false,
  signaturePrinted: "The page signs the letter itself with the sender's name.",
});

/** The long, intimate fields drifted into Hinglish on English stories full of Indian places: pin the choice. */
const SAME_LANGUAGE =
  " Same language as every other field on this page: when the sender's own sentences are English, this is English too, however many Indian names, places, foods and songs the story mentions.";

const extras: AiFillField[] = [
  {
    path: "extras.songNote",
    label: "A line about your song",
    kind: "text",
    max: 60,
    guide: "One short line shown under the couple's song after the recipient taps a heart on it: when it became theirs or what it is tied to, taken from the story (a drive, a call, a wedding, a night). When the story names no moment for a song, write about when the sender thinks of them instead (still my favourite, because of you). Under 55 characters, sentence case, ends with a full stop.",
    example: "On repeat since the drive back from Goa.",
  },
  {
    path: "extras.topPhrase",
    label: "Most-said phrase",
    kind: "text",
    max: 40,
    guide: "The phrase one of them says all the time, as a quote in curly quotation marks, shown huge on a flip tile labelled as the most-said phrase. Take it from the story (a question they always ask, a catchphrase, a pet line). Only a phrase the story quotes or clearly describes; when it gives none, return null (the page hides the tile). Under 30 characters.",
    example: "“Did you eat?”",
  },
  {
    path: "extras.topPlace",
    label: "Your top place",
    kind: "text",
    max: 40,
    guide: "Their place: the spot from the story they go back to most (a café, a stall, a park, a sea face, a station), with the area or city when the story gives one, on a flip tile labelled as their top place. Only a place the story itself names; with no named place, return null (a made-up café is worse than an empty tile). Most short stories name no place, so null is the usual answer here. Under 36 characters.",
    example: "The chai stall, Bandra",
  },
  ...[0, 1].flatMap((i): AiFillField[] => [
    {
      path: `extras.stats[${i}].label`,
      label: `Stat ${i + 1}: what it counts`,
      kind: "text",
      max: 30,
      guide: `The label of flip tile ${i + 1} among the stats only the sender kept, next to the most-said phrase and the top place: a small habit, joke or ritual from the story worded like a stat category (things stolen, late-night calls, fights over the last samosa). Each tile a different habit, and a different one from the phrase and the place. Count only a habit the story itself describes; when it describes none left for this tile, return null for both its label and value (most short stories leave both tiles empty, and the page simply hides them). Under 26 characters.`,
    },
    {
      path: `extras.stats[${i}].value`,
      label: `Stat ${i + 1}: the number`,
      kind: "text",
      max: 24,
      guide: `The big value on flip tile ${i + 1}: digits only when the story itself states a number above one; for something that happened once write 'once' or 'the first one', otherwise a short phrase that plays as a count (too many, every single time, all of them). Under 18 characters.`,
    },
  ]),
  {
    path: "extras.topTrait",
    label: "Their top trait, according to you",
    kind: "text",
    max: 28,
    required: true,
    guide: "Two or three words the recipient scratches off a foil card: their top personality trait this year according to the sender, affectionate with a little tease, drawn from how the story describes them (stubborn, the planner, steals blankets); when the story describes them only through the sender's love, pick a warm trait that love implies (impossible to forget, the calm one). Title-free, no full stop, no names. Under 24 characters.",
    example: "Annoyingly kind",
  },
  {
    path: "extras.reasons",
    label: "Reasons I love you (fast cuts)",
    kind: "list",
    max: 5,
    itemMax: 70,
    required: true,
    guide: "Exactly 5 reasons the sender loves them, each flashed in big type over one of their photos, one per tap. Each is one short sentence addressed to them ('You…'), concrete and specific to the story (a habit, a kindness, a joke, how they show up), never a generic compliment, and no two about the same thing. When the story is short, build them from what it does say (how long they have been together, how the sender feels around them, what they look forward to) so there are still five. Mix one or two playful ones with sincere ones and end on the warmest. Each under 60 characters, ending with a full stop." + VW_TONE,
    example: "You remember exactly how I take my chai.",
  },
  {
    path: "extras.question",
    label: "The big question",
    kind: "text",
    max: 60,
    required: true,
    guide: "The question asked over their best photo right after the number of days they have been together lands: asking them to be the sender's Valentine for another year (or forever), fitting the relationship in the story, with the right gender for the recipient. Do not start with their name. Under 50 characters, ends with a question mark.",
    example: "Another year of us. Be my Valentine?",
  },
  {
    path: "extras.noLines",
    label: "What “No” says as it runs",
    kind: "list",
    max: 4,
    itemMax: 40,
    guide: "Exactly 4 short lines that appear one by one each time they try to tap No and it slides away, escalating playfully, the joke always on the button or the sender and never on them; the fourth line gives up and announces that No is a Yes now. Each under 34 characters. These are always written, however short the story.",
    example: "Wrong button, clearly.",
  },
  // ── Premium-only text leaves (the `premium` sub-document) ───────────────
  {
    path: "premium.voiceCaption",
    label: "Your note (caption for your voice note)",
    kind: "text",
    max: 90,
    guide: "One line in the sender's voice (always written, however short the story) shown with their voice note, or, when there is none, on its own as a quote from them: first person, to them, one small detail or inside joke from the story, a little self-mocking. Under 85 characters, no hashtags." + SAME_LANGUAGE,
    example: "I practised this eleven times. You still make me forget my lines.",
  },
  {
    path: "premium.psLetter",
    label: "The sealed P.S.",
    kind: "longtext",
    max: 600,
    guide: "A sealed P.S. they open from the summary card at the very end. Its first line is the condition on its own line, starting 'Open only if' and specific to these two; then a blank line; then two to four short sentences to them in first person, quieter and more intimate than the letter, built on one specific detail from the story the letter did not use, or, when the story is short, on the plain fact of how they feel. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE + SAME_LANGUAGE,
    example: "Open only if you can't sleep tonight.\n\nI still have the bill from that first chai. You paid, and I've been trying to pay you back ever since.",
  },
];

const ALWAYS = new Set(["extras.question", "extras.reasons", "extras.topTrait", "extras.noLines", "premium.voiceCaption", "premium.psLetter", "extras.songNote"]);
const pickExtras = (paths: string[]) => paths.map((p) => extras.find((f) => f.path === p)!).filter(Boolean);

export const valentinesDayPremium: AiFillTemplateSchema = {
  slug: "happy-valentines-day-premium",
  audience: "partner",
  premise:
    "A cinematic Valentine's Day page that tells the couple's year in love like a music app's year-end 'Wrapped' story, made by the sender for the recipient: bold colour slides with huge type that they tap through. Their song, their top three memories as photos, stats only the sender kept (a most-said phrase, their place, small habits counted), the recipient's top personality trait according to the sender, five fast-cut reasons, a voice note, a letter, then the number of days they have been together slamming onto the screen on the song's chorus and cutting to their best photo, where the big question waits; it ends on a shareable summary card. Playful, specific and warm, never cheesy." +
    VW_LANGUAGE +
    " Indian place names, foods, trains and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  // Order matters on thin stories: the always-written fields come before the "leave it empty when the story has
  // none" ones (place, phrase, stats, captions), or the model carries the empties on into the question and reasons.
  fields: [
    ...common.filter((f) => !f.path.startsWith("photos[")).map((f) => (f.path === "letter" ? { ...f, guide: f.guide + SAME_LANGUAGE } : f)),
    ...pickExtras(["extras.question", "extras.reasons", "extras.topTrait", "extras.noLines", "premium.voiceCaption", "premium.psLetter", "extras.songNote"]),
    ...extras.filter((f) => !ALWAYS.has(f.path)),
    ...common.filter((f) => f.path.startsWith("photos[")),
  ],
  forbiddenOutput: [...VW_FORBIDDEN, ...WRAPPED_FORBIDDEN],
};
