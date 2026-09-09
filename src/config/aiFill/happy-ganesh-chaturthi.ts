import type { AiFillTemplateSchema } from "./types";

// ─── Ganesh Chaturthi — "Happy Ganesh Chaturthi" ─────────────────────────────
//
// Paths resolve against `GaneshData` in
// client/app/(templates)/happy-ganesh-chaturthi/components/types.ts, held as
// `mf` in useGaneshEditor.ts.
//
// ── WHY `audience: "friend"` ────────────────────────────────────────────────
//
// The union is frozen at partner | bestfriend | friend and this template is the
// one in the app with genuinely no fixed relationship: the same page goes to a
// cousin, a colleague, a building group and somebody's mother. `friend` is the
// only member of the three that does not assert intimacy the sender may not
// have, and it is the register that survives being wrong — a page slightly
// warmer than a colleague expected is fine; a page addressed to a mother in
// partner-register is not recoverable.
//
// The premise below therefore does the work `audience` cannot: it tells the
// model outright that the relationship is unknown and that every line must hold
// for any of them.
//
// ── THIS IS THE ONE SCHEMA IN THE APP THAT PINS THE LANGUAGE TO ENGLISH ─────
//
// Every other template inherits the house rule that generated copy is in the
// SENDER'S own language and script — Hinglish stays Hinglish — and that rule is
// the single thing that decides whether output reads as the sender's voice or as
// a machine's. It is overridden here, deliberately, and only here.
//
// The template's own copy is entirely in English: there is no Devanagari
// anywhere on the page, the aarti is carried in English, and the section
// headings are English sentences. A generated greeting in Devanagari or Hinglish
// would sit directly above English headings in a different script, and the page
// would read as one somebody translated halfway and abandoned — which is exactly
// the defect a live run produced before this rule existed, with Devanagari
// greeting lines above English wish rows.
//
// So: consistency with the page beats fidelity to the sender's typing, for this
// template. If the page ever carries Devanagari again, delete this paragraph
// from the premise and the house rule takes over on its own.
//
// ── WHAT IS DELIBERATELY NOT DECLARED ───────────────────────────────────────
//
//   `city`               — it prints as part of the sender's own signature, and
//                          a story about a festival never reliably says where
//                          the SENDER lives. The rakhi schema learned this the
//                          expensive way: the model returns the only city in the
//                          text, which belongs to somebody else, and a false
//                          statement under a real person's name is not worth a
//                          field they can type in two seconds.
//   `photoUrl`,          — media. `FieldKind` has no member for it and
//     `vargani.qrImageUrl`  `assertNoMediaPaths` would refuse the schema at boot.
//                          The model must never invent a URL.
//   `vargani.upiId`      — a payment address. Not media by the checker's rules,
//                          and absolutely not something a language model may
//                          guess: a plausible-looking wrong UPI ID sends real
//                          money to a stranger.
//   `reply`              — belongs to the reader, written on their own page.
export const ganeshChaturthi: AiFillTemplateSchema = {
  slug: "happy-ganesh-chaturthi",
  audience: "friend",
  premise:
    "This is a Ganesh Chaturthi page the sender is making for one specific person, and you do NOT know how they are related — it could be a cousin, a school friend, a colleague, a neighbour, an aunt, or their own mother. Write every line so that it would land correctly for any of those: warm, festive, respectful, never romantic, never presuming a closeness the story has not shown you. If the story does tell you the relationship, use it. The page is a single long page the reader scrolls: it opens on the sender's greeting beside a festival illustration, then the aarti, where a lamp revolves around a round portrait of Ganesh while a recording plays and one line of the sender's own is shown alone on the screen. Below that are the five things that are offered and what each is for, the sender's photograph, a short list of what the two of them are hoping for this year, the sweet that is handed out at the end, and a box where the reader writes one line back. You are writing the sender's words: the greeting, the line at the aarti, the wish list and the note with the sweet. This is a devotional page and the tone is festive rather than jokey — warmth and sincerity, with room for one ordinary domestic detail. Do not write a prayer on the reader's behalf and do not promise them anything; the sender is wishing, not blessing. WRITE EVERYTHING IN ENGLISH, whatever language the sender's story is written in, and do not use any Hindi, Marathi or Sanskrit words or any Devanagari script: this particular page is set entirely in English and a line in another language or script would sit directly above English headings and read as a page translated halfway and abandoned. Plain, warm, unfussy English — the English an Indian family actually speaks at home, not a formal register. The words 'modak', 'aarti', 'prasad' and 'diya' are the ordinary English names for those things and are fine to use; full Hindi or Marathi sentences are not. EVERY NUMBER MUST COME FROM THE STORY VERBATIM: if it says this is the eleventh year, write eleventh; if it gives no count at all, write the line without one. A number you chose yourself is a false statement about a real household, and it is the one kind of error the sender will not catch, because the sentence around it reads perfectly.",
  // The page prints its own closing lines, and a generated field repeating one
  // of them is a duplicated line thirty pixels away. Enforced by a
  // deterministic sweep rather than by the prompt — the prompt asks, and asking
  // is not enough.
  forbiddenOutput: ["Morya", "Mangalmurti"],
  fields: [
    {
      path: "recipientName",
      label: "Who it's for",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The name of the person this page is being sent to, printed under the title at the top. Use the name the sender actually says — the short form or household name if the story uses one. If the story only ever calls them by a relationship word the sender genuinely uses as a name, that word is the answer. One or two words.",
      example: "Aditi",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The sender's own name. It is printed as 'from <name>' at the top and again on the downloadable card, so it must be how they sign off rather than a full legal name. One or two words.",
      example: "Rohit",
    },
    {
      path: "greeting",
      label: "What you want to say",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "The lines under the title, set large and one below the other. Write 3 lines, occasionally 4. Each is ONE short sentence under 90 characters that stands on its own. Start from something specific and true — a shared habit on this day, the pandal they always go to, who makes the sweets, the year somebody was away — and let the last line be the wish itself. Festive and sincere, in plain English; no 'Dear', no sign-off, no line numbers, no bullet characters, no emoji, and nothing that reads as a template greeting anyone could have sent.",
      example: "My mother still refuses to let anyone else fold the modak.",
    },
    {
      path: "aartiLine",
      label: "Your line at the aarti",
      kind: "text",
      max: 120,
      required: true,
      guide:
        "One sentence, shown alone on the screen while the lamp revolves and the recording plays. This is the quietest moment on the page and it is the sender speaking, not praying — what this day means to them, or what they hope for the person reading. Under 120 characters, one sentence, plain and unhurried English. No exclamation marks, no chant, no 'may he bless you' formula.",
      example: "Whatever else changes, this week always brings everyone home.",
    },
    {
      path: "prasadNote",
      label: "A line with the sweet",
      kind: "text",
      max: 120,
      guide:
        "The line printed beside the modak near the end, where the reader is handed their share. Light and domestic — who makes them, how many are left, the one person who takes more than their share. One short sentence under 120 characters. Return null if the story gives no material for it; the note hides itself when empty.",
      example: "There were fourteen of them this morning. There are four now.",
    },

    // ── The wish list ─────────────────────────────────────────────────────────
    //
    // Rows as indexed label/value pairs rather than one `list` field, because
    // each row is two halves that have to make sense side by side — "For my
    // mother's knee" next to "one painless year". A single list would hand back
    // four strings and there would be no honest way to split them into the two
    // columns the page prints.
    //
    // Row 1 carries an `example` and rows 2-4 deliberately do not. The rakhi
    // schema paid for that lesson: with examples on every row, a story with
    // material for three came back with the fourth copied verbatim from the
    // example, for a family it had nothing to do with. The system prompt already
    // forbids reusing an example, and that holds only while the model has its
    // own material. So these rows say what belongs in them, show nothing, and
    // are each explicitly allowed to come back empty.
    {
      path: "wishes[0].label",
      label: "Hoping for — 1",
      kind: "text",
      max: 44,
      required: true,
      guide:
        "The first row of the short list of what the two of them are hoping for this year, printed with a line of dots between the left column and the right. The left column is WHO or WHAT it is for — a person, an exam, a house move, somebody's health. Sentence case, under 44 characters, specific to them rather than a virtue anyone would list. Begin with 'For'.",
      example: "For my mother's knee",
    },
    {
      path: "wishes[0].value",
      label: "Hoping for — 1, what",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "The right-hand column for row 1: what is actually hoped for, in three or four words. Concrete and modest — the register is a household hoping for one specific thing, not a wish list. Under 30 characters, lower case, no full stop.",
      example: "one painless year",
    },
    {
      path: "wishes[1].label",
      label: "Hoping for — 2",
      kind: "text",
      max: 44,
      guide:
        "Second row: a DIFFERENT person or thing from row 1, drawn from its own moment in the story rather than a rephrasing. Sentence case, under 44 characters, beginning with 'For'. If the story only really supports one row, return null and leave this empty — an invented wish is one the reader will not recognise as theirs.",
    },
    {
      path: "wishes[1].value",
      label: "Hoping for — 2, what",
      kind: "text",
      max: 30,
      guide:
        "The right-hand column for row 2, three or four words, lower case. Under 30 characters. Return null if row 2 is empty.",
    },
    {
      path: "wishes[2].label",
      label: "Hoping for — 3",
      kind: "text",
      max: 44,
      guide:
        "Third row, and the one that turns outward. The left column must name the PERSON READING THE PAGE, or something that belongs to them, and it must be drawn from what the story says THEY are dealing with. The sender writes this row about the reader, never about themselves — a row carrying the sender's own name has the wrong person on it even when the hope beside it is the right one. Sentence case, under 44 characters, beginning with 'For your'. Return null if the story says nothing specific about the reader.",
    },
    {
      path: "wishes[2].value",
      label: "Hoping for — 3, what",
      kind: "text",
      max: 30,
      guide:
        "The right-hand column for row 3, three or four words, lower case. Under 30 characters. Return null if row 3 is empty.",
    },
    {
      path: "wishes[3].label",
      label: "Hoping for — 4",
      kind: "text",
      max: 44,
      guide:
        "An optional closing row, and the only one allowed to be light — the running household joke about what somebody asks for every single year. Sentence case, under 44 characters. Return null unless the three rows above are all filled from real material AND the story actually contains such a joke; three rows is a complete list.",
    },
    {
      path: "wishes[3].value",
      label: "Hoping for — 4, what",
      kind: "text",
      max: 30,
      guide:
        "The right-hand column for row 4 — the punchline, in three or four words, lower case. Under 30 characters. Return null if row 4 is empty.",
    },

    {
      path: "vargani.note",
      label: "A line with the payment code",
      kind: "text",
      max: 120,
      guide:
        "The one line printed beside an optional payment code, for the collection a building or a group of friends runs towards its pandal. It must read as an invitation and never as a demand or an amount owed — anyone who ignores it should feel entirely fine about that. One short sentence under 120 characters. Return null if the story says nothing about a pandal or a collection; the whole block hides itself when empty.",
      example: "Whatever you feel like. It all goes on the decorations.",
    },
  ],
};
