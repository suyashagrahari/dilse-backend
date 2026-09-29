// ─── AI fill — catch ─────────────────────────────────────────────────────────
//
// Paths address `mf: CatchData` in
// client/app/(templates)/catch/hooks/useCatchEditor.ts, declared in
// client/app/(templates)/catch/components/types.ts.
//
//   goodItems: GoodItem[]  — objects; each slot addressed flatly
//                            (`goodItems[0].label`, `goodItems[0].line`).
//   badItems:  BadItem[]   — only the label text; emoji are picked in the editor.
//   photos:    LovePhoto[] — only caption + note. The demo seeds six photos, so
//                            photos[0..5] always exist while the sender builds;
//                            a caption landing on a slot with no picture is
//                            dropped client-side (tidyCatchData).
//   faceUrl, photos[].url  — media. Never declared. (Rule 1.)
//
// Every text leaf of the template is here: names, the title-screen ribbon, the
// eight letter pieces, six memory captions + notes, four petty dodges, the last
// line, the main letter and its question gate. 39 fields (limit 40).

import type { AiFillField, AiFillTemplateSchema } from "./types";

const LINE = 140;
const LABEL = 28;

/** Each of the eight letter pieces gets a different job so they don't repeat. */
const PIECES: { job: string; labelGuide: string; lineGuide: string; label: string; line: string }[] = [
  {
    job: "the borrowed thing",
    labelGuide: "an object that quietly moved from the sender's life into theirs and never came back (a hoodie, a charger, a book)",
    lineGuide: "One or two sentences, amused and fond, about how that object is now theirs.",
    label: "the grey hoodie",
    line: "I've stopped asking for the hoodie back. Consider it a transfer of ownership.",
  },
  {
    job: "the daily habit",
    labelGuide: "a small everyday habit of theirs the sender has memorised (the chai they never finish, the song they hum)",
    lineGuide: "One or two sentences noticing that habit tenderly and specifically.",
    label: "the chai you never finish",
    line: "You abandon chai half-drunk on every surface. I drink the rest. That's love.",
  },
  {
    job: "the first time",
    labelGuide: "the object or place from how they met or their first date, taken from the story",
    lineGuide: "One or two sentences about that first moment, told plainly and a little understated.",
    label: "that first coffee",
    line: "You were twenty minutes late and I'd already decided I didn't mind.",
  },
  {
    job: "the late-night thing",
    labelGuide: "the food or object from a late night together (2 AM maggi, a rooftop, a long drive)",
    lineGuide: "One or two sentences about that night — the small, unglamorous version, not the cinematic one.",
    label: "2 AM maggi",
    line: "Half-cooked, on the kitchen floor, during a power cut. Best meal of my life.",
  },
  {
    job: "the running joke",
    labelGuide: "the object at the centre of a joke they keep repeating (a song, a film, a mispronounced word)",
    lineGuide: "One or two sentences landing the joke, teasing the SENDER or the shared habit — never the recipient's looks, family or work.",
    label: "the song you ruined",
    line: "I can't hear that song anymore without your terrible harmony over it.",
  },
  {
    job: "the thing they care for",
    labelGuide: "something or someone they looked after and now can't stop caring about (a street dog, a plant, a friend)",
    lineGuide: "One or two sentences about how that small act of care quietly became permanent.",
    label: "the dog you fed once",
    line: "One biscuit and now that street dog is technically our responsibility.",
  },
  {
    job: "the keepsake",
    labelGuide: "an object from the story that holds a memory — something kept, saved, framed or worn",
    lineGuide: "One or two sentences about why that keepsake matters, quiet not sentimental.",
    label: "that bus ticket",
    line: "I still have the bus ticket from the day we missed our stop. Don't tell anyone.",
  },
  {
    job: "the one that isn't a joke",
    labelGuide: "the object or moment from a hard week they got through together, or when it became serious",
    lineGuide: "The one line with no joke in it: when the sender knew. Say it straight, no metaphor.",
    label: "the power cut",
    line: "Four hours, no phones, and you told me about your dad. That's when I knew.",
  },
];

const pieceFields: AiFillField[] = PIECES.flatMap((p, i) => [
  {
    path: `goodItems[${i}].label`,
    label: `Letter piece ${i + 1} — ${p.job}`,
    kind: "text" as const,
    max: LABEL,
    required: true,
    guide: `Name ${p.labelGuide}. Written like a luggage tag: lowercase, 2 to 5 words, no full stop, under 28 characters. Specific to THIS couple's story, never generic. It must match the object the line for piece ${i + 1} is about; if the story has nothing for this job, name whichever unused detail that line ends up using.`,
    example: p.label,
  },
  {
    path: `goodItems[${i}].line`,
    label: `Letter piece ${i + 1} — the line`,
    kind: "text" as const,
    max: LINE,
    required: true,
    guide: `${p.lineGuide} Addressed to them as "you", under 130 characters, readable on its own because pieces are caught out of context. Use a concrete detail from the story. If the story has nothing for this exact job, use any other true detail from it that no other piece has used yet, or come back to a detail from a new angle — the letter needs all eight pieces, so do not leave this empty.`,
    example: p.line,
  },
]);

const PHOTO_JOBS = [
  "the earliest memory in the story",
  "a date or an outing",
  "a trip, a place or a season",
  "a quiet, ordinary day together",
  "a funny or chaotic moment",
  "the most recent memory, or 'us, now'",
];

const photoFields: AiFillField[] = PHOTO_JOBS.flatMap((job, i) => [
  {
    path: `photos[${i}].caption`,
    label: `Memory ${i + 1} — caption`,
    kind: "text" as const,
    max: 40,
    guide: `Caption for memory polaroid ${i + 1} (${job}). Handwritten-style, lowercase, 2 to 5 words, under 32 characters, no full stop — like writing on the white strip of a polaroid. Different from every other caption.`,
    example: i === 0 ? "the first sunset" : "date night, round 1",
  },
  {
    path: `photos[${i}].note`,
    label: `Memory ${i + 1} — little note`,
    kind: "text" as const,
    max: 180,
    guide: `The little note that pops open when they catch memory ${i + 1} (${job}). One or two warm sentences to "you", under 150 characters, with one concrete detail from the story. Does not repeat any letter-piece line.`,
    example: "You said the sky looked like mango lassi. I have not stopped thinking about it.",
  },
]);

const badFields: AiFillField[] = [0, 1, 2, 3].map((i) => ({
  path: `badItems[${i}].label`,
  label: `Thing to dodge ${i + 1}`,
  kind: "text" as const,
  max: 16,
  guide: `A petty, universally relatable texting 'ick' that falls as a grey chat bubble for them to dodge. Slot ${i + 1} is ${["a painfully dry one-word reply", "a read receipt or 'typing…' that went nowhere", "a vague non-plan or dreaded phrase", "an annoying notification or low-effort question"][i]}. Invent a fresh one in texting style: 1 to 3 words, under 16 characters, lowercase. NEVER about the recipient, their body, family or anything real from the story. All four different.`,
}));

export const catchSchema: AiFillTemplateSchema = {
  slug: "catch",
  premise:
    "This page is a cute, Gen-Z mobile arcade game made as a love letter. The recipient's own face is the player; things fall from a pastel sky and they drag left and right to catch them. Letter pieces (little objects from the couple's life, each carrying one line of the letter) arrive in order and stack up into the letter at the end; memory polaroids pop open with a caption and a note; petty chat-bubble 'icks' must be dodged. A main letter waits in the corner and opens with a LEVEL COMPLETE screen. You write every word: names, the title-screen ribbon, the pieces, the memories, the dodges and the letter — playful on the surface, sincere underneath.",
  audience: "partner",
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 32,
      required: true,
      guide: "The name of the person playing, exactly as the sender says it — a pet name if they use one. One or two words. Printed under their face in the game.",
      example: "Ananya",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 32,
      required: true,
      guide: "The sender's name — the one who made the game. One or two words, how they sign off in real life.",
      example: "Rohan",
    },
    {
      path: "tagline",
      label: "Title-screen ribbon",
      kind: "text",
      max: 44,
      required: true,
      guide: "The ribbon under the big CATCH! logo, like a special-edition label on a game box: lowercase, 3 to 6 words, one emoji at the end, under 36 characters. Build it from the recipient's name, their nickname or a detail from the story (a food, a habit, an inside joke) so it could only belong to them.",
    },
    ...pieceFields,
    ...photoFields,
    ...badFields,
    {
      path: "closingLine",
      label: "The last line of the assembled letter",
      kind: "text",
      max: 200,
      required: true,
      guide: "Printed under the stacked letter pieces whatever their score. One or two sentences to 'you', under 180 characters, in your own fresh words, quietly saying the pieces they missed were always theirs anyway — ideally with one small detail from the story in it.",
      example: "(register only) Missed a few? Doesn't matter — every piece of this was headed your way since the day with the umbrella.",
    },
    {
      path: "letter",
      label: "The main letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The private main letter that opens after a LEVEL COMPLETE screen. AT LEAST 700 characters (up to 1100), in 4 or 5 short paragraphs separated by blank lines, written straight to them ('you'). Do NOT open with a salutation or their name on its own line — the page prints 'Dear <name>,' already. One short paragraph may wink at the game (levels, high scores, player 2) in fresh words of your own; the rest is sincere and built from concrete details in the story — places, times, foods, habits, things they said — at least four across the letter. End with a plain, specific promise. Do not sign it.",
      example: "(register only) …the night the lift got stuck and you taught me that card game…\n\n…so here's the promise: …",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter",
      kind: "text",
      max: 120,
      guide: "A playful yes-or-no question they answer before the letter opens (the 'no' button runs away). Arcade-flavoured (levels, player 2, continue, high score) and sweet, under 60 characters, ending with '?', ideally with their name or a detail from the story.",
      example: "(register only) Priya, insert one heart to continue?",
    },
    {
      path: "lockAnswer",
      label: "Yes button",
      kind: "text",
      max: 30,
      guide: "The label on the yes button, answering the question above: 2 to 4 words, lowercase, arcade-flavoured, one emoji.",
      example: "(register only) continue ♥",
    },
  ],
};
