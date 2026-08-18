// ─── Streak — AI form-fill schema ────────────────────────────────────────────
//
// Paths address `StreakForm`, the EDITOR's form state
// (client/app/(templates)/streak/components/editorTypes.ts:38), NOT `StreakData`.
// The form holds identity + the sender's letters; the check-in log is written by
// the two of them afterwards and is never authored here.
//
// THE ONE RULE THAT OVERRIDES EVERYTHING ELSE IN THIS FILE: this template is
// opened every single day, potentially for years, and its contract file spends a
// whole section forbidding loss framing — `assertWarmCopy` mechanically rejects
// "don't lose", "you'll break", "hurry", "you missed", countdowns, and anything
// that reads as a debt. Every guide below therefore steers the model away from
// obligation, scorekeeping and disappointment, because these fields are the only
// place sender-authored prose enters the template and they are not audited by
// `assertWarmCopy` at write time.

import type { AiFillTemplateSchema } from "./types";

/** Never guilt, never a countdown, never a score. Repeated into each guide. */
const WARMTH =
  "Never frame this as an obligation, a debt, a test, or something that could be lost or broken. " +
  "No 'don't miss a day', no 'you owe me', no disappointment, no counting who showed up more. " +
  "Warm, unhurried, and it must still read kindly to someone opening it on a day they nearly forgot.";

export const streak: AiFillTemplateSchema = {
  slug: "streak",
  premise:
    "This is a shared daily ritual for two people: each of them opens the same quiet cream-paper page once a day, holds a button, and leaves one word, and a warm light is added to a strand for every day they both showed up. You are writing the setup a sender fills in before handing it over — the two names, the day it starts, and a small set of letters that stay sealed and unlock later, at seven days, at thirty, at a hundred, at a year.",
  audience: "partner",
  fields: [
    {
      path: "nameA",
      label: "Your name",
      kind: "text",
      max: 40,
      guide:
        "The sender's own first name, exactly as they refer to themselves in their story. It sits above the strand of lights, in lowercase-feeling serif, next to their partner's. A first name or a nickname they actually go by — never a full legal name, never a title.",
      example: "Ananya",
      required: true,
    },
    {
      path: "nameB",
      label: "Their name",
      kind: "text",
      max: 40,
      guide:
        "The other person's name, as the sender actually says it out loud — the pet name or short form if that is what the story uses, not the formal name. It is printed beside the sender's name above the lights, so it should look right sitting next to it.",
      example: "Rohan",
      required: true,
    },
    {
      path: "startedOn",
      label: "The first day",
      kind: "date",
      max: 10,
      guide:
        "YYYY-MM-DD. The day this ritual begins counting from. Only fill this if the sender's story states a specific date they want to start from or an anniversary they are anchoring to; if they just say 'today' or say nothing, leave it empty and let the form default stand. It must never be a date in the future.",
    },
    {
      path: "letters[0].letter",
      label: "Letter at thirty days",
      kind: "longtext",
      max: 700,
      guide:
        "A sealed letter written now and opened only once the two of them have completed thirty days together. It arrives as a wax-sealed envelope, so write it as a letter, addressed to the recipient in the second person, in the sender's voice. Thirty days in, the tone is 'this turned out to be nice' — a small, specific observation about what the sender has noticed in the daily words, or about the other person generally. Four to eight sentences. " +
        WARMTH,
      example:
        "A month of one-word mornings. I keep noticing you pick the word you'd have said out loud anyway.",
    },
    {
      path: "letters[1].letter",
      label: "Letter at a hundred",
      kind: "longtext",
      max: 900,
      guide:
        "The sealed letter that opens at a hundred completed days — the biggest moment in the template, and the screen puts a canopy of lights up for it. Warmer and longer than the thirty-day one: something the sender has been meaning to say properly rather than in one word a day. Concrete memories beat adjectives. Six to twelve sentences, second person. " +
        WARMTH,
    },
    {
      path: "letters[2].letter",
      label: "Letter at a year",
      kind: "longtext",
      max: 1200,
      guide:
        "The sealed letter for a full year of days. Written now, read a very long time from now, by two people who will have changed — so write it so it still lands then: fewer promises, more of what is true right now and worth remembering. Second person, unhurried, up to about fifteen sentences. It may be tender and it may be funny, but it must not assume anything about where they will be by then, and it must not read as a bill coming due. " +
        WARMTH,
    },
    {
      path: "microLines[0]",
      label: "Weekly line — week 1",
      kind: "text",
      max: 120,
      guide:
        "One short line from the sender that unlocks after the first seven completed days. It appears alone on cream paper, so it is a whisper, not a paragraph — one sentence, under about twenty words, lowercase-friendly, the sort of thing you'd text without thinking. Week one's is the lightest: pleased, slightly surprised, no ceremony. " +
        WARMTH,
      example: "a week of this and i still check first thing.",
    },
    {
      path: "microLines[1]",
      label: "Weekly line — week 2",
      kind: "text",
      max: 120,
      guide:
        "The line that unlocks after fourteen completed days. Same register as week one — one sentence, spoken not written — but it should not repeat week one's idea. Point at something specific: a word they keep choosing, the time of day they usually turn up, a small habit. " +
        WARMTH,
    },
    {
      path: "microLines[2]",
      label: "Weekly line — week 3",
      kind: "text",
      max: 120,
      guide:
        "The week-three line. By now the ritual is ordinary, and that is the thing worth saying — the pleasure of something small becoming routine. One sentence. Do not escalate the intensity just because the number went up. " +
        WARMTH,
    },
    {
      path: "microLines[3]",
      label: "Weekly line — week 4",
      kind: "text",
      max: 120,
      guide:
        "The week-four line, closing out roughly a month. One sentence, still quiet. A good one gestures forward without asking for anything — an open door, never a commitment being collected on. Leave this empty rather than writing filler; a week with no line shows nothing at all, which the template treats as completely normal. " +
        WARMTH,
    },
  ],
};
