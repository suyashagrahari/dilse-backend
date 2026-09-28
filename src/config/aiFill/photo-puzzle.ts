// ─── AI fill — photo-puzzle ("The Last Piece") ───────────────────────────────
//
// Paths address `mf: PuzzleData` in
// client/app/(templates)/photo-puzzle/hooks/usePhotoPuzzleEditor.ts
// (`useState<PuzzleData>`), declared in
// client/app/(templates)/photo-puzzle/components/types.ts.
//
//   imageUrl, photos[].url, gifs — media. Never declared. (Rule 1.)
//   difficulty, imageCrop*, theme — the sender's choices, not copy.
//   photos[].caption / note — NOT declared: the sender's own photos decide how
//                      many entries exist, and a path per index would invent
//                      captions for photos that are not there.
//   lines / melody — legacy jigsaw fields; the sliding rebuild no longer
//                      reads them, so they are not filled.

import type { AiFillTemplateSchema } from "./types";

export const photoPuzzle: AiFillTemplateSchema = {
  slug: "photo-puzzle",
  premise:
    "A photograph of the two of them has been cut into a sliding-tile puzzle — a 3×3, 4×4 or 5×5 grid with one empty slot — and the recipient slides the tiles back into place. The sender kept the very last piece; the moment the picture is complete, that piece flies into the gap, confetti goes off, and the page opens up their memory photos and finally a love letter. You are writing the line that appears when the last piece lands, the letter at the end, and the quiet sign-off.",
  audience: "partner",
  fields: [
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The name of the person who made the puzzle and kept the last piece — the sender. One or two words, as they actually sign off.",
      example: "Rohan",
    },
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The name of the person solving the puzzle, as the sender says it out loud — a pet name if they use one, never a formal name they would not say. One or two words.",
      example: "Ananya",
    },
    {
      path: "finalPieceMessage",
      label: "When the last piece lands",
      kind: "text",
      max: 90,
      required: true,
      guide:
        "The big line that appears the instant the final tile flies into the gap and the photo is whole. One short sentence under 90 characters that plays on 'the last piece' — the recipient being the piece that completes the sender's picture. Sweet and a little cheeky, never cheesy-poetic, no emojis.",
      example: "Turns out you were the missing piece all along.",
    },
    {
      path: "letter",
      label: "Your main letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The love letter that opens at the very end, after the puzzle is solved and the memory photos have been looked at. Open with the recipient's name on its own line, then two to four short paragraphs, then sign off with the sender's name on the last line. Touch the puzzle idea lightly once (pieces, the picture being complete) and then get sincere: one concrete shared memory from the story and one thing the sender has never said out loud. Simple warm spoken English, no lists, no emojis, no rhymes. Line breaks between paragraphs.",
      example:
        "Ananya,\n\nI cut our photo into pieces just to watch you put it back together. Very on brand for us.\n\nI still think about the auto ride back from Marine Drive, when you fell asleep on my shoulder and I didn't move for forty minutes.\n\nEvery version of my life that makes sense has you in it.\n\n— Rohan",
    },
    {
      path: "closingLine",
      label: "The sign-off at the very end",
      kind: "text",
      max: 100,
      required: true,
      guide:
        "The single quiet line on the last screen, after the letter. One short sentence under 100 characters, soft and a little anticlimactic on purpose — the picture and the letter have already done the work.",
      example: "There. That's the whole picture.",
    },
  ],
};
