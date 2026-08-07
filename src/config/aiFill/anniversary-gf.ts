import type { AiFillTemplateSchema } from "./types";

/**
 * anniversary-gf — "Our Anniversary".
 *
 * Paths resolve against `ContentData` in
 * client/app/(templates)/anniversary-gf/components/types.ts, held as `mf` in
 * useAnniversaryEditor.ts (line 39).
 *
 * This editor is genuinely small: EditSheet.tsx exposes exactly four steps —
 * Names, Message, Photos (pasted image URLs), Music (preset tracks) — so the
 * three text leaves below are the entire sender-editable surface.
 *
 * `anniversaryDate` is intentionally NOT declared even though it powers the
 * live "together for…" counter on the cover: no step in EditSheet.tsx lets the
 * sender edit it, so a model-written value could never be corrected by hand.
 * `quizQuestions` and `spinItems` are likewise not editable, and `galleryPhotos`
 * / `musicTracks` are media.
 */
export const anniversaryGf: AiFillTemplateSchema = {
  slug: "anniversary-gf",
  audience: "partner",
  premise:
    "An anniversary page that opens on a cover counting the years, months and days the two of them have been together, with rings, champagne glasses and hearts drifting up the screen, and tabs underneath for games, a gallery and their music. The message on that cover is the only writing on the page, so it carries the entire occasion by itself.",
  fields: [
    {
      path: "recipientName",
      label: "Her name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The name he calls her, shown on the cover above the counter. Short, spoken, real — the pet name if their story uses one, otherwise her first name. Never a full legal name and never a title.",
    },
    {
      path: "senderName",
      label: "How he signs it",
      kind: "text",
      max: 40,
      guide:
        "The sign-off beneath the message — his name, or the way he already signs to her ('your forever', 'yours, A'). Under about 25 characters. Nothing that asks for anything back.",
    },
    {
      path: "personalMessage",
      label: "The anniversary message",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The only piece of writing on this page, sitting under a live counter of exactly how long they've been together — so write like someone who has just looked at that number. 2 to 4 paragraphs, 350 to 650 characters, separated by blank lines. Anniversaries pull hard toward stock phrases ('here's to forever', 'you complete me'); resist that and build the message out of what actually happened in the year the sender describes — what they got through, what changed, what stayed exactly the same. One line looking forward at the end is enough. Nothing that tallies up who gave more, nothing that reads as a reminder of what she owes him, and no reference to a wedding or a proposal unless his story clearly says so.",
    },
  ],
};
