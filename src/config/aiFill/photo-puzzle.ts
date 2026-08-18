// ─── AI fill — photo-puzzle ──────────────────────────────────────────────────
//
// Paths address `mf: PuzzleData` in
// client/app/(templates)/photo-puzzle/hooks/usePhotoPuzzleEditor.ts:64
// (`useState<PuzzleData>`), declared in
// client/app/(templates)/photo-puzzle/components/types.ts:34.
//
//   lines: string[]  — types.ts:44. A genuine array of STRINGS, so it is one
//                      `list` field, not numbered `lines[0]` paths.
//   imageUrl, revealImageUrl — media. Never declared. (Rule 1.)
//   cols/rows/melody/finalPieceMode — geometry, audio and behaviour. Not copy;
//                      the grid depends on the photograph the sender picks.

import type { AiFillTemplateSchema } from "./types";

export const photoPuzzle: AiFillTemplateSchema = {
  slug: "photo-puzzle",
  premise:
    "A photograph of the two of them has been cut into a jigsaw and scattered into a tray, and the recipient drags the pieces back into place with their thumb. Every piece that lands pays out one line of a letter in a panel beside the board — there is no timer, no score and no way to lose, and the sender holds back the last piece until they are asked for it. You are writing the letter that the puzzle pays out, one line at a time.",
  audience: "partner",
  fields: [
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The name of the person who cut up the photo and is holding the last piece — the sender. One or two words, as they actually sign off.",
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
      path: "lines",
      label: "The letter, one line per piece",
      kind: "list",
      max: 12,
      itemMax: 110,
      required: true,
      guide:
        "The whole letter, broken into single lines — one lands each time a piece clicks into place, so they are read slowly, minutes apart, with a thumb on the screen. Write 10 to 12 lines. Each line is ONE short sentence under 110 characters and must stand up alone, but read in order they should build: start by admitting this was hard to write, spend the middle on small specific true things about them (a habit, a place, a night, something they do that nobody else notices), and let the last two lines set up the withheld piece — the sender is keeping one and wants to be asked for it. No greeting, no sign-off, no line numbers, no bullet characters. Plain spoken register, the way one person talks to another at 1 a.m., not the way a card is written.",
      example: "You laugh about half a second before the punchline. Every single time.",
    },
    {
      path: "finalPieceMessage",
      label: "Held-back-piece message",
      kind: "text",
      max: 90,
      required: true,
      guide:
        "What sits on the empty hole in the middle of the finished photograph while the recipient waits for the sender to release the last piece. One short sentence under 90 characters, playful and inviting rather than withholding — it should read as an excuse to talk to each other, never as a hostage note or a demand.",
      example: "I have the last piece. Ask me for it.",
    },
    {
      path: "closingLine",
      label: "The line under the finished photo",
      kind: "text",
      max: 100,
      required: true,
      guide:
        "The single line that appears once the last piece lands, the seams fade and the whole photograph is finally visible. One short sentence, under 100 characters, quiet and a little anticlimactic on purpose — the picture has already done the work, so this only has to close the door softly.",
      example: "There. That's the whole thing.",
    },
  ],
};
