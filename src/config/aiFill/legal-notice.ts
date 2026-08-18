// ─── legal-notice — AI form-fill schema ──────────────────────────────────────
//
// Editor state: `mf: NoticeData` in
// client/app/(templates)/legal-notice/hooks/useLegalNoticeEditor.ts, declared in
// .../components/types.ts. `recitals: string[]` is addressed as a whole list;
// `demands: Demand[]` is addressed leaf-by-leaf at indices 0–3, which are the
// four entries `DEMO_DATA` always seeds (MAX_DEMANDS is 8, but writing past the
// seeded length would leave holes in the array the paper renders from).
//
// Deliberately NOT addressable: `datedOn` and `complianceDeadline` (the editor
// seeds today and today+7 and they drive a live countdown — a model-written date
// can publish a notice that is already expired), `finePrint` (carries a required
// legal-effect disclaimer appended by dbToLegalNoticeData), `state` (derived),
// and `demands[].grounds` / `.response` / `.complied` (those belong to the
// RECIPIENT, who fills them in when they answer the notice).

import type { AiFillTemplateSchema } from "./types";

export const legalNotice: AiFillTemplateSchema = {
  slug: "legal-notice",
  premise:
    "This is a mock Indian legal notice, served affectionately by one partner on the other: stamp-paper texture, a reference number, a fictional advocate with a chamber address, numbered recitals that all begin with the word 'That', a list of numbered demands, a seven-day compliance period with a live countdown, and an escalation clause. The entire joke is the collision of formal legal register with a completely trivial domestic grievance — so the format must be played absolutely straight while the substance stays small, and the recipient is meant to laugh and tap 'accepted', never to feel actually accused.",
  audience: "partner",
  fields: [
    {
      path: "senderName",
      label: "Sender's name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "First name of the person serving the notice — referred to throughout the document as 'my client'. Just the name as their partner would say it, no honorific or surname.",
      example: "Ananya",
    },
    {
      path: "senderCity",
      label: "Sender's city",
      kind: "text",
      max: 40,
      guide:
        "The city the sender lives in, printed under their name in the notice header. A real city name from the sender's story; if the story never says, leave it empty rather than guessing.",
      example: "Bengaluru",
    },
    {
      path: "addresseeName",
      label: "Addressee's name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "First name of the person the notice is served upon — the one addressed as 'you' throughout. Use the name the sender actually calls them in their story. If the story never names them, leave it empty; a fabricated name on a document this formal reads as an error, not a joke.",
      example: "Rohan",
    },
    {
      path: "addresseeCity",
      label: "Addressee's city",
      kind: "text",
      max: 40,
      guide:
        "The city the notice is being served to, printed in the address block. Often the same as the sender's city; if it is different — a long-distance couple — that gap is worth honouring, since 'long distance' is often the grievance itself. Leave empty if the story does not say.",
      example: "Pune",
    },
    {
      path: "advocateName",
      label: "Advocate's name",
      kind: "text",
      max: 50,
      guide:
        "The name of the entirely fictional advocate who 'issued' this notice, printed in the signature block. Play it completely straight — a plausible Indian advocate's name with initials, exactly as it would appear on a real letterhead. The comedy comes from the deadpan, so do NOT make the name itself a pun.",
      example: "R. K. Sharma",
    },
    {
      path: "advocateChamber",
      label: "Advocate's chamber",
      kind: "text",
      max: 80,
      guide:
        "The chamber address under the advocate's name. This is one of the two places on the whole page where the joke is allowed to peek through the format: a real-sounding chamber line ('Chamber No. 4, ...') where the building name is quietly absurd. Keep it under 70 characters and keep the structure formal — the humour must come from one wrong word in an otherwise correct address, and it must be about romance in general, never about the recipient.",
      example: "Chamber No. 4, Heartbreak Complex, Bengaluru",
    },
    {
      path: "advocateEnrollment",
      label: "Advocate's enrolment no.",
      kind: "text",
      max: 30,
      guide:
        "The advocate's Bar Council enrolment number, in the real Indian format: a state code, a serial, and a year, slash-separated. Play this one entirely straight — it is texture, not a joke, and a silly enrolment number breaks the illusion the whole page depends on.",
      example: "KAR/0447/2023",
    },
    {
      path: "refNo",
      label: "Reference no.",
      kind: "text",
      max: 30,
      guide:
        "The notice's reference number, printed at the top and used to seed the stamp-paper serial. Format 'LN/<year>/<four digits>'. Keep it dry and plausible — no words, no jokes. If the story contains a number that means something to the couple (a date, a floor, an anniversary), using it as the four digits is a nice invisible touch.",
      example: "LN/2026/0447",
    },
    {
      path: "relationshipSince",
      label: "Together since",
      kind: "date",
      guide:
        "The date the relationship began, as ISO YYYY-MM-DD. It is printed as a fact 'not in dispute' in the first recital, so only fill it if the sender's story actually states when they got together — if the story gives only a month and year, use the first of that month; if it gives nothing, leave this empty rather than inventing an anniversary, which is a uniquely bad thing to get wrong.",
      example: "2023-03-14",
    },
    {
      path: "recitals",
      label: "Recitals",
      kind: "list",
      max: 5,
      itemMax: 200,
      required: true,
      guide:
        "The numbered 'WHEREAS' paragraphs that set out the facts. EVERY item must begin with the word 'That' and read as one complete formal sentence ending in a full stop — the editor normalises the opening word, but write it correctly anyway. Use stiff legal register throughout: 'notwithstanding repeated oral demands', 'a fact not in dispute', 'for a period exceeding six hours'. Each recital states ONE petty domestic fact drawn from the sender's story, made funny purely by the seriousness of the phrasing. Numerals are automatically re-rendered as '27 (twenty-seven)', so write plain numerals and let the page do that. Aim for 3 to 5 items, 20 to 35 words each. TONE — this is the field that decides whether the page is funny or cruel: the grievances must stay SMALL. Being left on read, a hoodie never returned, 'whatever you want' as an answer, a phone at dinner. Default hard to the trivial. Never draft a recital about infidelity, dishonesty, cruelty, or anything the recipient would actually feel ashamed of, even if the sender's story mentions it — a mock notice about a real wound is not a joke, and this template simply cannot hold one. If the story contains only serious material, keep the recitals to affectionate trivia and say nothing about the real thing.",
      example:
        "That you have, on 27 occasions, responded to a direct question with the words \"whatever you want\", to the detriment of my client.",
    },
    {
      path: "demands[0].text",
      label: "Demand 1",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The first numbered demand — the things the addressee is called upon to do. HARD LIMIT 60 characters (the editor truncates at 60). Write it as a clipped clause, not a sentence: no leading 'That', no trailing full stop, lowercase start is fine. Legal-flavoured verbs land best — 'return of', 'cease and desist from', 'produce'. Each demand is something the recipient can cheerfully tap 'accepted' on, so keep it small and doable. Never demand an apology for something real, an explanation, or a change of feeling.",
      example: "return of hoodie (grey, mine, since March)",
    },
    {
      path: "demands[1].text",
      label: "Demand 2",
      kind: "text",
      max: 60,
      guide:
        "The second numbered demand. Under 60 characters, same clipped register, and a different flavour from the first — if demand 1 was the return of an object, make this one about conduct or attention. Draw the specifics from the sender's story; a demand naming the actual habit is far funnier than a generic one.",
      example: "reply within 30 minutes or state reasons in writing",
    },
    {
      path: "demands[2].text",
      label: "Demand 3",
      kind: "text",
      max: 60,
      guide:
        "The third numbered demand. Under 60 characters. Good slot for the 'cease and desist' construction applied to something microscopically petty — a phrase they always say, a habit at dinner. The offence being tiny is the entire joke; escalating it defeats the page.",
      example: "cease and desist from saying \"whatever you want\"",
    },
    {
      path: "demands[3].text",
      label: "Demand 4",
      kind: "text",
      max: 60,
      guide:
        "The fourth and last numbered demand. Under 60 characters. End on the one that is openly affectionate underneath the legal wording — a date, time together, something the sender actually wants. Phrase it in the same clipped, numbered style so the format never breaks.",
      example: "one (1) date, planned by you, not me",
    },
    {
      path: "escalationClause",
      label: "Escalation clause",
      kind: "longtext",
      max: 400,
      guide:
        "The single paragraph stating what happens if the addressee does not comply within the seven-day period. It must begin with 'That' and run as one long formal sentence, ~35 to 55 words, in full legal cadence: 'in the event of your failure to comply within the stipulated period, my client shall be constrained to...'. The threat itself is the punchline and must be comically harmless and domestic — escalation to their mother, to the group chat, to the building's WhatsApp group. It must NEVER threaten anything the recipient would genuinely dread: no threat about the relationship ending, no real consequence, no ultimatum. If the joke would not survive the recipient reading it out loud to the person being escalated to, it is the wrong joke.",
      example:
        "That in the event of your failure to comply within the stipulated period, my client shall be constrained to escalate this matter to your mother, without further notice, and you shall be responsible for all consequences arising therefrom.",
    },
  ],
};
