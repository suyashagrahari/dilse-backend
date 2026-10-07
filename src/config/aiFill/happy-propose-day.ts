import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-propose-day — "The Little Velvet Box" (Valentine's week, 8 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts. The demo seeds
 * 3 reasons, 4 moments and 5 "No" lines, so those indices always exist.
 * Not declared: ringStyle, stoneColor, noMode (visual choices).
 */
export const proposeDay: AiFillTemplateSchema = {
  slug: "happy-propose-day",
  audience: "partner",
  premise:
    "A Propose Day page. On a night-velvet stage the recipient opens a ring box, reads the sender's proposal speech, scratches gold foil to reveal the big question, and answers it — the 'No' button runs away and shrinks while 'Yes' grows, and a YES sets off fireworks. Theatrical, playful, suspenseful, then sincere." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Propose Day",
      letterWhere: "It is THE PROPOSAL SPEECH, typed out from a scroll inside the ring-box lid as if the sender were saying it on one knee. It builds up to the big question but never asks it: the question is hidden under gold foil on the NEXT screen, so the speech must contain no question to them at all and its last line is a nervous, funny lead-in (a deep breath, a 'so…').",
      letterMax: 1500,
      endLineWhere: "shown after the YES celebration.",
      photosWhere: "the photos are lit one by one along a 'how we got here' timeline.",
      signaturePrinted: "It is spoken aloud on a screen headed '<sender> clears their throat…', not signed.",
    }),
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      required: true,
      guide: "The question hidden under the gold foil. Match the relationship in the story: a new couple → 'Will you be mine, forever?' style; long-term → 'Will you marry me?' only if the story clearly points there; married → 'Will you choose me again, every day?' style. Under 55 characters, ends with a question mark and at most one emoji. Same language AND script as the story (Latin letters for a Hinglish story), and the right gender for the recipient.",
      example: "Will you be mine, forever? 💍",
    },
    {
      path: "extras.teaser",
      label: "Curtain line",
      kind: "text",
      max: 70,
      guide: "The nervous line on the closed curtain before anything opens. First person, a little shaky and funny, ideally nodding to one detail from the story. Under 65 characters." + VW_TONE,
      example: "I've practised this a hundred times. Here goes…",
    },
    {
      path: "extras.reasons",
      label: "3 reasons I'm asking",
      kind: "list",
      max: 3,
      itemMax: 80,
      guide: "Exactly 3 short reasons shown as cards ('Reason #1'…) before the question. Each is one concrete thing about THEM from the story, said to them ('you'), with a little wit — not a plain fact. Three different details. Each under 75 characters." + VW_TONE,
      example: "You remember how I take my chai.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.moments[${i}].when`,
        label: `Moment ${i + 1} — when`,
        kind: "text" as const,
        max: 20,
        guide: `The time label for step ${i + 1} of their 'how we got here' timeline; the four steps run in order, first meeting → today. Use ONLY timing the story actually gives (a season, a festival, 'year 1', 'last monsoon'); never invent a month or a year. Use 'Day 1' for the first meeting when the story gives no date, and 'Today' for the last step. Under 18 characters.`,
      },
      {
        path: `extras.moments[${i}].what`,
        label: `Moment ${i + 1} — what happened`,
        kind: "text" as const,
        max: 50,
        guide: `What happened at timeline step ${i + 1}, from the story, 3–8 words, can end with one emoji. Steps go first meeting → a first → a funny or hard moment → now. Same language as the story.`,
        example: "The day you stole my umbrella ☔",
      },
    ]),
    {
      path: "extras.noLines",
      label: "What the No button says",
      kind: "list",
      max: 5,
      itemMax: 28,
      guide: "Exactly 5 short lines the runaway 'No' button says as it dodges their finger and shrinks, escalating into comedy: the button getting tired, offering a bribe taken from the story (their favourite food, the thing they always steal), claiming a technical fault, finally giving up. Light and silly — the joke is always on the button itself, and it fits the couple (no wedding jokes for a married couple). Two to four words each, under 24 characters — longer lines get cut off. Same language as the story.",
      example: "Button.exe has stopped",
    },
    {
      path: "extras.afterYes",
      label: "After-YES message",
      kind: "text",
      max: 120,
      guide: "What appears the moment they say yes, over fireworks: joyful, first person, one or two short sentences with one playful callback to the story (a 'no refunds' kind of tease). Under 110 characters." + VW_TONE,
    },
    {
      path: "extras.shayari",
      label: "A shayari",
      kind: "longtext",
      max: 160,
      guide: "An optional two-line couplet shown as a pull-quote inside the speech, lines separated by a line break. Write an original one that rhymes and scans, in Roman-script Hindi/Urdu for a Hinglish story or simple English for an English story. It is unsigned: no poet, no author, no dash-credit, nobody's name after it. Under 150 characters. If you cannot make it rhyme, return null.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
