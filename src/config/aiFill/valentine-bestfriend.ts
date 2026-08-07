// ─── valentine-bestfriend — AI form-fill schema ──────────────────────────────
//
// Editor state: the shared Redux `TemplateData` slot
// (client/store/templateEditSlice.ts → { heading; body; senderName }), written
// by the three MANUAL_STEPS in
// client/app/(templates)/valentine-bestfriend/components/EditPanel.tsx. The
// "Promises of Love" cards, the "My Dearest," greeting and the hearts are
// static config in config.ts and are not addressable.

import type { AiFillTemplateSchema } from "./types";

export const valentineBestfriend: AiFillTemplateSchema = {
  slug: "valentine-bestfriend",
  premise:
    "This is a Galentine's / Palentine's card — a Valentine's card deliberately sent to a best friend rather than a romantic partner, and the joke and the sweetness both come from that swap. Three screens: a cover with one big handwritten line, a letter screen with one paragraph above a signature, and a closing screen of promises. You are writing the message someone sends the friend who has outlasted every relationship they have had.",
  audience: "bestfriend",
  fields: [
    {
      path: "heading",
      label: "Cover line",
      kind: "text",
      max: 70,
      required: true,
      guide:
        "The one big line on the opening screen, in handwritten script. It should make the conceit obvious in a breath — this is Valentine's Day, aimed at a best friend, and that is the point. Six to eight words, one emoji at the end is fine. Playful beats earnest here. It must never read as an actual romantic confession: the friend should smile, not wonder what is happening.",
      example: "You've been my valentine for years 💗",
    },
    {
      path: "body",
      label: "The letter",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "One paragraph on a card, roughly 60 to 110 words, three to five sentences. This is affection with the volume up but the register kept firmly platonic — the humour comes from borrowing the language of a love letter for a friendship, so lean into that and then land on something true. Use specifics from the sender's story: how long they have known each other, the thing this friend reliably does, a moment where they showed up when nobody else did. Include one bit that is genuinely funny at the sender's own expense. Write in the sender's own language and script; Hinglish stays Hinglish. Hard constraints: never write anything that could be mistaken for a real romantic declaration or a confession of feelings — this template only works if both people are sure it is a joke about Valentine's Day. Do not make jokes about the friend being single, unlovable, or a consolation prize; if there is a joke, it is on the sender. No physical or flirtatious description at all.",
      example:
        "Eleven years, four cities, and roughly nine hundred of my worst decisions — and you are still here, which frankly says more about your judgement than mine. Every actual valentine I have had has come and gone while you stayed put, answered the phone at stupid hours, and never once said I told you so out loud. Happy Galentine's. You are stuck with me, and I am not sorry about it.",
    },
    {
      path: "senderName",
      label: "Signed by",
      kind: "text",
      max: 40,
      guide:
        "The sign-off under the letter and again on the closing screen, set large in script. A first name, the nickname this friend uses, or a short joke sign-off that fits the mock-romantic conceit. Under about four words, and it should read as clearly platonic.",
      example: "— your permanent valentine",
    },
  ],
};
