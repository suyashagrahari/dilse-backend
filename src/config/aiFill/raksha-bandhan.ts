// ─── AI fill — happy-rakshabandhan-to-brother ────────────────────────────────
//
// Paths address `mf: RakhiData` in
// client/app/(templates)/happy-rakshabandhan-to-brother/hooks/useRakhiEditor.ts
// (`useState<RakhiData>({ ...SAMPLE })`), declared in
// client/app/(templates)/happy-rakshabandhan-to-brother/components/types.ts:30.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
//
//   photoUrl, memories[].imageUrl, shagun.qrImageUrl
//       Media. Never declared — rule 1 — and `assertNoMediaPaths` would refuse
//       them at boot anyway.
//
//   memories[n].caption / .year
//       A memory is a photograph WITH a caption; the caption alone is not a
//       thing this template can render. The fill runs before she has uploaded
//       anything, so a declared caption path would have `applyPatch` create
//       `memories[0] = { caption: "…" }` with no image, and the polaroid grid
//       would render an empty frame. The captions stay hers, written next to
//       the picture they belong to.
//
//   vachan
//       HER BROTHER'S WORDS, not hers. It is filled by the public write-once
//       route when he answers, and the sister's own editor cannot set it
//       either. Handing it to the model would have the page open with his
//       reply already written, before he has seen it.
//
//   distanceKm
//       A measured fact, not a written one. The model would have to guess the
//       kilometres between two cities, and "tied from 2,100 km away" printed
//       under her name is wrong in a way she may not notice and cannot argue
//       with. An empty distance simply hides the line.
//
//   rakhi.threadColorA / B, beadColor
//       Hex colours. Nothing in a story tells you a thread is #9B2226.
//
// ── ON `audience` ────────────────────────────────────────────────────────────
//
// The union is frozen at partner | bestfriend | friend, and a brother is none
// of them. `bestfriend` is the closest REGISTER — warm, loyal, funny, and
// explicitly never romantic, which is the one thing that absolutely must not
// slip on a page a sister sends her brother.
//
// It does leak one wrong word: `renderPeople` introduces the recipient as
// "their friend" when audience is not `partner`. So the premise below states
// the relationship outright and tells the model what to call him, because the
// premise is rendered ABOVE the audience brief in the system prompt and a
// stated relationship beats an inferred one.

import type { AiFillTemplateSchema } from "./types";

export const rakshaBandhan: AiFillTemplateSchema = {
  slug: "happy-rakshabandhan-to-brother",
  premise:
    "This is a Raksha Bandhan page a SISTER is making for her BROTHER — they are siblings, and that is the only relationship in play. Whatever the surrounding context calls him, he is her brother: call him her bhai or her brother, never her friend and never, under any circumstance, anything romantic. The page opens on a photo of the two of them and her greeting, then walks him through the ritual one screen at a time — she puts the tilak on his forehead, feeds him something sweet, circles the aarti, ties the thread — and each step waits for him to tap before it happens. After the rakhi is tied he gets a running ledger of everything he owes her, kept as a joke, and a page of old photographs. You are writing the words she says while she does all this: affectionate, funny, a little rude in the way only a sibling is allowed to be, and never sentimental in a greeting-card way.",
  audience: "bestfriend",
  fields: [
    {
      path: "brotherName",
      label: "Your bhai's name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The brother's name as his sister actually says it — the short form or the household nickname if the story uses one, never a full formal name she would never say out loud. One or two words.",
      example: "Arjun",
    },
    {
      path: "sisterName",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The sender's own name — the sister writing this. It is printed as 'from <name>' at the bottom of the first screen. One or two words, as she signs off.",
      example: "Meera",
    },
    {
      path: "city",
      label: "Where you are",
      kind: "text",
      max: 60,
      // Measured failure, twice: for a story saying her brother had moved to
      // Bangalore this returned Bangalore, and for one saying they grew up in
      // Leeds it returned Leeds. Both print as "from <her name>, <his city>" —
      // a wrong fact about HER, in her own signature. The guide now says whose
      // city it is and what to do when the story never says.
      guide:
        "The city the SENDER — the sister writing this — lives in now. It prints directly after her own name, as 'from Meera, Pune', so it must be HER city: not her brother's, not the city they grew up in, not anywhere the story merely mentions. Fill it only if the story actually says where she is now, and return null otherwise. City name alone — no state, no country, no address.",
      example: "Pune",
    },
    {
      path: "greeting",
      label: "What you want to say",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "The lines on the opening screen, revealed one after another under a photo of the two of them. Write 3 lines, occasionally 4. Each is ONE short sentence under 90 characters that stands on its own, and together they should land like something said out loud rather than written in a card — start from a specific true thing between them (a fight over food, a thing he broke, a time he showed up), and let the last line be the deal the rakhi actually represents. Sibling register: dry, teasing, affectionate underneath, never soppy. No greeting, no sign-off, no 'Dear', no line numbers, no bullet characters, no emoji.",
      example: "You ate my share of the gulab jamun in 2009.",
    },
    {
      path: "rakhi.pendantText",
      label: "On the pendant",
      kind: "text",
      max: 16,
      // The first version of this guide ended "…return null rather than a
      // generic word like 'sister'", and the model returned exactly "sister".
      // Naming the word you do not want raises its probability — the same
      // reason `example` is documented as tone-only. The rule is now stated
      // positively: fill it only from a name the story actually contains.
      guide:
        "The word engraved on the little pendant at the centre of the rakhi. It must be a name or nickname that appears in the story itself — what he calls her, what she signs herself, or a private two-word joke between them. Under 16 characters, because the pendant is physically that small. Lower case unless it is a name. If the story contains no such nickname, return null: an empty pendant is correct, and a relationship word standing in for a name is not something either of them would have engraved.",
      example: "didi",
    },
    {
      path: "rakhi.charm",
      label: "The charm",
      kind: "enum",
      options: ["om", "swastik", "evil-eye", "heart", "star"],
      guide:
        "The charm at the centre of the rakhi, chosen from the list. Pick from what the story actually supports: 'evil-eye' if she talks about warding off nazar or worrying about him, 'heart' if the story is openly affectionate, 'star' if he is the achiever of the family, 'om' or 'swastik' if the family register is religious or traditional. Return null and leave the default alone if the story gives no reason to prefer one.",
    },
    {
      path: "shagun.note",
      label: "A line with the shagun",
      kind: "text",
      max: 120,
      guide:
        "The one line printed beside the payment QR where he can send her shagun — the money a brother traditionally gives his sister on this day. It must read as a joke she is making, never as a request or an invoice: she is teasing him about owing her, not asking to be paid. One short sentence. If the story gives no material for it, return null; the whole section is optional and hides itself.",
      example: "No rush. Next year is also fine. I will remember though.",
    },

    // ── The ledger ────────────────────────────────────────────────────────────
    //
    // Four rows, as indexed pairs rather than one list, because each row is a
    // label AND a value that have to make sense together — "chocolates owed"
    // next to "47". A single `list` field would hand back four strings and
    // there would be no honest way to split them into the two columns the
    // screen prints.
    //
    // The value column is text, not number, on purpose: "every time" and
    // "unpayable" are the funniest entries and both are words.
    {
      path: "ledger[0].label",
      label: "Ledger row 1 — what",
      kind: "text",
      max: 44,
      required: true,
      guide:
        "The first row of the joke ledger of what he owes her, printed as a line of dots between the label and the amount. The thing being counted, in lower case, under 44 characters — a running sibling grievance, specific to them, never a real complaint and never anything that would actually sting. Think of what an accountant would write if the accounts were kept by an annoyed younger sister.",
      example: "chocolates owed",
    },
    {
      path: "ledger[0].value",
      label: "Ledger row 1 — how many",
      kind: "text",
      max: 18,
      required: true,
      guide:
        "The amount in the right-hand column for row 1. Usually an absurdly precise number; occasionally words instead, which is where the joke lands. Under 18 characters, no currency symbols unless the row is literally about money.",
      example: "47",
    },
    {
      path: "ledger[1].label",
      label: "Ledger row 2 — what",
      kind: "text",
      max: 44,
      guide:
        "Second ledger row, same register as the first — a different grievance, not a variation on the same one. Lower case, under 44 characters.",
      example: "times you tore my homework",
    },
    {
      path: "ledger[1].value",
      label: "Ledger row 2 — how many",
      kind: "text",
      max: 18,
      guide: "The amount for row 2. A number or a short phrase, under 18 characters.",
      example: "12",
    },
    {
      path: "ledger[2].label",
      label: "Ledger row 3 — what",
      kind: "text",
      max: 44,
      guide:
        "Third ledger row. This is the one that should quietly turn — something he did FOR her, still counted as a debt, so the joke lands as affection. Lower case, under 44 characters.",
      example: "times you covered for me",
    },
    {
      path: "ledger[2].value",
      label: "Ledger row 3 — how many",
      kind: "text",
      max: 18,
      guide:
        "The amount for row 3. Words rather than a number work best here — the point is that it is uncountable.",
      example: "every time",
    },
    {
      path: "ledger[3].label",
      label: "Ledger row 4 — what",
      kind: "text",
      max: 44,
      guide:
        "The closing row, written like a balance at the foot of an invoice rather than another grievance. Lower case, under 44 characters. Return null if three rows already say it.",
      example: "outstanding balance",
    },
    {
      path: "ledger[3].value",
      label: "Ledger row 4 — how many",
      kind: "text",
      max: 18,
      guide:
        "The amount for the closing row — a word, not a number, and the last laugh of the section.",
      example: "unpayable",
    },
  ],
};
