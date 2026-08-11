import type { AiFillTemplateSchema, AiFillField } from "./types";

/**
 * Court of Love — AI form-fill schema.
 *
 * This template already has a bespoke story→case-file service
 * (`services/courtOfLoveAi.service.ts`). This schema deliberately describes the
 * SAME leaves that service writes, so a page built through the generic fill and
 * a page built through "generate from story" come out shaped the same way.
 *
 * ── THE QUESTIONS ARE ASKED IN PLAIN ENGLISH ─────────────────────────────────
 *
 * These guides used to instruct the model to write in courtroom English and in
 * the third person — "Phrase it as the court would: 'Where did the accused
 * first…'". That produced questions like "The Court presents the accused's
 * most-used excuse. Identify it.", which is a fine joke for anyone who knows
 * what a plaintiff is, and a wall for everyone else. These pages get sent to
 * people who did not choose the theme and mostly are not reading in their first
 * language.
 *
 * So every question is now written the way the sender would ask it out loud, in
 * the first and second person: "What do you always say when you're running
 * late?" The courtroom survives where it is decoration and the reader can skip
 * it — the summons, the verdict, the certificate — and is gone from everything
 * they have to parse in order to answer.
 *
 * ── EIGHT BESPOKE QUESTIONS, TWO SEEDED ──────────────────────────────────────
 *
 * The quiz is ten questions. Eight are generated here; the last two keep their
 * seeded text because they are already true of any couple — "where do we always
 * say we'll go one day" and the closing "how much do I love you", where every
 * answer scores. Spending model budget re-inventing those buys nothing.
 *
 * Eight questions × 4 fields + 4 top-level fields = 36, inside the 40-field
 * ceiling in FILL_LIMITS with room to spare. Adding a ninth would sit exactly on
 * the ceiling, which the limit's own comment warns is where a single model call
 * stops being reliable.
 *
 * Deliberately NOT declared, and why:
 *  - `plaintiffName` / `accusedName` / `signatureName` — names the sender types.
 *  - `language` — reported by the fill result, not written as a field.
 *  - `questions[i].exhibit` — the seeded topic labels ("How we met", "Your
 *    excuses") already match the themes below, one for one.
 *  - `questions[i].allCorrect` — the seeded pattern (false ×9, true on the
 *    last) is the right one; letting the model move it turns a real question
 *    into a freebie.
 *  - `questions[i].wrongNote` — the seeded lines are forgiving and mostly
 *    generic, which is exactly what a wrong answer needs.
 */

/**
 * What each generated question is about. The order matches the seeded questions
 * in the client's DEMO_DATA, so a generated case file and the demo read as the
 * same quiz with different answers.
 */
const TOPICS: { topic: string; ask: string; note: string }[] = [
  {
    topic: "how they met",
    ask: "Ask one plain question about how the two of them began — where they met, who spoke first, the place they keep going back to — taken straight out of the sender's story.",
    note: "It should tell them something true about that first meeting rather than just saying 'correct'.",
  },
  {
    topic: "a small habit or catchphrase",
    ask: "Put one tiny, harmless habit on the record — a catchphrase, an excuse, the thing they always say. Steer hard to the small stuff (never replies to texts, always says 'five minutes', steals the blanket). If the sender's story contains an actual grievance, do not use it: nothing here may name something that could genuinely hurt to read.",
    note: "Warm and teasing, never a complaint.",
  },
  {
    topic: "food",
    ask: "Ask what the sender always orders, always steals, or always claims they do not want and then eats. Food is the safest, funniest thing two people know about each other.",
    note: "The sender admitting, cheerfully, to being the ridiculous one.",
  },
  {
    topic: "a habit of the sender's the recipient secretly likes",
    ask: "Turn it around: ask which of the SENDER's own habits the recipient secretly likes. This one is the sender volunteering their own silliness, so it must be affectionate about the sender, not the recipient.",
    note: "The sender conceding the point, in public.",
  },
  {
    topic: "how the sender shows they are missing them",
    ask: "Ask how the recipient can tell the sender is missing them — the unprompted photo, the 'busy?' text, the reel sent at midnight. Small, specific, and drawn from the story.",
    note: "Name the tell, and admit it is a tell.",
  },
  {
    topic: "what they argue about",
    ask: "Ask what the two of them argue about most, keeping it firmly in the harmless register — where to eat, who texted first, whose turn it is to choose. Never a real conflict, and never anything the sender's story frames as painful.",
    note: "Fond, and slightly resigned.",
  },
  {
    topic: "the small thing that makes the sender happiest",
    ask: "Ask what the recipient does that makes the sender smile fastest. This is the softest question in the quiz — it should read as a compliment the recipient did not know they had earned.",
    note: "Say the specific thing, plainly.",
  },
  {
    topic: "a song, a film, or a shared reference",
    ask: "Ask which song, film or running joke belongs to the two of them, using whatever the sender's story actually mentions. If the story names none, ask about the thing they always end up watching or playing again.",
    note: "Warm and specific to that reference.",
  },
];

/** The four fields that make up one generated question. */
function questionFields(index: number, spec: (typeof TOPICS)[number]): AiFillField[] {
  const n = index + 1;
  return [
    {
      path: `questions[${index}].question`,
      label: `Question ${n} — ${spec.topic}`,
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        `Question ${n} of ten, on the topic of ${spec.topic}. ${spec.ask} ` +
        "Write it in PLAIN, SIMPLE ENGLISH, the way the sender would ask it out loud — first and second person, 'I' and 'you' and 'we', short everyday words. No legal or courtroom wording anywhere: no 'the accused', no 'the plaintiff', no 'the Court', no 'hereby'. Under 200 characters, and short is better than clever. It is a quiz about their shared history, never a test of whether the recipient is a good enough partner.",
    },
    {
      path: `questions[${index}].options`,
      label: `Question ${n} — the four answers`,
      kind: "list",
      max: 4,
      itemMax: 90,
      required: true,
      guide:
        `Exactly four answers to question ${n}, rendered as four buttons. All four must be plausible enough that the true one is not obvious; the three wrong ones should be near-misses from the couple's own life — funny, affectionate, never absurd. Same plain, spoken English as the question. One short phrase each, well under 90 characters so nothing wraps off a button.`,
    },
    {
      path: `questions[${index}].correctIndex`,
      label: `Question ${n} — which answer is true`,
      kind: "number",
      required: true,
      guide:
        `The 0-based position (0, 1, 2 or 3) of the option you wrote as the true one for question ${n}. This must agree with the options you just wrote — get it wrong and the page tells the recipient they were wrong when they were right, which is the one bug that ruins the gift. Vary which position is correct across the eight questions; do not settle into a pattern.`,
    },
    {
      path: `questions[${index}].correctNote`,
      label: `Question ${n} — line on a right answer`,
      kind: "text",
      max: 120,
      guide:
        `The one line shown the instant they get question ${n} right, written across the reaction screen in handwriting. Under 120 characters, warm, specific, and in the same plain spoken voice. ${spec.note}`,
    },
  ];
}

export const courtOfLove: AiFillTemplateSchema = {
  slug: "court-of-love",
  premise:
    "The sender has filed a mock lawsuit against the person they love, and the page is the trial: a rom-com courtroom where the recipient swears a silly oath, then answers ten plain questions about the two of them. A winning verdict unseals a love letter and prints the recipient a certificate, so the whole trial exists only as an excuse to say the thing in the letter. The courtroom is the wrapping paper — the questions themselves are asked in ordinary, spoken English.",
  audience: "partner",
  fields: [
    {
      path: "headline",
      label: "Summons headline",
      kind: "text",
      max: 100,
      guide:
        "The summons banner on the very first screen, addressed straight to the recipient, telling them they have been called to the Court of Love. This is the one place the mock-legal register belongs, because it is decoration and nobody has to answer it — but keep it to words in ordinary use, and land it as affectionate rather than clever. Under 100 characters. Do not state a charge: what they are supposedly guilty of is the joke of the questions, and the summons only opens the door.",
      example: "You have been summoned. Attendance is compulsory (it is not, but please).",
    },
    {
      path: "oathText",
      label: "The oath",
      kind: "longtext",
      max: 240,
      guide:
        "The oath they swear before the quiz begins, ending as a question they can answer yes to — 'Do you swear to…'. One or two sentences, silly rather than solemn, in plain words. Under 240 characters. The most it may ask them to admit to is something small and embarrassing; never ask them to swear about anything they could actually feel bad about.",
      example: "Do you swear to answer honestly, including the parts you would rather not say out loud?",
    },

    ...TOPICS.flatMap((spec, i) => questionFields(i, spec)),

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
        "The love letter that unseals the moment the verdict comes in — the real reason this page exists, and the one place the courtroom joke is dropped entirely. Four to seven sentences in the sender's plain voice, built from the specifics of their story rather than from generic romance. No markdown, no 'Dear ―', no sign-off: the sender's name is already printed beneath it. End on something said out loud rather than something performed, and never turn the quiz into a score the recipient owes.",
    },
  ],
};
