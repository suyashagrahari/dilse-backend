import type { AiFillTemplateSchema } from "./types";

/**
 * Proposal — AI form-fill schema.
 *
 * `mf` is `ProposalData` (client `app/(templates)/proposal/components/types.ts`).
 *
 * The page runs in four sections: an audio gate the recipient taps to begin, a
 * scrapbook of captioned polaroids, the ask itself (a YES button that grows and
 * a NO button that dodges), and the celebration screen that unseals the note.
 *
 * Deliberately NOT declared, and why:
 *  - `senderName` / `recipientName` — names the sender types in the composer.
 *  - `memories[i].imageUrl`, `musicUrl` — media (rule 1).
 *  - `memories[4]` and `memories[5]` — the editor seeds four polaroids; writing
 *    a caption at an index with no picture behind it renders an empty white
 *    card, and `dbToProposalData` drops it. Four captions, four pictures.
 *  - `heroArt` — it selects which bundled animation headlines the ask. That is
 *    a media choice, and the model does not make media choices; it is also one
 *    tap for the sender.
 *  - The "No" button ladder (`DODGE_RUNGS`) — hard-coded in the client.
 */
export const proposal: AiFillTemplateSchema = {
  slug: "proposal",
  premise:
    "The sender is proposing, and this page is how they are asking: a tap-to-begin gate, a scrapbook of photos with a line written under each, the ask itself with a YES button that grows and a NO button that runs away, then a celebration screen that unseals a handwritten note. A real person is going to open this and then has to answer, so every line must make it easy to say yes and equally easy to say no — nothing may assume the answer, guilt them toward it, or treat a yes as something already owed.",
  audience: "partner",
  fields: [
    {
      path: "gateTitle",
      label: "Opening question",
      kind: "text",
      max: 80,
      guide:
        "The single line on the very first screen, before anything else appears — the sender asking permission to start. Under 80 characters, an open question they can answer in their own time. Do not hint at what is coming and do not pre-empt it; if this line already sounds like a proposal, the surprise is gone and so is their choice about when to have it.",
      example: "Got a minute? I made you something.",
    },
    {
      path: "gateButtonLabel",
      label: "Opening button",
      kind: "text",
      max: 30,
      guide:
        "The label on the one button on that first screen — the recipient's own 'go on then'. Two to four words, under 30 characters. It only opens the page; it is not the answer to the proposal, so keep it light and unweighted.",
      example: "Okay, show me",
    },
    {
      path: "memoryLaneTitle",
      label: "Scrapbook title",
      kind: "text",
      max: 70,
      guide:
        "The heading above the stack of polaroids, naming what these pictures are. Under 70 characters, warm and plain. It is a caption for their whole history rather than a slogan, so understated beats grand.",
    },
    {
      path: "memories[0].caption",
      label: "Polaroid 1 — caption",
      kind: "text",
      max: 120,
      guide:
        "The line written under the first polaroid, in a hand-lettered face on one or two short lines. This one is the beginning — the day they met, the first message, whatever their story opens with. Under 120 characters. You cannot see the photograph, so write about the moment and never about what is in the frame ('the day you said hi first', not 'us in a blue jacket').",
    },
    {
      path: "memories[1].caption",
      label: "Polaroid 2 — caption",
      kind: "text",
      max: 120,
      guide:
        "The second polaroid's line: an ordinary day, or a small disaster they laugh about now — the first argument, the trip that went wrong, the food neither of them could finish. Under 120 characters, past tense, affectionate about the mess. Again, describe the moment, not the picture.",
    },
    {
      path: "memories[2].caption",
      label: "Polaroid 3 — caption",
      kind: "text",
      max: 120,
      guide:
        "The third polaroid's line: the one only the two of them would understand — an inside joke, a phrase, a place that means nothing to anybody else. Under 120 characters. This is the caption that proves the page was made by hand, so use the most specific thing in their story.",
    },
    {
      path: "memories[3].caption",
      label: "Polaroid 4 — caption",
      kind: "text",
      max: 120,
      guide:
        "The fourth polaroid's line, and the one that has to reach the present: the ordinary everyday, still going. Under 120 characters. It sets up the ask on the next screen, so let it point forward without asking anything yet.",
    },
    {
      path: "askHeadline",
      label: "The big question",
      kind: "text",
      max: 90,
      required: true,
      guide:
        "The proposal itself — the headline on the screen where the ask appears, in the largest type on the page. One clear question in the sender's own voice, under 90 characters. It must be a genuine question with a real answer: no 'you have no choice', no 'say yes', no phrasing that treats the answer as settled. Short is better than ornate; this is the line they will remember.",
    },
    {
      path: "yesLabel",
      label: "The YES button",
      kind: "text",
      max: 30,
      guide:
        "The label on the YES button, which grows every time the No button dodges. Short and joyful, under 30 characters. Write it as the recipient's own word rather than the sender's instruction — something they would be happy to press — and never as an oath or a promise they would be signing.",
    },
    {
      path: "celebrationTitle",
      label: "Celebration title",
      kind: "text",
      max: 90,
      guide:
        "The heading that appears the instant they say yes, over confetti. Under 90 characters, pure delight. Keep it out of the possessive — 'you're mine now' is the wrong note entirely; joy, relief and disbelief are the right ones.",
    },
    {
      path: "secretNote",
      label: "The secret note",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The letter that unseals after they say yes — the honest bit the whole page was built to deliver. Four to seven sentences in the sender's plain, spoken voice, built from the specifics of their story rather than from proposal language. No markdown, no 'Dear ―', no sign-off: the sender's name is printed underneath already. It should sound like something said out loud with a slightly unsteady voice, and it must not ask them for anything or remind them what saying yes commits them to.",
    },
    {
      path: "metDate",
      label: "The day you met",
      kind: "date",
      guide:
        "The day the two of them met, as YYYY-MM-DD — the page turns it into a live 'it has been N days' counter. Fill it only if the sender's story states an actual date; a guessed date rendered as a precise day count is a mistake anyone can see. Leave it empty otherwise and the counter simply hides itself.",
    },
  ],
};
