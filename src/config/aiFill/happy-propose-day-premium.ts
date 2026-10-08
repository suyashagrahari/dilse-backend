import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-propose-day-premium — "Look Up", the premium twin of happy-propose-day: a rooftop proposal at night.
 * The sender's nervous texts arrive first; the recipient lights a candle per reason, switches on the windows of
 * a city (one photo memory each), then looks up as a drone show draws their initials, a heart, a ring box and
 * the question; saying yes = sliding the ring onto their own finger. Then a chat, the speech and a ticket.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-propose-day-premium.ts. The demo seeds 3 texts, 5 reasons, 4 moments and 4 flee lines.
 * Not declared: initials (derived from the names), ringStyle / stoneColor / handTone (visual choices), and every
 * media/music/drop/unlock field.
 */
export const proposeDayPremium: AiFillTemplateSchema = {
  slug: "happy-propose-day-premium",
  audience: "partner",
  premise:
    "A Propose Day page set on a private rooftop at night above a city. It opens with three nervous text messages from the sender inviting them up to the rooftop; then they light a path of candles, one reason each; switch on lit windows in the skyline, each a photo memory with a neon caption; and look up as hundreds of drone lights draw their initials, a heart, a ring box and finally the question. Saying yes means sliding the ring onto their own finger, while a 'Let me think' button runs away. Afterwards the sender texts them, and the speech the sender wrote for tonight is revealed. Romantic and grand, with nervous, funny, very human texts." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Propose Day",
      letterWhere: "It is the speech the sender wrote for tonight, revealed on candle-lit paper AFTER they have already said yes ('Before you go…'), so it can speak about this night and what comes next. It contains no question to them.",
      letterMax: 3000,
      endLineWhere: "printed on the 'front-row ticket' keepsake of their own drone show.",
      photosWhere: "each photo is a lit window in the city skyline at night, opened one at a time.",
      signaturePrinted: "The page signs it with the sender's name underneath.",
    }),
    {
      path: "extras.texts",
      label: "Your nervous texts (they arrive first)",
      kind: "list",
      max: 3,
      itemMax: 70,
      guide: "Exactly 3 short chat messages from the sender that arrive one after another before anything else, building gentle suspense and ending with an invitation to come up to the rooftop, terrace or balcony (use the place from the story if it names one). Nervous, funny, in the sender's texting voice: 1 checks if they're free, 2 admits something is planned, 3 the invitation. Each under 64 characters, no question in message 3." + VW_TONE,
      example: "Okay don't laugh. I planned something.",
    },
    {
      path: "extras.question",
      label: "The question in the sky",
      kind: "text",
      max: 60,
      required: true,
      guide: "The question the drones write in the sky. Match the relationship in the story: a new couple → 'Will you be mine, forever?' style; long-term → 'Will you marry me?' only if the story clearly points there; married → 'Will you choose me again, every day?' style. Short reads best in lights: under 40 characters, ends with a question mark, no emoji, may end with their name. Same language AND script as the story (Latin letters for a Hinglish story), and the right gender for the recipient.",
      example: "Will you be mine, forever?",
    },
    {
      path: "extras.lookUpLine",
      label: "The line before the sky lights up",
      kind: "text",
      max: 50,
      guide: "One very short line shown alone in the dark just before the drone show starts, telling them to look up. Two to five words, ends with a full stop or an ellipsis, no emoji.",
      example: "Okay. Look up.",
    },
    {
      path: "extras.reasons",
      label: "A reason for each candle",
      kind: "list",
      max: 5,
      itemMax: 80,
      guide: "Exactly 5 short reasons, one per candle they light before the question (it rises in handwriting as the flame catches). Each is one concrete thing about THEM from the story, said to them ('you'), with a little wit — not a plain fact. Five different details; when the story runs out, make the last ones about how they make the sender feel. Each under 75 characters." + VW_TONE,
      example: "You remember how I take my chai.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.moments[${i}].when`,
        label: `Window ${i + 1} — when`,
        kind: "text" as const,
        max: 20,
        guide: `The small time label on lit window ${i + 1} in the city; the four windows run in order, first meeting → tonight. Use ONLY timing the story actually gives (a season, a festival, 'year 1', 'last monsoon'); never invent a month or a year. Use 'Day 1' for the first meeting when the story gives no date, and 'Tonight' for the last window. Under 18 characters.`,
      },
      {
        path: `extras.moments[${i}].what`,
        label: `Window ${i + 1} — the memory`,
        kind: "text" as const,
        max: 50,
        guide: `The neon caption on lit window ${i + 1}: what happened, from the story, 3–8 words, may end with one emoji. Windows go first meeting → a first → a funny or hard moment → tonight; the last one names this night or this place, never the question itself. Same language as the story.`,
        example: "One umbrella, two people ☔",
      },
    ]),
    {
      path: "extras.noLines",
      label: "What “Let me think 🙈” says as it runs",
      kind: "list",
      max: 4,
      itemMax: 28,
      guide: "Exactly 4 short lines a little 'Let me think 🙈' button says as it runs away from their finger while they decide (the yes is sliding the ring on). Kind and silly, escalating: thinking is overrated, a mock-serious objection, a bribe taken from the story (their favourite food, the thing they always steal), finally 'the ring is already out'. The joke is always on the button. Two to five words each, under 24 characters. Same language as the story.",
      example: "Thinking is overrated",
    },
    {
      path: "extras.afterYes",
      label: "Your text after they say yes",
      kind: "text",
      max: 120,
      guide: "The first chat message the sender sends the moment they say yes, while the sky reads that they said yes: overwhelmed, first person, one or two short sentences with one playful callback to the story (a 'no refunds' kind of tease). Under 110 characters." + VW_TONE,
    },
    {
      path: "extras.shayari",
      label: "A couplet for the letter",
      kind: "longtext",
      max: 160,
      guide: "An optional two-line rhyming couplet at the very end of the speech, lines separated by a line break, written fresh for these two, in exactly the same language and script as the rest of the page. It is unsigned: no poet, no author, no dash-credit, nobody's name after it. Under 150 characters. If you cannot make it rhyme, return null.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Your voice message's caption",
      kind: "text",
      max: 90,
      guide: "The line shown with the sender's voice message in the chat right after they say yes (or sent as a plain text message when there is no recording). First person, addressed to them, still shaky with relief, one small detail or inside joke from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "I practised this in the mirror. The mirror said yes.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. tucked under the speech at the end of the page, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you miss me tonight / open only if you ever doubt this), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
