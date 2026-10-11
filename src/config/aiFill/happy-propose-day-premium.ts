import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-propose-day-premium — "The Little Proposal", the premium twin of happy-propose-day: a tiny, cute love story
 * with a ring at the end. A little door they knock on (a shy panda opens it with the sender's nervous hello), swipeable
 * polaroid story cards of how it started, a 4-panel comic of the sender rehearsing the proposal and failing, a shell
 * game of three gift boxes (a chocolate, a teddy, then the ring), the sender's letter in a heart-sealed envelope, the
 * voice note, and the question with a runaway No. On yes the ring box opens on the song's chorus, the ring lands on a
 * heart-shaped photo, a wall of celebrating stickers pops in, and they sign an "Officially Taken" certificate.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-propose-day-premium.ts. Not declared: every media/music/drop/unlock field and stoneColor (a
 * visual choice).
 */
export const proposeDayPremium: AiFillTemplateSchema = {
  slug: "happy-propose-day-premium",
  audience: "partner",
  premise:
    "A cute, bright Propose Day page that tells the couple's own little love story and ends with a ring. The recipient knocks on a tiny cartoon door and a shy panda opens it with the sender's nervous hello. They swipe through three polaroid story cards of how they started (each a photo, a tiny label and one line), taps through a four-panel comic of the sender rehearsing the proposal and getting it wrong, then open three gift boxes: the first holds a chocolate, the second a teddy, the third the ring. Then the sender's letter arrives in a heart-sealed envelope, the sender's voice note plays, and the question appears above a ring box with a No button that runs away. On yes the ring flies onto a heart-shaped photo of them, celebration stickers pop in, and they sign an 'Officially Taken' certificate with three playful terms. The voice is a real person's texts: short, nervous-cute, funny about themselves, tender about the recipient, built only from this couple's real story." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Propose Day",
      letterWhere:
        "It arrives in a heart-sealed envelope and types itself out just BEFORE the question, so it builds towards asking without asking: the question itself appears two screens later, so the letter contains no question to them and never says yes for them. Short paragraphs that read well on a phone.",
      letterMax: 3000,
      endLineWhere: "printed at the bottom of the 'Officially Taken' certificate they sign after saying yes.",
      photosWhere: "the first three photos are polaroid story cards of how they started and the last sits in a heart-shaped frame where the ring lands; the caption is the tiny handwritten line on the polaroid.",
      signaturePrinted: "The page prints the sender's name under the letter.",
    }),
    {
      path: "extras.teaser",
      label: "Your nervous hello at the door",
      kind: "text",
      max: 70,
      guide:
        "What the sender says the moment the little door opens and they see the sender (a shy panda holding a rose stands in for the sender): one or two very short, nervous-cute lines to them, a little funny about the sender's own nerves, hinting the sender has something to ask without asking it. Under 55 characters, may end with one emoji." +
        VW_TONE,
      example: "Okay okay, I'm nervous. Don't laugh 🙈",
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.moments[${i}].when`,
        label: `Story card ${i + 1} — label`,
        kind: "text" as const,
        max: 20,
        guide: [
          "The tiny label on the first story card, the very beginning of them: how they met or first spoke (like 'first chat', 'the canteen queue', 'Riya's party'). 1–3 lowercase words from the story, no date unless the story gives one, no emoji.",
          "The tiny label on the second story card, an early memory that came next (a first date, a first trip, a first fight): 1–3 lowercase words from the story, no emoji.",
          "The tiny label on the third story card, the moment the sender knew it was them: 1–4 lowercase words ('the day I knew' works when the story does not name the moment), no emoji.",
        ][i],
      },
      {
        path: `extras.moments[${i}].what`,
        label: `Story card ${i + 1} — one line`,
        kind: "text" as const,
        max: 70,
        guide:
          [
            "One line on the first story card, the sender to them ('you') about how it started, with the real detail from the story and a small funny twist.",
            "One line on the second story card, the sender to them about the next memory from the story (a different one from card 1), playful.",
            "One line on the third story card: the exact moment the sender knew, tender rather than jokey, a different memory from cards 1 and 2.",
          ][i] +
          " When the story has no memory left for this card, the line is only the sender's feeling at that stage (nervous, hooked, sure), with no food, place, habit or event in it, so every card still gets a line without inventing anything. Under 60 characters, one sentence, no emoji." +
          VW_TONE,
      },
    ]),
    {
      path: "extras.rehearsal",
      label: "The rehearsal comic",
      kind: "list",
      max: 4,
      itemMax: 60,
      guide:
        "Exactly 4 captions for a four-panel comic of the sender rehearsing this proposal and getting it wrong, first person, past tense, each a different small disaster: practising on something silly, a clumsy kneel, losing or dropping the ring, and the last panel deciding the sender is ready (with a wink that they aren't). Use one real detail from the story (the sender's room, friend or habit) in at least one panel when the story has one; a short story still gets all 4 panels about the universal ways a nervous proposal rehearsal goes wrong. Under 45 characters each, short sentences, no emoji." +
        VW_TONE,
    },
    {
      path: "extras.decoys",
      label: "The two boxes without the ring",
      kind: "list",
      max: 2,
      itemMax: 48,
      guide:
        "Exactly 2 notes, one inside each gift box that is NOT the ring box. The first box holds a chocolate, the second a teddy bear; each note names that gift and adds a sweet or teasing reason tied to them (from the story where possible). Start each with 'A chocolate' and 'A teddy' (or the same words in the story's language); the gift is exactly that, a plain chocolate and a plain teddy, so keep any food from the story out of the gift's name. A short story still gets both notes, sweet rather than specific. Under 45 characters each, ends with a full stop, no emoji.",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The proposal, printed big above the ring box. Match the relationship in the story: a new couple → 'Will you be mine?' style; long-term → 'Will you marry me?' only if the story clearly points there; married → 'Will you choose me again, every day?' style. Under 40 characters, ends with a question mark, no emoji, may end with their name. Same language AND script as the story (Latin letters for a Hinglish story).",
      example: "Will you be mine, forever?",
    },
    {
      path: "extras.noLines",
      label: "What “No” says as it runs away",
      kind: "list",
      max: 5,
      itemMax: 28,
      guide:
        "Exactly 4 short labels the No button shows as it runs from their finger, escalating from thinking it over, to mock disbelief, to a bribe taken from the story (their favourite food or the thing they always steal), to a final cute plea. Kind and silly, the joke is always on the button, never pushy. A short story still gets all 4 (the bribe can be any snack). Two to four words each, under 22 characters so they fit the button; one may end with an emoji. Written in the story's own language and script, like every other field.",
    },
    {
      path: "extras.afterYes",
      label: "Your line when they say yes",
      kind: "text",
      max: 120,
      guide:
        "The sender's line that types out right after they say yes and the ring lands: overwhelmed and happy, first person, one or two short sentences with one playful callback to the story (or, for a short story, to the nervous rehearsal). Under 90 characters, may end with one emoji." +
        VW_TONE,
    },
    {
      path: "extras.terms",
      label: "The certificate's terms",
      kind: "list",
      max: 3,
      itemMax: 48,
      guide:
        "Exactly 3 'terms and conditions' printed on the 'Officially Taken' certificate they sign: promises from the sender written as short contract terms, sweet or silly, at least one tied to a habit, food or place from the story (the window seat, their playlist, the last bite) when the story has one; a short story still gets all 3, sweet everyday promises. Under 40 characters each, start with a capital, end with a full stop, no emoji, no numbering." +
        VW_TONE,
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide:
        "One short line from the sender shown with the voice message (or alone when there is no recording), right before the question: first person, a little nervous and funny about recording it, one small detail from the story. Under 85 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A sealed P.S. revealed at the very end, after the certificate, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you said yes / open only if you're smiling), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the letter, built on one specific detail from the story the letter did not use (for a short story, simply how sure the sender is). No salutation, no sign-off, no sender's name. Under 550 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
