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
    "This is a Raksha Bandhan page a SISTER is making for her BROTHER — they are siblings, and that is the only relationship in play. Whatever the surrounding context calls him, he is her brother: call him her bhai or her brother, never her friend and never, under any circumstance, anything romantic. The page opens on a photo of the two of them and her greeting, then walks him through the ritual one screen at a time — she puts the tilak on his forehead, feeds him something sweet, circles the aarti, ties the thread — and each step waits for him to tap before it happens. After the rakhi is tied he gets a running ledger of everything he owes her, kept as a joke, and a page of old photographs. You are writing the words she says while she does all this: affectionate, funny, a little rude in the way only a sibling is allowed to be, and never sentimental in a greeting-card way. Keep every line you write in ONE script from start to finish: if you are writing Hinglish, write it in Latin letters all the way through, and if you are writing Hindi, write the whole line in Devanagari. A sentence with Devanagari words dropped into a Latin one reads as a rendering fault rather than as a choice.",
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
    // ── `city` IS NOT ON THIS SCHEMA, AND THAT IS THE FIX ────────────────────
    //
    // It was, and it was wrong three times out of three against the live model.
    // The field prints immediately after her own name — "from Ananya,
    // Bangalore" — so it has to be HER city. Every test story named a city
    // belonging to someone else: her brother's new job in Bangalore, the town
    // they grew up in. The model reached for the only city in the text.
    //
    // Rewriting the guide to say whose city it is, to name the near-misses, and
    // to return null when the story does not place her did not fix it: the
    // third attempt still returned Bangalore.
    //
    // A city is one word she can type in two seconds, and there is nothing in a
    // story about a brother that reliably says where his sister lives. Weighed
    // against publishing a false statement about her in her own signature, the
    // slot is not worth filling, so the model is no longer offered it.
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
        "The word engraved on the little pendant at the centre of the rakhi. Use the nickname the story gives you — if it says what he calls her, even in passing ('he calls me chhoti'), that is the word, and it goes on the pendant as-is. A name she signs herself or a private two-word joke works too. Under 16 characters, because the pendant is physically that small. Lower case unless it is a name. If the story names no such word at all, return null: an empty pendant is correct, and a bare relationship word standing in for a name is not something either of them would have engraved.",
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
        "The amount in the right-hand column for row 1. Usually an absurdly precise number, high enough to be funny — the joke is that someone has been keeping count for years. Occasionally words instead, where those land better. Never a bare '1': one of something is not a running tally and reads as an unfilled field. Under 18 characters, no currency symbols unless the row is literally about money.",
      example: "47",
    },
    // ── ROWS 2-4 CARRY NO `example`, DELIBERATELY ────────────────────────────
    //
    // They did, and the examples came back as the answer. A test story with
    // material for about three grievances produced a ledger whose row 2 was
    // "times you tore my homework" and whose row 4 was "outstanding
    // balance"/"unpayable" — my example strings, verbatim, for a family they
    // had nothing to do with.
    //
    // The system prompt already says never to reuse an example's words. That
    // holds while the model has its own material and breaks the moment it runs
    // out: asked for four rows from a three-row story, the nearest phrasing to
    // hand is the example. So these rows say what belongs in them and show
    // nothing, and each one is explicitly allowed to come back empty. Three true
    // rows beat four where the last is someone else's joke.
    {
      path: "ledger[1].label",
      label: "Ledger row 2 — what",
      kind: "text",
      max: 44,
      guide:
        "Second ledger row: a DIFFERENT grievance from the first, drawn from its own moment in the story rather than a rephrasing of row 1. Lower case, under 44 characters. If the story only really supports one entry, return null and leave this row empty — an invented grievance is one he will read and not recognise.",
    },
    {
      path: "ledger[1].value",
      label: "Ledger row 2 — how many",
      kind: "text",
      max: 18,
      guide:
        "The amount for row 2, in the right-hand column. A precise-sounding count, or a short phrase where a number would be less funny. Under 18 characters. Return null if row 2 is empty. Never a bare '1' — one of something is not a running tally and reads as a placeholder.",
    },
    {
      path: "ledger[2].label",
      label: "Ledger row 3 — what",
      kind: "text",
      max: 44,
      guide:
        "Third ledger row, and the one that turns: something he did FOR her, still entered as a debt, so the joke lands as affection rather than complaint. Take it from a moment in the story where he showed up for her. Lower case, under 44 characters. Return null if the story has no such moment.",
    },
    {
      path: "ledger[2].value",
      label: "Ledger row 3 — how many",
      kind: "text",
      max: 18,
      guide:
        "The amount for row 3. Words work better than a number here, because the point of this row is that it cannot be counted. Under 18 characters. Return null if row 3 is empty.",
    },
    {
      path: "ledger[3].label",
      label: "Ledger row 4 — what",
      kind: "text",
      max: 44,
      guide:
        "An optional closing row, phrased like the bottom line of an invoice rather than another grievance — it exists to end the section on a laugh. Lower case, under 44 characters. Return null unless the three rows above are all filled from real material AND this genuinely adds a joke; three rows is a complete ledger.",
    },
    {
      path: "ledger[3].value",
      label: "Ledger row 4 — how many",
      kind: "text",
      max: 18,
      guide:
        "The closing amount — a word rather than a number, and the last laugh of the section. Under 18 characters. Return null if row 4 is empty.",
    },
  ],
};
