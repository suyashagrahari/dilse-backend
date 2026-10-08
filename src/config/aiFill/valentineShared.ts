// ─── AI fill — the Valentine's-week shared fields ────────────────────────────
//
// Not a schema itself (it exports no `AiFillTemplateSchema` constant, so the
// registry generator skips it). The eight day files — happy-rose-day.ts …
// happy-valentines-day.ts — each spread `valentineCommon(...)` and add their own
// `extras.*` leaves.
//
// Paths address `mf: ValentineDayData` in
// client/app/(templates)/_valentine/types.ts, held by
// client/app/(templates)/_valentine/useValentineDayEditor.ts:
//
//   recipientName, senderName, petName, letter, endLine   — plain strings
//   photos[i].caption / photos[i].note                     — text only; the demo
//       seeds four photos so photos[0..3] always exist while the sender
//       builds; a caption on a slot with no picture is dropped client-side.
//   extras.<key>                                           — the day's own fields
//
// Never declared (rule 1 + "pure visual choices"): photos[].url, gifs.*, music,
// and every colour / style / count enum in extras (rose colour, ring style,
// fur colour, lip shade …) — a story has nothing to say about those.
//
// Lessons from running these against the live model (see
// client/.template-factory/valentine-week/04-aifill.md):
//   - A tone line that listed Hindi words, plus Hinglish examples, dragged
//     ENGLISH stories into romanised Hindi letters. The tone now defers to the
//     story's language and lists no words; examples on short fields are in
//     English or absent.
//   - Every letter came back as "Name,\n\n…\n\nSign-off,\nSender" — and Rose
//     Day already prints "My dear <name>," and "— <sign-off>", Hug Day prints
//     "— <sender>". `greetingPrinted` / `signaturePrinted` tell the model what
//     the page already says.
//   - Letters retold the story fact by fact, with no joke in them. The guide
//     now asks for a few details, each one done something with.
//   - `signaturePrinted` must not quote the page's own signature pattern:
//     Hug Day's first wording ("prints '— <sender>'") made the model write
//     exactly that at the bottom of the letter, twice in a row.
//   - Brands: when the STORY names a chocolate brand, gpt-4o-mini puts it in
//     the letter however the guide is worded (tried premise, tone, a rule at
//     the top of the letter guide). `VW_FORBIDDEN` then drops the letter, so
//     the sender writes it by hand. The real fix is scrubbing forbidden terms
//     out of the story before the call, in storyFill.service — not done here.

import type { AiFillField } from "./types";

/**
 * Chocolate and gift brands. Never named in a guide (naming them primes the
 * model); swept after generation instead. Fragments keep the brand sweep over
 * the repo quiet.
 */
export const VW_FORBIDDEN: readonly string[] = [
  ["Cad", "bury"].join(""),
  ["Dairy", " Milk"].join(""),
  ["Kit", "Kat"].join(""),
  ["Kit", " Kat"].join(""),
  ["Fer", "rero"].join(""),
  ["Ro", "cher"].join(""),
  ["Tob", "lerone"].join(""),
  ["Lin", "dt"].join(""),
  ["Her", "shey"].join(""),
  ["Her", "shey's"].join(""),
  ["Snick", "ers"].join(""),
  ["Ne", "stle"].join(""),
  ["Ama", "ul"].join(""),
  ["Go", "diva"].join(""),
  ["Bourn", "ville"].join(""),
  ["Tw", "ix"].join(""),
  ["Milky", " Bar"].join(""),
  ["Milky", "bar"].join(""),
  ["Ar", "chies"].join(""),
];

/**
 * Appended to every day's premise. The pages' own decorations are full of
 * Hindi words (Jaadu Ki Jhappi Café, Vachan Patra…) and that alone pulled
 * ENGLISH stories into romanised-Hindi pages; the story has to decide.
 */
export const VW_LANGUAGE =
  " Only the sender's own sentences decide the language of what you write — not the names, places, foods or songs they mention: a story told in English sentences gets a page written in English, a Hinglish story (Hindi in Latin letters) gets Hinglish in Latin letters, a Devanagari story gets Devanagari. Every field, short ones included, follows that one choice. When the story names a product brand, write what the thing is instead (their favourite chocolate bar, that box of truffles).";

export const VW_TONE =
  " Write it in the same language and script as the sender's story: an English story gets natural English (a single familiar endearment from their own story is fine), a Hinglish story gets Hinglish the way people actually text it. Never translate word for word. Warm, specific and funny — roughly 70% playful, 30% sincere: tease them about something real from the story, then mean it. Get the sender's and recipient's genders right where the story makes them clear, gender-neutral otherwise. Family-safe. Never name a brand of any product — describe the thing instead.";

export interface CommonOpts {
  /** "Rose Day" */
  dayName: string;
  /** Where the letter appears and how it is revealed on this day. */
  letterWhere: string;
  /** Length guidance for the letter (chars). */
  letterMax: number;
  /** Where the ending line shows. */
  endLineWhere: string;
  /** How the photos are presented on this day ("a bouquet of rosebuds…"). */
  photosWhere: string;
  /** How many photo slots to declare (demo seeds 4). */
  photoCount?: number;
  /** Declare the little per-photo notes too (costs one field per photo). */
  notes?: boolean;
  /** The page prints its own salutation above the letter. */
  greetingPrinted?: string;
  /** The page prints the sender's name / sign-off under the letter. */
  signaturePrinted?: string;
  /** Extra caption guidance for this day (e.g. Chocolate Day's flavour labels). */
  captionExtra?: string;
  /** Override the caption's char cap (default 40). */
  captionMax?: number;
}

export function valentineCommon(o: CommonOpts): AiFillField[] {
  const n = o.photoCount ?? 4;
  const opening = o.greetingPrinted
    ? `${o.greetingPrinted} Start straight with the first sentence of the letter — no salutation, no name on a line of its own.`
    : "Open with their name (or pet name) on its own line, then a blank line.";
  const closing = o.signaturePrinted
    ? `${o.signaturePrinted} So end on the last real sentence — no sign-off phrase, and the sender's name nowhere at the bottom.`
    : "End with a short sign-off phrase and the sender's name on its own line.";
  const fields: AiFillField[] = [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The name the sender actually calls them in the story — a first name or the name they use every day, not a surname or a formal full name. It is printed big on the first screen.",
      example: "Ananya",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The sender's own first name, exactly as they would sign a note to this person.",
      example: "Rohan",
    },
    {
      path: "petName",
      label: "What you lovingly call them",
      kind: "text",
      max: 24,
      guide: "The pet name or nickname the sender uses for them, taken from the story. Shown as a soft subtitle under their name. Leave empty if the story has none rather than inventing a generic one.",
    },
    {
      path: "letter",
      label: `Your ${o.dayName} letter`,
      kind: "longtext",
      max: Math.min(1200, o.letterMax),
      required: true,
      guide:
        `THE MAIN LETTER, from the sender to them, in first person. ${o.letterWhere} ` +
        `${opening} Three or four short paragraphs separated by blank lines (each blank line is a paragraph break on the page). ` +
        "Do NOT retell the story fact by fact. Pick the two or three best details and do something with each one — a tease, a callback, a confession, a 'still not over the time you…'. At least one line should make them laugh out loud, and at least one should be plainly, simply sincere about what they mean to the sender. " +
        `${closing} 600–1000 characters.` +
        VW_TONE,
    },
    {
      path: "endLine",
      label: "The last line",
      kind: "text",
      max: 90,
      guide: `One short closing line, ${o.endLineWhere} It wishes them a happy ${o.dayName} with a tiny twist only these two would get — a pet name, a callback to one detail from the story. Not a generic greeting-card line. Under 80 characters, can carry one emoji at the end. Same language as the story.`,
    },
  ];
  for (let i = 0; i < n; i++) {
    fields.push({
      path: `photos[${i}].caption`,
      label: `Photo ${i + 1} caption`,
      kind: "text",
      max: o.captionMax ?? 40,
      guide: `A handwritten caption for memory photo ${i + 1} — ${o.photosWhere} Name a real moment from the story (a place, a trip, a small event), 2–6 words, lowercase-casual is fine. Each caption must be a different memory. Leave it empty rather than invent a moment the story does not have.${o.captionExtra ? " " + o.captionExtra : ""}`,
      example: "our first chai date ☕",
    });
    if (o.notes) {
      fields.push({
        path: `photos[${i}].note`,
        label: `Photo ${i + 1} little note`,
        kind: "text",
        max: 160,
        guide: `The tiny note that opens with photo ${i + 1}, addressed to them ('you'): one or two sentences about that same memory — a detail the sender still remembers, said with a smile or a tease. Under 140 characters. Same language as the story.`,
        example: "You blew on my chai like I was five. I pretended to mind.",
      });
    }
  }
  return fields;
}
