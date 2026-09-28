// ─── Capsule — AI form-fill schema ───────────────────────────────────────────
//
// Paths address `CapsuleDraft`, the editor's form state
// (client/app/(templates)/capsule/components/capsuleData.ts:34), held in
// `useCapsuleEditor`'s `draft` slot.
//
// ── WHY THIS SCHEMA IS DELIBERATELY FOUR FIELDS ──────────────────────────────
//
// The template's frozen contract states the product in one line: "THE SEAL IS
// REAL. Nothing written can be read, edited, or inferred before `opensOn` — not
// by the partner, not by the author." It enforces that with a type,
// `SealedCapsuleView`, which is the only shape a client may hold before the
// opening date. What is ON that type is public by design. What is ABSENT from it
// is sealed, and sealed content belongs to the person who wrote it, not to a
// model — a prediction the sender did not make is not a prediction, and the
// whole ceremony a year later is two people finding out what they actually
// thought, which nothing can supply on their behalf.
//
//   ON SealedCapsuleView, therefore fillable:
//     pair.a.name / pair.b.name  → `nameA` / `nameB`
//     opensOn                    → `opensOnDate`
//     stake                      → `stake`  (present precisely so the waiting
//                                  screen has something to say)
//
//   ABSENT from SealedCapsuleView, therefore NOT declared here:
//     predictions[].text        — the payload. The seal exists for this.
//     predictions[].confidence  — the stake weight on a sealed line.
//     predictions[].isWildcard  — same.
//     context.{city,oneLine}    — `cityA`/`lineA`/`cityB`/`lineB`. These read
//                                 back a year later as "One year ago, you were
//                                 in ___. You wrote: ___", the first beat of the
//                                 opening ceremony, and the contract keeps them
//                                 behind the seal for that reason. A city looks
//                                 harmless, but it is structurally part of the
//                                 sealed payload and the rule is the type, not a
//                                 judgement call per field.
//
// ── THE ONE EXCEPTION: `letter` ─────────────────────────────────────────────
//
// The letter at the bottom of the capsule is sealed too, but it is not a claim
// anyone will be judged against — nothing in `scoreCapsule` reads it — and it
// is the sender's own voice, drafted from the sender's own story, before the
// seal, in a field they read and rewrite before pressing it shut. That is the
// same thing every other template's AI letter is. The fill is never offered
// once a capsule exists (see `handleStartCreate`), so it can only ever draft,
// never reach behind a seal. Photo captions/notes are NOT declared: a note is
// the back of a specific photo the model cannot see.
//
// `agreedA` / `agreedB` are editor-local consent ticks, `timezone` is IANA
// machinery, `sealedOn` and `status` are set by the seal itself. None are text.

import type { AiFillTemplateSchema } from "./types";

export const capsule: AiFillTemplateSchema = {
  slug: "capsule",
  premise:
    "Two people each write predictions about their own next year on aged paper, agree on a stake for whoever ends up more wrong, and press a wax seal over the whole thing — after which nobody, including the authors, can read a word of it until the date they chose. You are filling in the outside of the capsule — the two names, the day it opens, and the stake, all visible on the waiting screen while everything inside stays sealed — plus a first draft of the letter the sender leaves at the very bottom of the capsule, which is the last thing read on the day it opens.",
  audience: "partner",
  // The template's copy audit (`assertNeutralCopy`) bans these in anything it
  // prints; the letter is printed, so the fill enforces the same rule.
  forbiddenOutput: [["for", "ever"].join("")],
  fields: [
    {
      path: "nameA",
      label: "First name",
      kind: "text",
      max: 40,
      guide:
        "One of the two people's first name, as they are actually called. It is printed on the outside of the sealed capsule and on the waiting screen ('___ has written 4 predictions'), so it must be a name a person would answer to — short form or nickname if the story uses one.",
      example: "Meera",
      required: true,
    },
    {
      path: "nameB",
      label: "Second name",
      kind: "text",
      max: 40,
      guide:
        "The other person's first name, in the same register as the first. These two names sit side by side on the capsule for as long as it stays sealed, so keep them consistent — two nicknames or two given names, not one of each.",
      example: "Arjun",
      required: true,
    },
    {
      path: "opensOnDate",
      label: "Opens on",
      kind: "date",
      max: 10,
      guide:
        "YYYY-MM-DD — the day the seal breaks. Only fill this if the sender's story actually names a date or a horizon you can resolve to one: an anniversary, a birthday, 'next Diwali', 'a year from today'. It must be in the future, and further out is better — the gap between writing and opening IS the gift. If the story gives you nothing to anchor to, leave it empty; picking an arbitrary date for someone is worse than leaving the field for them.",
    },
    {
      path: "stake",
      label: "The stake",
      kind: "text",
      max: 120,
      guide:
        "What the one who turns out more wrong owes the other. This is the only sender-written line that shows on the waiting screen for the whole sealed year, so it has to be readable cold, months later, by someone who has forgotten writing it. Small, specific and domestic beats grand and expensive — a chore, a dinner, an admission, a task nobody wants. One sentence, under about twenty words, no punchline-hunting. It must not be anything humiliating, and it must not assume the two of them will still be together on the day it opens: this page is written to survive being opened alone, and the contract's copy audit rejects anything that treats 'together' as a given.",
      example: "loser drives to the airport, both directions, no complaining.",
    },
    {
      path: "letter",
      label: "Letter to open last",
      kind: "longtext",
      max: 1200,
      guide:
        "The letter sealed at the very bottom of the capsule, read last, on or after the opening day — from the sender today to the partner on that day. Open with the partner's name on its own line, then two or three short paragraphs, then the sender's name on the last line. Write about RIGHT NOW, using only concrete details the story actually gives (a flat, a routine, a pet, a running joke) and one small hope for the reader. If the story gives fewer than two concrete details, write just two or three short sentences instead of inventing memories or habits. It may be read a year later by one of them alone, so the last paragraph wishes the reader well and makes no promise about the two of them; it does not mention predictions, scores or the stake. Warm and a little funny, simple English (or the story's own language), no lists, no emojis, no rhymes, and never reuse phrases from this example. Line breaks between paragraphs.",
      example:
        "Zoya,\n\nIt is Tuesday, the geyser is broken again, and you have named it Kevin.\n\nI hope Kevin got fixed. I hope you are still the first to laugh in any room.\n\n— Imran",
    },
  ],
};
