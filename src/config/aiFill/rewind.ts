// ─── Rewind — AI form-fill schema ────────────────────────────────────────────
//
// Paths address `RewindData`
// (client/app/(templates)/rewind/components/types.ts:42), held in
// `useRewindEditor`'s `mf` slot.
//
// THE NUMBERS ARE DERIVED, NOT TYPED. The contract is explicit: every
// time-shaped figure on screen — days, hours, winters, Diwalis, the percentage
// of the year — comes out of `deriveStats()` from `startDate` alone. There is no
// `daysTogether` field and none may be invented. What the sender writes is the
// ranked list, the joke stats, the song line and the closing line.
//
// NOT DECLARED: `senderPhotoUrl`, `recipientPhotoUrl`, `photos[]`, `audioUrl`
// (all media), `stats[].key` (generated on save), and `answers` — the six-option
// quiz that computes the archetype. The quiz is tappable multiple choice with a
// deterministic fallback for skipped questions, so it costs the sender seconds;
// the joke stats are blank pages and are where the help is actually worth
// spending the field budget.

import type { AiFillTemplateSchema } from "./types";

/** The joke stats share one shape and one comic contract. */
const JOKE =
  "The three parts are one joke in three beats and must be written together: LABEL sets up a " +
  "countable thing, VALUE is the absurd figure, SUB is the punchline that undercuts it. Write the " +
  "figure as a plain short string — a number, a time like '11:42', a count. The humour must be " +
  "affectionate teasing about a shared habit, never a real complaint and never anything that would " +
  "sting if a third person read it over their shoulder.";

export const rewind: AiFillTemplateSchema = {
  slug: "rewind",
  premise:
    "This is a year-in-review for a relationship, played as full-screen story slides you tap through: hard cuts between saturated flat colours, one huge statistic per slide, kinetic type, a ranked countdown, and a final personality verdict about the two of them. Every number about time is computed automatically from one start date, so what you write is the sender's own material — the ranked reasons, the invented statistics, and the last line.",
  audience: "partner",
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 40,
      guide:
        "The name of the person this is for. It opens the deck and closes it, set in the biggest type in the whole story, so short beats formal — the name the sender actually says, not a full name.",
      example: "Aditi",
      required: true,
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 40,
      guide:
        "The sender's first name, signed on the final slide. Leave it empty if the story suggests they'd rather stay unsigned.",
      example: "Rohan",
    },
    {
      path: "startDate",
      label: "The date it started",
      kind: "date",
      max: 10,
      guide:
        "YYYY-MM-DD — the single field the entire deck hangs off. Days, hours, winters, monsoons, Diwalis and Holis are all counted from it, and the slide that names the weekday ('a Tuesday') is one of the best in the deck. Fill it only if the sender's story states the date; do not approximate one from 'about two years ago', because every number on screen would then be wrong. It must not be in the future.",
      required: true,
    },
    {
      path: "topReasons",
      label: "Top 5 reasons",
      kind: "list",
      max: 5,
      itemMax: 120,
      guide:
        "A ranked countdown of reasons the sender loves this person, revealed one row at a time and held on screen longer than any other slide because it is the one people screenshot. Write them as small, specific, observed behaviours — a gesture, a habit, something they do without noticing — never abstract virtues like 'you're kind'. Each is one sentence in the second person, under about 90 characters so it fits at large type. Order them so the most quietly devastating one is LAST, since the list counts down to it.",
      example: "You hand me the left earbud without looking.",
      required: true,
    },
    {
      path: "stats[0].label",
      label: "Joke 1 — label",
      kind: "text",
      max: 40,
      guide:
        "The setup line above the big number on the first joke slide, phrased as the start of a countable sentence — 'times you said', 'cups of chai abandoned', 'minutes spent choosing'. Lowercase, under about six words. " +
        JOKE,
      example: "times you said",
    },
    {
      path: "stats[0].value",
      label: "Joke 1 — the number",
      kind: "text",
      max: 12,
      guide:
        "The figure itself, set enormous and counted up on screen. Short — a number, or a duration like '11:42'. Oddly specific is funnier than round: 47 beats 50. " +
        JOKE,
      example: "47",
    },
    {
      path: "stats[0].sub",
      label: "Joke 1 — punchline",
      kind: "text",
      max: 90,
      guide:
        "The line under the number that turns the statistic into a joke by contradicting it or deadpanning it. One short sentence. " +
        JOKE,
      example: '"I\'m fine." You were fine twice.',
    },
    {
      path: "stats[1].label",
      label: "Joke 2 — label",
      kind: "text",
      max: 40,
      guide:
        "Setup for the second joke slide. It must count something completely different from the first — if joke one was about talking, this one is about food, sleep, objects, travel or time. " +
        JOKE,
    },
    {
      path: "stats[1].value",
      label: "Joke 2 — the number",
      kind: "text",
      max: 12,
      guide: "The second big figure. Short, specific, and a different order of magnitude from the first. " + JOKE,
    },
    {
      path: "stats[1].sub",
      label: "Joke 2 — punchline",
      kind: "text",
      max: 90,
      guide: "The second punchline. One sentence, and not the same joke construction as the first one. " + JOKE,
    },
    {
      path: "stats[2].label",
      label: "Joke 3 — label",
      kind: "text",
      max: 40,
      guide: "Setup for the third joke slide, on a third distinct subject. " + JOKE,
    },
    {
      path: "stats[2].value",
      label: "Joke 3 — the number",
      kind: "text",
      max: 12,
      guide: "The third big figure. " + JOKE,
    },
    {
      path: "stats[2].sub",
      label: "Joke 3 — punchline",
      kind: "text",
      max: 90,
      guide: "The third punchline. One sentence. " + JOKE,
    },
    {
      path: "stats[3].label",
      label: "Joke 4 — label",
      kind: "text",
      max: 40,
      guide:
        "Setup for the fourth and last joke slide. Only write this one if the sender's story genuinely supports a fourth distinct running joke — three good ones beat four where the last is filler, and an empty slot is a normal outcome here. " +
        JOKE,
    },
    {
      path: "stats[3].value",
      label: "Joke 4 — the number",
      kind: "text",
      max: 12,
      guide: "The fourth big figure. Leave empty unless the story supports a fourth joke. " + JOKE,
    },
    {
      path: "stats[3].sub",
      label: "Joke 4 — punchline",
      kind: "text",
      max: 90,
      guide: "The fourth punchline. Leave empty unless the story supports a fourth joke. " + JOKE,
    },
    {
      path: "songTitle",
      label: "Song title",
      kind: "text",
      max: 60,
      guide:
        "The title on the song slide. Fill it only if the sender's story names a track that means something to the two of them. If nothing is named, leave it empty rather than inventing one — an invented title next to whatever audio the sender attaches reads as a mistake. It is also perfectly good to write the song not by its name but by what it is to them ('the one you played twice').",
    },
    {
      path: "songArtist",
      label: "Artist, or where",
      kind: "text",
      max: 60,
      guide:
        "The line under the song title. Either the artist, or — usually better — WHERE the song happened: 'in the auto, both times', 'that kitchen, every Sunday'. Only from something the story actually contains.",
      example: "in the auto, both times",
    },
    {
      path: "closingLine",
      label: "The last line",
      kind: "text",
      max: 80,
      guide:
        "The final slide: this line alone, on a flat colour, in big type. Short lands hardest — aim under eight words, and never more than one sentence. It should feel like the sender putting the phone down, not like a summary of everything above. Understated beats grand.",
      example: "Same time next year.",
    },
  ],
};
