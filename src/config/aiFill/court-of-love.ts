import type { AiFillTemplateSchema } from "./types";

/**
 * Court of Love — AI form-fill schema.
 *
 * This template already has a bespoke story→case-file service
 * (`services/courtOfLoveAi.service.ts`). This schema deliberately describes the
 * SAME leaves that service writes, so a page built through the generic fill and
 * a page built through "generate from story" come out shaped the same way.
 *
 * Deliberately NOT declared, and why:
 *  - `plaintiffName` / `accusedName` / `signatureName` — names the sender types.
 *  - `language` — reported by the fill result, not written as a field.
 *  - `questions[i].exhibit` — the demo labels ("Exhibit A" … "Final
 *    Cross-Examination") are correct for any couple, and spending four of the
 *    twenty slots re-inventing them buys nothing.
 *  - `questions[i].allCorrect` — the seeded pattern (false ×4, true on the
 *    last) is already the right one; letting the model move it turns a factual
 *    hearing into a freebie.
 *  - `questions[4]` — the final cross-examination is universal by design
 *    ("how much does the plaintiff love you?", every answer correct), so it is
 *    left alone and the budget goes to the four hearings that must be theirs.
 *  - `questions[i].wrongNote` — the last thing cut to stay inside twenty
 *    fields; the seeded lines are forgiving and mostly generic.
 */
export const courtOfLove: AiFillTemplateSchema = {
  slug: "court-of-love",
  premise:
    "The sender has filed a mock lawsuit against the person they love, and the page is the trial: a rom-com courtroom where the recipient is 'the accused', swears an oath, then sits through five 'hearings' — quiz questions about the two of them. A winning verdict unseals a love letter and prints the recipient a certificate, so the whole trial exists only as an excuse to say the thing in the letter.",
  audience: "partner",
  fields: [
    {
      path: "headline",
      label: "Summons headline",
      kind: "text",
      max: 100,
      guide:
        "The summons banner on the very first screen, addressed straight to the recipient, telling them they have been called to the Court of Love. One line of mock-legal English that lands as affectionate rather than clever — formal wording, warm intent, under 100 characters. Do not state a charge here: what the accused is supposedly guilty of is the joke of the hearings, and the summons only opens the door.",
      example: "You have been summoned. Attendance is compulsory (it is not, but please).",
    },
    {
      path: "oathText",
      label: "The oath",
      kind: "longtext",
      max: 240,
      guide:
        "The oath the accused swears before the trial begins, written as one or two sentences of courtroom language bent into affection, and ending as a question they can answer yes to — 'Do you swear to…'. Under 240 characters. Silly rather than solemn. The most it may ask them to admit to is something small and embarrassing; never ask them to swear about anything they could actually feel bad about.",
      example: "Do you swear to answer honestly, including the parts you would rather not say out loud?",
    },

    // ── Hearing 1 — Exhibit A: the origin ────────────────────────────────────
    {
      path: "questions[0].question",
      label: "Hearing 1 — the question",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "The first hearing, printed under the label 'Exhibit A'. Ask one factual question about how the two of them began — where they met, who spoke first, the place they keep going back to — taken straight out of the sender's story. Phrase it as the court would, in the third person: 'Where did the accused first…'. Under 200 characters. It is a quiz about their shared history, never a test of whether the recipient is a good enough partner.",
    },
    {
      path: "questions[0].options",
      label: "Hearing 1 — the four answers",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "Exactly four answers to hearing one, rendered as four buttons. All four must be plausible enough that the true one is not obvious; the three wrong ones should be near-misses from the couple's own life — funny, affectionate, never absurd. One short phrase each, well under 90 characters so nothing wraps off a button.",
    },
    {
      path: "questions[0].correctIndex",
      label: "Hearing 1 — which answer is true",
      kind: "number",
      required: true,
      guide:
        "The 0-based position (0, 1, 2 or 3) of the option you wrote as the true one. This must agree with the options you just wrote — get it wrong and the page tells the recipient they were wrong when they were right, which is the one bug that ruins the gift. Vary which position is correct across the four hearings.",
    },
    {
      path: "questions[0].correctNote",
      label: "Hearing 1 — line on a right answer",
      kind: "text",
      max: 120,
      guide:
        "The one line the court says the instant they get hearing one right, written across the reaction screen in handwriting. Under 120 characters, warm, and specific — it should tell them something true about that memory rather than just saying 'correct'.",
    },

    // ── Hearing 2 — Exhibit B: the small habit ───────────────────────────────
    {
      path: "questions[1].question",
      label: "Hearing 2 — the question",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "The second hearing, labelled 'Exhibit B'. Put a tiny, harmless habit on the record — a catchphrase, an excuse, the thing one of them always says. Under 200 characters. Steer hard to the small stuff (never replies to texts, always says 'five minutes', steals the blanket); if the sender's story contains an actual grievance, do not use it. Nothing here may name something that could genuinely hurt to read.",
    },
    {
      path: "questions[1].options",
      label: "Hearing 2 — the four answers",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "Four candidate habits or catchphrases, one of them the real one. All four should be things a person would happily admit to. Keep each to a short phrase under 90 characters, and if the sender's story quotes them directly, quote it back.",
    },
    {
      path: "questions[1].correctIndex",
      label: "Hearing 2 — which answer is true",
      kind: "number",
      required: true,
      guide:
        "0-based index (0–3) of the true option for hearing two. It must point at the option you actually wrote as true, and it should not land on the same position you used for hearing one.",
    },
    {
      path: "questions[1].correctNote",
      label: "Hearing 2 — line on a right answer",
      kind: "text",
      max: 120,
      guide:
        "One line shown when they get hearing two right. Under 120 characters. Tease gently and then let them off — the court is on their side, and the sender is the one who filed a whole lawsuit over a catchphrase.",
    },

    // ── Hearing 3 — Exhibit C: the ritual ────────────────────────────────────
    {
      path: "questions[2].question",
      label: "Hearing 3 — the question",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "The third hearing, labelled 'Exhibit C'. Ask about one small ritual the two of them have — the order that never changes, the song, the walk, the thing they do every Sunday. Under 200 characters, in the court's third person. Concrete detail from the sender's story beats anything invented.",
    },
    {
      path: "questions[2].options",
      label: "Hearing 3 — the four answers",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "Four versions of that ritual, one true. The wrong three should be things the couple plausibly also do, so the choice is genuinely hard. Short phrases, under 90 characters each.",
    },
    {
      path: "questions[2].correctIndex",
      label: "Hearing 3 — which answer is true",
      kind: "number",
      required: true,
      guide:
        "0-based index (0–3) of the true option for hearing three, agreeing exactly with the options you wrote. Keep varying the position across hearings so the pattern is not guessable.",
    },
    {
      path: "questions[2].correctNote",
      label: "Hearing 3 — line on a right answer",
      kind: "text",
      max: 120,
      guide:
        "One line for a right answer on hearing three. Under 120 characters. This is the point in the trial to be plainly fond rather than funny.",
    },

    // ── Hearing 4 — Exhibit D: the trial turns on the plaintiff ──────────────
    {
      path: "questions[3].question",
      label: "Hearing 4 — the question",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "The fourth hearing, labelled 'Exhibit D', and the one where the trial quietly turns around: ask which of the SENDER'S own habits the accused secretly adores. The joke must sit on the sender here — their singing, their terrible driving, the fourteen voice notes. Under 200 characters. By the end of this hearing the recipient should realise they were never the one on trial.",
    },
    {
      path: "questions[3].options",
      label: "Hearing 4 — the four answers",
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        "Four of the sender's own small, lovable failings, one of them the one the story actually points at. Every option should be something the sender is happy to be caught doing. Short phrases, under 90 characters each.",
    },
    {
      path: "questions[3].correctIndex",
      label: "Hearing 4 — which answer is true",
      kind: "number",
      required: true,
      guide:
        "0-based index (0–3) of the true option for hearing four, matching the options you wrote.",
    },
    {
      path: "questions[3].correctNote",
      label: "Hearing 4 — line on a right answer",
      kind: "text",
      max: 120,
      guide:
        "One line for a right answer on hearing four. Under 120 characters. The court concedes something on the plaintiff's behalf — this is the sender admitting, in public, that they are the ridiculous one.",
    },

    // ── The payoff ───────────────────────────────────────────────────────────
    {
      path: "certificateTitle",
      label: "Certificate title",
      kind: "text",
      max: 60,
      guide:
        "The title printed across the certificate the recipient is awarded when the verdict goes their way — the local equivalent of 'Certified Best Partner'. An award title, under 60 characters, in the register of an official honour that is obviously not one. It is printed in large type on a stamp-paper certificate, so short beats clever.",
    },
    {
      path: "secretLetter",
      label: "The sealed letter",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The love letter that unseals the moment the verdict comes in — the real reason this page exists, and the one place the courtroom joke is dropped entirely. Four to seven sentences in the sender's plain voice, built from the specifics of their story rather than from generic romance. No markdown, no 'Dear ―', no sign-off: the sender's name is already printed beneath it. End on something said out loud rather than something performed, and never turn the trial into a score the recipient owes.",
    },
  ],
};
