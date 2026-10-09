import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-propose-day-premium — "The Premiere", the premium twin of happy-propose-day: the couple's story screened as
 * a film for an audience of one. A ticket, a projector countdown, "Based on a true story", the opening title, three
 * acts cut from the sender's photos with subtitles (Act I how it started, Act II the moment I knew, Act III a
 * "coming soon" trailer of their future), the director's commentary, the last page of the script (the letter),
 * then the question as the final title card. On yes the letterbox opens, the song drops and the end credits roll.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-propose-day-premium.ts. The demo seeds 3 trailer cards, 4 No lines and 3 credits.
 * Not declared: every media/music/drop/unlock field.
 */
export const proposeDayPremium: AiFillTemplateSchema = {
  slug: "happy-propose-day-premium",
  audience: "partner",
  premise:
    "A Propose Day page that screens the couple's own story as a film made for one person. It opens on a cinema ticket with the film's title, a projector countdown and 'Based on a true story', then the opening title card. Three acts follow, each one of the sender's photos with a single subtitle line: Act I is how they met, Act II is the exact moment the sender knew, Act III is a 'coming soon' trailer of their future together in short punchy cards. Then the director's commentary (a voice note from the sender), the last page of the script (the sender's letter), and the proposal question set enormous as the final title card, with a No button that dodges. On yes the screen opens up, the song hits its chorus and end credits roll with inside-joke credits. Cinematic, romantic and funny; every line must come from this couple's real story." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Propose Day",
      letterWhere:
        "It is typed on the last page of the film's script, the sender speaking to them right BEFORE the question is asked, so it can build towards asking without asking it: the question itself appears on the next screen, so the letter contains no question to them and never says yes for them.",
      letterMax: 3000,
      endLineWhere: "shown as the last line of the end credits, after they have said yes.",
      photosWhere: "each photo is a still from their film, and this caption is its scene name in the end credits.",
      signaturePrinted: "The page prints the sender's name above it as the speaker.",
    }),
    {
      path: "extras.filmTitle",
      label: "Your film's title",
      kind: "text",
      max: 40,
      guide:
        "The title of the film of their love story, printed on the ticket, the opening title card and the poster. Two to five words, named after one specific, slightly funny detail of THIS story (a thing, a place, a habit), the way real romcom titles are. Title Case, no quotation marks, no emoji, no names of real films.",
      example: "Two Chais, One Table",
    },
    {
      path: "extras.tagline",
      label: "The poster's tagline",
      kind: "text",
      max: 70,
      guide:
        "The tagline under the title on the film poster: a short, witty movie-poster line built on one detail from the story, often three short beats ('One X. Two people. No Y.'). Under 60 characters, ends with a full stop, no emoji.",
    },
    {
      path: "extras.actOne",
      label: "Act I · How it started",
      kind: "text",
      max: 90,
      guide:
        "The subtitle on the first still, Act I, 'How it started': one sentence from the sender to them ('you') about how they met or the very first moment, with the real detail from the story and a small twist or tease at the end. When the story doesn't say how they met, make it about the first thing the sender noticed about them, without inventing a place or an event. Under 80 characters, no emoji." +
        VW_TONE,
      example: "You laughed at my worst joke. I decided right there.",
    },
    {
      path: "extras.actTwo",
      label: "Act II · The moment I knew",
      kind: "text",
      max: 90,
      guide:
        "The subtitle on the second still, Act II, 'The moment I knew': one sentence from the sender to them about the exact moment the sender knew this was the person (a different memory from Act I, from the story). Tender rather than jokey. Under 80 characters, no emoji." +
        VW_TONE,
    },
    {
      path: "extras.comingSoon",
      label: "Act III · Coming soon",
      kind: "list",
      max: 3,
      itemMax: 48,
      guide:
        "Exactly 3 trailer cards for 'Act III: Coming soon', the couple's future, shown one at a time in huge letters like a movie trailer. Each is a short punchy fragment about something they will do together, grounded in plans, places or habits from the story (a trip they keep talking about, a home, a ritual they already have). The first opens with a time word, the way trailers do (a season, 'next year', 'soon'; never a calendar year), and the last is the funniest. Each card is written in the story's own language and script, exactly like every other field: a Hinglish story gets Hinglish cards such as 'Agle saal: ek ghar, do chaabiyan.' Under 40 characters each, ends with a full stop, no emoji, no question.",
    },
    {
      path: "extras.question",
      label: "The question (the final title card)",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The proposal, set enormous as the film's final title card. Match the relationship in the story: a new couple → 'Will you be mine, forever?' style; long-term → 'Will you marry me?' only if the story clearly points there; married → 'Will you choose me again, every day?' style. Under 40 characters, ends with a question mark, no emoji, may end with their name. Same language AND script as the story (Latin letters for a Hinglish story), and the right gender for the recipient.",
      example: "Will you be mine, forever?",
    },
    {
      path: "extras.noLines",
      label: "What “No” says as it dodges",
      kind: "list",
      max: 4,
      itemMax: 28,
      guide:
        "Exactly 4 short lines the No button says as it dodges their finger, in film-set language, escalating: a director calling for another take, a mock-serious objection, a bribe taken from the story (their favourite food, the thing they always steal), and a final plea. Kind and silly, the joke is always on the button. Two to four words each, under 22 characters so it fits the button. Written in the story's own language and script, like every other field.",
    },
    {
      path: "extras.afterYes",
      label: "Your line when they say yes",
      kind: "text",
      max: 120,
      guide:
        "The sender's subtitle on the big reveal the moment they say yes: overwhelmed, first person, one or two short sentences with one playful callback to the story. Under 100 characters." +
        VW_TONE,
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.credits[${i}].role`,
        label: `Credit ${i + 1} — role`,
        kind: "text" as const,
        max: 32,
        guide: `The role in end credit ${i + 1}, written like a real film credit for a thing rather than a person ('Best Supporting Role', 'Catering', 'Soundtrack', 'Location Scout', 'Stunts', 'Continuity', 'Special Effects'). Each of the three credits uses a different role. 1–4 words, Title Case, no emoji.`,
      },
      {
        path: `extras.credits[${i}].name`,
        label: `Credit ${i + 1} — credited to`,
        kind: "text" as const,
        max: 40,
        guide: `Who or what gets end credit ${i + 1}: a real object, place, food, friend or habit from the story that played a part in their love story, said with affection ('the blue umbrella from the café', 'every 2 am chai'). When the story runs out of such details, credit an everyday thing every couple shares (the late-night calls, the 'reached home?' texts) instead of inventing a place, a pet or an event. Never one of the two of them, never a brand. 2–7 words, no emoji. Same language as the story.`,
      },
    ]),
    {
      path: "extras.location",
      label: "Filmed on location in",
      kind: "text",
      max: 60,
      guide:
        "The places their story happened, as the 'Filmed on location in …' credit: the cities or places named in the story, joined with commas and 'and', ending with one small funny real place from the story (a balcony, a canteen, a bus stop). Copy the place names exactly as the story writes them, so every word of this credit can be found in the story; a story that names no place gets null. Under 55 characters, no emoji, without the words 'filmed on location'.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "The director's commentary",
      kind: "text",
      max: 90,
      guide:
        "One line of 'director's commentary' from the sender, shown with their voice message (or alone as a subtitle when there is no recording), just before the last page of the script: first person, a little nervous, one small behind-the-scenes detail from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "I rewrote this scene forty times. Every draft ended with you.",
    },
    {
      path: "premium.psLetter",
      label: "The post-credits scene (sealed P.S.)",
      kind: "longtext",
      max: 600,
      guide:
        "The post-credits scene: a sealed P.S. revealed after the credits, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you said yes / open only if you can't sleep tonight), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." +
        VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
