// ─── sorry-gf — AI form-fill schema ──────────────────────────────────────────
//
// Editor state: the shared Redux `TemplateData` slot
// (client/store/templateEditSlice.ts → { heading; body; senderName }), which is
// what `EditPanel.tsx`'s three MANUAL_STEPS write into. Everything else on the
// page — the promise cards, the emoji, the greeting "My Love," — is static
// config in client/app/(templates)/sorry-gf/config.ts and is not addressable.
// Three fields is the whole surface; each one carries a third of the page.

import type { AiFillTemplateSchema } from "./types";

export const sorryGf: AiFillTemplateSchema = {
  slug: "sorry-gf",
  premise:
    "This is a three-screen apology card a boyfriend/girlfriend sends their partner: a full-bleed cover screen with one big handwritten-style line, then a letter screen where a single paragraph sits on a card above a signature, then a closing screen that repeats the signature under 'My Promises'. You are writing an apology that a real person would say out loud to someone they hurt — quiet, specific, and asking for nothing in return.",
  audience: "partner",
  fields: [
    {
      path: "heading",
      label: "Cover line",
      kind: "text",
      max: 70,
      required: true,
      guide:
        "The single line on the opening screen, set very large in a handwritten script. Write it as the first thing you would say if she opened the door — short, plain, admitting fault. One clause, no more than about eight words; anything longer wraps to three lines and stops feeling like a spoken sentence. It may carry one emoji at the end and nothing else. Never phrase it as a request ('forgive me?', 'talk to me?') — the cover only admits, it does not ask.",
      example: "I got it wrong, and I know it 🥺",
    },
    {
      path: "body",
      label: "The letter",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "The apology itself — one paragraph on a card, roughly 60 to 110 words, three to five sentences. It must NAME the actual thing that happened, in the sender's own words from their story: what he did, when, and what it cost her. A vague 'I'm sorry for everything' is the exact failure this page exists to avoid. Structure it as: name the act, name what it did to her, say what you understood afterwards, say the one concrete thing you will do differently. Write in the sender's own language and script — if their story is in Hinglish, the letter is in Hinglish. Hard constraints: do not ask her to forgive you, do not set a deadline on her feelings, do not mention how much you are suffering or how badly you cannot sleep — that turns an apology into a request for comfort and it is the single thing that makes these pages land badly. Never make excuses, never explain why she also contributed, never end on 'but'. If the story describes something genuinely serious, drop all cuteness and write it straight and sober.",
      example:
        "I snapped at you in front of your friends on Saturday, and then I made it worse by acting like it was nothing. You had been looking forward to that evening for weeks and I turned it into something you had to manage. I have thought about your face all week. I am not going to talk over you again — when I feel that heat rising I am going to step outside instead.",
    },
    {
      path: "senderName",
      label: "Signed by",
      kind: "text",
      max: 40,
      guide:
        "The sign-off under the letter and again on the last screen, in script type. Not a formal full name — this is how he actually signs a message to her: a first name, a pet name she uses for him, or a short phrase. Keep it under about four words. Given the page's tone, avoid a triumphant or flirty sign-off; something plain and a little humbled fits better than 'Forever yours'.",
      example: "— Aarav",
    },
  ],
};
