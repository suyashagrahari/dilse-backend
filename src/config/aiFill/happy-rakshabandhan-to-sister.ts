// ─── AI fill — happy-rakshabandhan-to-sister ─────────────────────────────────
//
// Paths address `mf: SisterData` in
// client/app/(templates)/happy-rakshabandhan-to-sister/hooks/useSisterEditor.ts
// (`useState<SisterData>({ ...SAMPLE })`), declared in
// client/app/(templates)/happy-rakshabandhan-to-sister/components/types.ts.
//
// This is the mirror of `raksha-bandhan.ts`, and the mirroring is not cosmetic.
// There a sister writes and her brother performs the ritual; here a BROTHER
// writes, and the acts the page hands his sister are the ones that are actually
// hers on the day — she picks a rakhi, she ties it, she opens the lifafa. So the
// model is writing HIS half only: the greeting, the vow, both sides of the
// statement of account, the note in the envelope, and the letter she reads last.
//
// ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
//
//   photoUrl, memories[].imageUrl
//       Media. Never declared — rule 1 of the frozen contract — and
//       `assertNoMediaPaths` would refuse them at boot anyway.
//
//   memories[n].caption / .year
//       A memory is a photograph WITH a caption; the caption alone is not a
//       thing this template can render. The fill runs before he has uploaded
//       anything, so a declared caption path would have `applyPatch` create
//       `memories[0] = { caption: "…" }` with no image, and `sisterDataToBody`
//       would then drop the whole row on publish — a field the model filled,
//       the form showed as filled, and the page silently discarded. The
//       captions stay his, written next to the picture they belong to.
//
//   sisterIsElder
//       A toggle, and the one field on this template whose wrong value is
//       visible in the largest text on the screen: it decides whether the page
//       calls her Didi or Behna, and there is no neutral third word. Birth
//       order is almost never stated in the paragraph someone types about their
//       sister, so the model would be guessing between two options that are
//       both confidently renderable — the exact shape of error nobody catches
//       in a preview. The form defaults it to elder and asks him with one tap.
//
//       Because the model cannot know it, no generated line may contain a
//       birth-order word either — the template prints that word itself, in the
//       largest type on the page, and a contradicting one inside his own vow is
//       the most visible error this template can make. The `greeting` and `vow`
//       guides therefore hand the model an ALLOW-LIST for how to address her
//       ('you', or her name) rather than a list of words to avoid. That is
//       deliberate and is the third scar from the brother schema: its pendant
//       guide once ended "…rather than a generic word like 'sister'" and the
//       model returned exactly "sister". Naming the word you do not want raises
//       its probability, so the rule here is stated only positively.
//
//   lifafa.amount
//       Money. What he has decided to give, and nobody else's business to
//       suggest.
//
//       There is no `lifafa.upiId` on this template to exclude any more, and no
//       `lifafa.qrImageUrl` either: the field was deleted outright rather than
//       merely withheld from the model. A UPI QR encodes a PAYEE, and here the
//       brother is the one GIVING, so his handle on her page pointed the payment
//       rail backwards. See the `Lifafa` interface in the client's
//       `components/types.ts`.
//
//   reply, rakhiPicked
//       HERS, and write-once. They arrive through the public share route after
//       she has read the page; the builder cannot set them either. Handing them
//       to the model would open the page with her answer already written,
//       before she has seen a word of it.
//
//   festivalDate
//       A fact with a calendar answer, not a written one. It drives a live
//       countdown, so a hallucinated date does not read as a wrong date — it
//       reads as a broken clock.
//
//   city (see `raksha-bandhan.ts` for the full post-mortem)
//       Not offered on either schema. It was on the brother template, printed
//       right after the sender's own name, and was wrong three times out of
//       three against the live model — every test story named somebody else's
//       city and the model reached for the only city in the text. Rewriting the
//       guide did not fix it. This template does not print a city at all, and
//       it is named here so nobody adds one back thinking it was an oversight.
//
// ── ON `audience` ────────────────────────────────────────────────────────────
//
// The union is frozen at partner | bestfriend | friend, and a sister is none of
// them. `bestfriend` is the closest REGISTER — warm, loyal, funny, explicitly
// never romantic, which is the one thing that absolutely must not slip on a page
// a brother sends his sister.
//
// It leaks one wrong word: `renderPeople` introduces a non-partner recipient as
// "their friend". So the premise below states the sibling relationship outright
// and tells the model what to call her. The premise renders ABOVE the audience
// brief in the system prompt, and a stated relationship beats an inferred one.

import type { AiFillTemplateSchema } from "./types";

export const rakshaBandhanSister: AiFillTemplateSchema = {
  slug: "happy-rakshabandhan-to-sister",
  premise:
    "This is a Raksha Bandhan page a BROTHER is making for his SISTER — they are siblings, and that is the only relationship in play. Whatever the surrounding context calls her, she is his sister: call her his sister, his behna or his didi, never his friend and never, under any circumstance, anything romantic. On this festival the sister ties a thread on her brother's wrist and he promises to look after her and gives her shagun — money, in a small envelope called a lifafa. So the page hands her the parts that are hers: it opens on her name and his greeting, she chooses a rakhi and presses and holds to wind it around his wrist until it is tied, then his promise appears as a signed certificate, then a two-sided statement of account — a short petty list of what she owes him, and then a longer flat list of what he owes her, which cannot be settled — then the lifafa she tears open, then old photographs, and last his letter, which she answers once. You are writing HIS words for all of that: funny first and tender second, the way an Indian brother actually talks to his sister — the borrowed hoodie that never came back, the tattling to Mummy, the last piece of mithai — with Hinglish left in wherever it is how he would really say it. Never greeting-card, never 'you are the light of my life', and never a single line he would be embarrassed to have said out loud. EVERY line you write is spoken BY THE BROTHER, TO HIS SISTER: he is 'I' and she is 'you', in every field, without exception. In Hindi and Hinglish the verb must agree with whoever is actually doing the thing. On this festival the SISTER ties the rakhi onto her BROTHER'S wrist: she is always the one tying, and he is always the one holding out his wrist and receiving it. So any line about the tying has HER doing it and HIM waiting — 'tu baandhegi', 'main haath aage kar raha hoon'. Getting this backwards does not read as a grammar slip; it describes the wrong ritual, in the largest text on the page.",
  audience: "bestfriend",
  fields: [
    {
      path: "brotherName",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The sender's own name — the brother writing this. It is signed at the bottom of the vow certificate, so it should read the way he signs himself to her: the short form, or 'Bhai' if that is genuinely what she calls him. One or two words, never a full formal name he would not use with his own sister.",
      example: "Kabir",
    },
    {
      path: "sisterName",
      label: "Your sister's name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The sister's name as her brother actually says it — the short form or the household nickname if the story uses one, never a full formal name he would never say out loud. It is set in the largest type on the opening screen. One or two words.",
      example: "Ananya",
    },
    {
      path: "greeting",
      label: "What you want to say first",
      kind: "list",
      max: 3,
      itemMax: 90,
      required: true,
      guide:
        "The lines on the opening screen, revealed one after another beside a photo of the two of them. Write exactly 3. Each is ONE short sentence under 90 characters that stands on its own, and together they should land like something said out loud rather than written in a card — start from a specific true thing between them (a fight over food, a thing she borrowed and kept, the 1am phone calls), and let the last line be the one that hands the thread over to her. Sibling register: dry, teasing, affection underneath and never stated. Inside the lines, address her as 'you' or by her name and nothing else — the page supplies the relationship word itself, from a setting the sender picks, and you are not told whether she is the elder or the younger one. No greeting, no sign-off, no 'Dear', no line numbers, no bullets, no emoji.",
      example: "You still call me at 1am about nothing.",
    },
    {
      path: "vow",
      label: "Your promise to her",
      kind: "list",
      max: 4,
      itemMax: 100,
      required: true,
      guide:
        "The vow — the 'raksha' in Raksha Bandhan, printed as a signed certificate she can keep and download. Write exactly 4 lines, each ONE sentence under 100 characters. This is the only part of the page with no joke in it, and the way to keep it from turning into a greeting card is to promise SPECIFIC, small, checkable things rather than large feelings: picking up the phone at any hour, showing up in whatever city she is in, handling the person who upset her, coming home for this. Plain declarative sentences, present or future tense, first person. Hinglish is welcome in the last line if that is where the sender's real voice is ('Ghar aaunga. Har baar.'). Where you would reach for a large abstract word, write the concrete act it was standing in for instead — the phone answered, the flight taken, the name he will have a word with. One hard constraint: you are not told whether she is his older or his younger sister, and every line must read correctly either way — so inside these lines address her as 'you', or by her name, and nothing else. The template prints the right relationship word itself, in its own type, from a setting the sender chooses.",
      example: "Whatever it is, call me first. I will pretend I was awake.",
    },
    {
      path: "vowSince",
      label: "Promised since",
      kind: "text",
      max: 60,
      guide:
        "The short line stamped on the certificate's seal, directly under the vow, saying how long this has been true. It is a fragment and not a sentence, and it begins with the word 'since': either a year the story actually gives you, or the moment it stands in for. Lower case, under 60 characters, no full stop. If the story fixes nothing in time, return null — the seal reads correctly with no date on it.",
      // The example here used to be SAMPLE.vowSince, word for word. Harmless in
      // itself, but it made a leak indistinguishable from an untouched default:
      // the form would show the field as AI-filled while displaying the exact
      // string it had opened with, and nobody could tell which had happened.
      example: "since that first hostel drop-off",
    },

    // ── The statement of account ──────────────────────────────────────────────
    //
    // Ten fields, as indexed label/value pairs rather than two `list` fields,
    // because each row is a label AND a figure that have to make sense together
    // — "hoodies never returned" next to "9". A list would hand back five
    // strings and there would be no honest way to split them into the two
    // columns the screen prints.
    //
    // The value column is text, not number, on purpose: "too many", "all of
    // them" and "you called anyway" are the best entries on this screen and none
    // of them is a number.
    //
    // ── THE TWO COLUMNS ARE NOT THE SAME BRIEF, AND THAT IS THE WHOLE SCREEN ──
    //
    // `sheOwes` (2 rows) is petty, physical and funny. `heOwes` (3 rows) is what
    // she actually did for him, stated flat, with the joke removed. The screen
    // reveals hers first and his after a beat, so the laugh lands before the
    // reversal does — and by the third line of his column the balance is plainly
    // unpayable, which is what earns the shagun envelope on the next screen.
    //
    // The default failure mode is the model writing five funny rows, because
    // that is what the first column taught it to do and a punchline is always
    // the easier sentence. A funny `heOwes` row does not merely weaken the
    // screen, it destroys it: the reversal is the only thing the device does. So
    // every guide on the right-hand column says so in its own words rather than
    // relying on the section comment the model never sees.
    //
    // The asymmetry (2 vs 3) is deliberate and is not to be balanced. Equal
    // columns read as a scorecard, and a scorecard is the one reading of this
    // screen that would be unkind.
    {
      path: "account.sheOwes[0].label",
      label: "What she owes — row 1",
      kind: "text",
      max: 44,
      required: true,
      guide:
        "The first line of the left-hand column of a mock statement of account, printed as a row of dots between the item and its figure. This column is the petty one: small, physical, specific things she has been taking off her brother for years, phrased the way an accountant would write them if the accounts were kept by an irritated older brother. Lower case, under 44 characters. It has to be something she reads and instantly recognises — the borrowed-and-never-returned category, the tattling category, the last-piece-of-food category — and nothing that would actually sting. Never a real criticism of who she is; the whole column has to be safe enough that she is laughing when the other column arrives.",
      example: "hoodies never returned",
    },
    {
      path: "account.sheOwes[0].value",
      label: "What she owes — row 1 figure",
      kind: "text",
      max: 18,
      required: true,
      guide:
        "The figure in the right of the first column for row 1. Usually an absurdly precise number, high enough to be funny — the joke is that somebody has been keeping this tally for years — or a short phrase where that lands better ('too many', 'beyond counting'). Keep any number at 2 or above, or use words instead: a figure of one is not a running tally and reads as a field nobody filled in. Under 18 characters, no currency symbols unless the row is literally about money.",
      example: "9",
    },
    // ── EVERY ROW AFTER THE FIRST CARRIES NO `example`, DELIBERATELY ──────────
    //
    // The brother schema shipped examples on all four of its ledger rows and got
    // them back as the answer: a story with material for about three grievances
    // produced rows that were my example strings, verbatim, for a family they
    // had nothing to do with. The system prompt already says never to reuse an
    // example's words — that holds while the model has its own material and
    // breaks the moment it runs out, because the nearest phrasing to hand is
    // then the example itself.
    //
    // This schema asks for five rows, which is one more chance to run out. So
    // every row below says what belongs in it and shows nothing, and each is
    // explicitly allowed to come back empty. Four true rows beat five where one
    // is someone else's memory.
    {
      path: "account.sheOwes[1].label",
      label: "What she owes — row 2",
      kind: "text",
      max: 44,
      guide:
        "The second and last line of the petty column: a DIFFERENT item from row 1, taken from its own moment in the story rather than rephrased from the first. If row 1 was an object she borrowed and kept, make this one something she did — telling on him, answering his phone, the charger that never came back. Lower case, under 44 characters. If the story genuinely only supports one item, return null and leave it empty: an invented grievance is the one line she will read and not recognise, and this column only works while every entry is true.",
    },
    {
      path: "account.sheOwes[1].value",
      label: "What she owes — row 2 figure",
      kind: "text",
      max: 18,
      guide:
        "The figure for row 2 of the petty column. A precise-sounding count, or a short phrase where a number would be less funny. Under 18 characters. Keep any number at 2 or above — a figure of one reads as a placeholder rather than a tally. Return null if row 2 is empty.",
    },
    {
      path: "account.heOwes[0].label",
      label: "What he owes — row 1",
      kind: "text",
      max: 44,
      required: true,
      guide:
        "The first line of the SECOND column, and the register changes completely here. This column is what SHE did for HIM, and it is not funny — not once, not in a single row. It arrives after the reader has laughed at the first column, and the whole screen exists so that this side stops the laugh: the times she covered for him, the nights she waited up, the things she never told anyone. State it flat and short, in the same lower-case ledger phrasing as the other column, under 44 characters, with no adjective doing the work and no twist at the end. If it could be read as a joke, it is the wrong line. Take it from the plainest true thing the story gives you about what she did.",
    },
    {
      path: "account.heOwes[0].value",
      label: "What he owes — row 1 figure",
      kind: "text",
      max: 18,
      required: true,
      guide:
        "The figure for row 1 of the second column. This side of the statement cannot be counted, and that is its point, so the figure is almost always words rather than a number — the flat, total kind: 'every single one', 'all of them'. Under 18 characters. Keep it deadpan; a figure that reaches for a laugh here undoes the column. Any number is at 2 or above or written as words: a bare '1' reads as an unfilled field. Return null rather than inventing a number.",
    },
    {
      path: "account.heOwes[1].label",
      label: "What he owes — row 2",
      kind: "text",
      max: 44,
      guide:
        "Second line of what she did for him. A different kind of thing from row 1, and still with no joke in it: where row 1 was something she did repeatedly, let this one be a single occasion the story actually names — an exam she sat outside, a hospital she waited at, a fight she took his side in. Lower case, under 44 characters, flat. Name the thing she actually did, at the size she actually did it: do not shrink it into a smaller, more manageable version of itself. A sister who delayed her own wedding by two years is not 'helped with the wedding', and turning it into that throws away the strongest fact you were given. If the sentence you are compressing will not fit in 44 characters at full size, choose a different row rather than a diminished one. Return null if the story does not give you such a moment; two true lines in this column are worth more than three where one is guessed.",
    },
    {
      path: "account.heOwes[1].value",
      label: "What he owes — row 2 figure",
      kind: "text",
      max: 18,
      guide:
        "The figure for row 2 of the second column. Words, or an exact number the story actually states. Under 18 characters, deadpan, no punchline. Any number here is at 2 or above, or written as words instead — a figure of one is not a tally and reads as a field nobody filled in. Return null if row 2 is empty.",
    },
    {
      path: "account.heOwes[2].label",
      label: "What he owes — row 3",
      kind: "text",
      max: 44,
      guide:
        "The last line of the statement, and the one the screen closes on — so it is the quietest, not the biggest. What she did that he has never acknowledged out loud: the year he was unreachable, the thing she carried on her own, the secret she kept. Lower case, under 44 characters. It is not a summary and not a thank-you, just one more entry in the same flat hand as the two above it. Return null unless the rows above are filled from real material and the story genuinely gives you this; a statement of two lines on this side already lands.",
    },
    {
      path: "account.heOwes[2].value",
      label: "What he owes — row 3 figure",
      kind: "text",
      max: 18,
      guide:
        "The closing figure of the statement. Words, short, and flat enough to end on — the reader should reach it and stop. Under 18 characters. Any number is at 2 or above or written as words; a bare '1' reads as an unfilled field. Return null if row 3 is empty.",
    },

    {
      path: "lifafa.note",
      label: "A line with the shagun",
      kind: "text",
      max: 120,
      guide:
        "The one line printed inside the lifafa — the envelope of money a brother traditionally gives his sister on this day — which she tears open on her screen. It is his voice handing it over, so it should be brisk and a little gruff rather than generous-sounding: a brother giving shagun does not make a speech about it, he tells her to take it and stop arguing, or tells her exactly what to spend it on. One short sentence, under 120 characters. Hinglish welcome. Never anything that reads as a transaction, a total or a favour being done. If the story gives no material for it, return null; the envelope reads fine as sweets and a blessing.",
      example: "Shagun. Do not argue.",
    },
    {
      path: "letter",
      label: "Your letter",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "The letter on the last screen — the final thing she reads before she writes back, and the one place on this page where the joking is allowed to stop. Three to five sentences, 400-700 characters, one paragraph, no salutation and no sign-off (the page already carries both names). The shape that works: open on one small specific memory of her that he has clearly never mentioned out loud, admit in the next sentence what he was actually feeling at the time and pretended not to be, then end by handing the ritual back to her — she ties the thread, he holds up his wrist. Do not summarise the relationship, do not list her virtues, do not thank her for being his sister. One true detail she thought he had forgotten is worth more than every adjective available.",
      // NO `example` HERE, AND THIS IS THE FIELD WHERE IT MATTERS MOST.
      //
      // The value of an example is that it pins register in a field where the
      // guide cannot. The cost is that examples leak verbatim — proven twice on
      // the brother schema — and this one would leak into the single largest
      // block of prose on the page, signed with a real person's name, claiming
      // a childhood memory that belongs to nobody. The guide above already
      // specifies the shape sentence by sentence, which is the safer half of
      // what an example was doing.
    },
  ],
};
