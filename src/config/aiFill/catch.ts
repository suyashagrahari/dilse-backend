// ─── AI fill — catch ─────────────────────────────────────────────────────────
//
// Paths address `mf: CatchData` in
// client/app/(templates)/catch/hooks/useCatchEditor.ts (`useState<CatchData>`),
// declared in client/app/(templates)/catch/components/types.ts:43.
//
//   goodItems: GoodItem[]  — array of OBJECTS (types.ts:49), so each slot is
//                            addressed flatly: `goodItems[0].label`,
//                            `goodItems[0].line`. It is NOT a string[] and must
//                            not be declared as a `list`.
//   badItems:  BadItem[]   — deliberately NOT filled. See the note at the end.
//   faceUrl                — media. Never declared. (Rule 1.)

import type { AiFillTemplateSchema } from "./types";

/** The letter needs 8 written lines before the editor lets the sender save. */
const LINE = 140;
/** `label` is hard-sliced at 34 in the editor and drawn at 10px on a 400px-wide
 *  canvas under the falling emoji. Past ~28 characters it is a grey smear. */
const LABEL = 28;

export const catchSchema: AiFillTemplateSchema = {
  slug: "catch",
  premise:
    "This is a letter that has been broken into pieces and thrown into the sky. Ordinary objects from the couple's own life fall down the screen — a hoodie, a cup of chai, an earbud — and the recipient catches them with their own face; every object caught writes one line onto a sheet of paper above the game, and nothing is ever locked, scored or taken away. You are writing the objects and the lines they carry, so each line has to make sense arriving on its own, out of order, seconds after the last one.",
  audience: "partner",
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The name of the person catching the letter, exactly as the sender says it out loud — the pet name if they use one, never a formal name they would not actually use. One or two words. It is printed under their face on the intro and again on the final card.",
      example: "Ananya",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The name of the person writing the letter — the sender, the one throwing all this into the sky. One or two words, however they sign off in real life.",
      example: "Rohan",
    },

    // ── The eight objects. Each is a tag (what the thing is) and the paper
    //    tied to it (the line that thing carries). Every slot is given a
    //    different job so the eight do not come back as eight versions of the
    //    same sentence.
    {
      path: "goodItems[0].label",
      label: "Object 1 — the borrowed thing",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name one object that has quietly moved from the sender's life into theirs and never come back — a hoodie, a charger, a book, a pen. Write it the way it is written on a luggage tag: lowercase, 2 to 5 words, no full stop. Keep it under 28 characters; it is printed tiny under a falling emoji.",
      example: "the grey hoodie",
    },
    {
      path: "goodItems[0].line",
      label: "Object 1 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences about that borrowed object, written to them, admitting you have given up trying to get it back. Warm, dry, specific. One to two sentences, under 140 characters. It has to land on its own, because it may arrive first or twelfth.",
      example: "I have stopped asking for it back. Consider it a transfer of ownership.",
    },
    {
      path: "goodItems[1].label",
      label: "Object 2 — the daily habit",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name the object at the centre of a small thing they do every single day — the half-finished cup, the one earbud, the alarm they snooze four times. Lowercase, 2 to 5 words, luggage-tag style, under 28 characters.",
      example: "the chai you never finish",
    },
    {
      path: "goodItems[1].line",
      label: "Object 2 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences noticing that daily habit out loud, with affection and zero complaint — the point is that the sender has been watching closely enough to know it. Under 140 characters.",
      example: "You make it and then abandon it half-drunk on every surface in the house.",
    },
    {
      path: "goodItems[2].label",
      label: "Object 3 — a place",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name a place that belongs to the two of them — a terrace, a café table, an airport, a stretch of road. Lowercase, 2 to 5 words, no full stop, under 28 characters.",
      example: "the airport",
    },
    {
      path: "goodItems[2].line",
      label: "Object 3 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences about what happened at that place, told as if they were both there and both remember it. Concrete detail beats adjectives. Under 140 characters.",
      example: "You ran through a crowded terminal. I have never been more embarrassed or more certain.",
    },
    {
      path: "goodItems[3].label",
      label: "Object 4 — a night",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name one late night by its object or its hour — a meal, a power cut, a drive, a phone call. Lowercase, 2 to 5 words, under 28 characters.",
      example: "2 AM maggi",
    },
    {
      path: "goodItems[3].line",
      label: "Object 4 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences about that night, told plainly and slightly understated — the small, unglamorous version, not the cinematic one. Under 140 characters.",
      example: "Half-cooked, on the kitchen floor, during a power cut. Best meal of my life too.",
    },
    {
      path: "goodItems[4].label",
      label: "Object 5 — the running joke",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name the object at the centre of a joke the two of them have been repeating for months — a song, a film they argue about, a mispronounced word. Lowercase, 2 to 5 words, under 28 characters.",
      example: "the song you ruined",
    },
    {
      path: "goodItems[4].line",
      label: "Object 5 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences that land the joke, teasing the SENDER or the shared habit — never the recipient's appearance, family, work or anything they would actually be self-conscious about. Under 140 characters.",
      example: "I cannot hear it any more without hearing your terrible harmony over the top.",
    },
    {
      path: "goodItems[5].label",
      label: "Object 6 — the thing they look after",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name something or someone they adopted, fed, watered or rescued and now cannot stop caring about — a street dog, a plant, a friend, a neighbour. Lowercase, 2 to 5 words, under 28 characters.",
      example: "the dog you fed once",
    },
    {
      path: "goodItems[5].line",
      label: "Object 6 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences about how that small act of care quietly became permanent, told with amused resignation. Under 140 characters.",
      example: "One biscuit in 2023 and now he is technically our responsibility.",
    },
    {
      path: "goodItems[6].label",
      label: "Object 7 — the object with history",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name an object they carry that came from before the sender — a ring, a jacket, a photograph, a bracelet. Lowercase, 2 to 5 words, under 28 characters.",
      example: "your grandmother's ring",
    },
    {
      path: "goodItems[6].line",
      label: "Object 7 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "One or two sentences showing the sender noticed something about that object on day one and never said so until now. Quiet, not sentimental. Under 140 characters.",
      example: "You wear it on the wrong finger so nobody asks. I noticed the first week.",
    },
    {
      path: "goodItems[7].label",
      label: "Object 8 — the one that isn't a joke",
      kind: "text",
      max: LABEL,
      required: true,
      guide:
        "Name the object or moment from the hardest week they got through together — a hospital, a candle, a train home. Lowercase, 2 to 5 words, under 28 characters. Plain, not dramatic.",
      example: "the power cut",
    },
    {
      path: "goodItems[7].line",
      label: "Object 8 — the line it carries",
      kind: "text",
      max: LINE,
      required: true,
      guide:
        "The one line in the letter with no joke in it. One or two sentences about the moment one of them said something true for the first time, or the moment the sender realised this was serious. Say it straight, no metaphor, under 140 characters.",
      example: "Four hours, no phones, and you talked about your father for the first time.",
    },

    {
      path: "closingLine",
      label: "The last line",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "The line that always arrives at the end, whether they caught everything or nothing at all — this is the promise the whole page is built on, so it must not depend on how well they played. One or two sentences, under 200 characters, addressed straight to them, and it should quietly say that the parts they missed were always theirs anyway.",
      example: "That's all of it. Even the parts you didn't catch — they were always going to be yours.",
    },
  ],
};

// Left out on purpose:
//
//   badItems[].label — the petty things they dodge ("k", "seen 9:41 PM"). The
//     editor requires 3 to 6 and the register is knife-edge: one degree too far
//     and it stops being petty and becomes a real complaint about the recipient.
//     That judgement belongs to the sender, who knows what is safe to joke about.
//   goodItems[].emoji — picked from a fixed palette in the editor, and an
//     invented emoji renders as a blank box.
//   durationMs, faceUrl — game tuning and media. Neither is copy.
