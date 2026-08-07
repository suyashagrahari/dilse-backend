// ─── missyou-bestfriend — AI form-fill schema ────────────────────────────────
//
// Editor state: the shared Redux `TemplateData` slot
// (client/store/templateEditSlice.ts → { heading; body; senderName }), written
// by the three MANUAL_STEPS in
// client/app/(templates)/missyou-bestfriend/components/EditPanel.tsx. The
// "Things I Miss" cards, the "Hey Bestie," greeting and the emoji are static
// config in config.ts and cannot be addressed.

import type { AiFillTemplateSchema } from "./types";

export const missyouBestfriend: AiFillTemplateSchema = {
  slug: "missyou-bestfriend",
  premise:
    "This is a three-screen 'I miss you' card for a best friend who has moved away, gone abroad, or simply drifted out of daily reach — a cover screen with one big handwritten line, a letter screen with a single warm paragraph above a signature, and a closing screen headed 'Things I Miss'. You are writing the message someone sends the friend who used to be in every ordinary day and now isn't.",
  audience: "bestfriend",
  fields: [
    {
      path: "heading",
      label: "Cover line",
      kind: "text",
      max: 70,
      required: true,
      guide:
        "The one large line on the opening screen, in handwritten script. It should land as missing them, not as an accusation of being absent — 'the house is too quiet' rather than 'you never call'. Six to eight words; longer wraps to three lines at this size. One emoji at the end is fine. Never imply the friend owes the sender contact, a visit, or a reply; that flips a warm page into a guilt trip.",
      example: "Nothing's the same without you here 🫂",
    },
    {
      path: "body",
      label: "The letter",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "One paragraph on a card, roughly 60 to 110 words, three to five sentences. Build it out of specifics from the sender's story, not adjectives: the exact ordinary thing that is now missing — a walk, a canteen table, a 2am voice note, a shop they always stopped at — and the small moment recently when the sender noticed the gap. One inside joke or shared reference, if the story gives you one, is worth more than any amount of 'you mean so much to me'. End somewhere warm and open: glad they exist, looking forward to next time. Write in the sender's own language and script; Hinglish stays Hinglish. Hard constraints: no guilt — do not count how long it has been since they messaged, do not say the sender has been waiting, do not ask them to come back or to call. Do not make it sad enough that the friend feels responsible for the sender's loneliness. Keep it best-friend register, never romantic.",
      example:
        "I walked past the chai stall near the old office today and stood there like an idiot for a second, because that was always our 4pm. Nobody here laughs at the terrible parts of my week the way you did. I have three stories saved up that are going to be much worse over text than they would have been out loud. Anyway — I hope the new city is being kind to you.",
    },
    {
      path: "senderName",
      label: "Signed by",
      kind: "text",
      max: 40,
      guide:
        "The sign-off under the letter and again on the closing screen. Whatever this person is actually called by this friend — a first name, a nickname, a running joke of a name if the story has one. Under about four words. Best-friend register, so a bit of humour is welcome here in a way it would not be on the apology templates.",
      example: "— your favourite disaster",
    },
  ],
};
