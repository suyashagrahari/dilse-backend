// ─── Dedication — AI form-fill schema ────────────────────────────────────────
//
// Paths address `DedicationData`, the editor's flat form state
// (client/app/(templates)/dedication/components/showData.ts:52), held in
// `useDedicationEditor`'s `mf` slot.
//
// SEGMENT LAYOUT. `mf.segments` is a discriminated union — `VoiceSegment` or
// `SongSegment` — and the indices below match the shape the sheet seeds from
// (DEMO_DATA / BLANK_DATA in showData.ts): voice, song, voice, song. Fields are
// declared only against the member each index actually is.
//
// NOTHING MEDIA. On a voice segment the audio field is a booth recording, and on
// a song segment the video-id field is pasted in by the sender from a link; a
// fabricated value for either renders as a dead player, so neither is declared.
// What IS declared is every word spoken or printed around them — which is where
// this template actually lives.

import type { AiFillTemplateSchema } from "./types";

/** Repeated into every spoken-line guide. The register is the whole template. */
const ON_AIR =
  "This is read ALOUD by a radio host, so write speech, not prose: contractions, short clauses, " +
  "a little air in it, the way someone actually talks into a microphone at night. No stage " +
  "directions, no emoji, no hashtags, nothing that only works written down.";

export const dedication: AiFillTemplateSchema = {
  slug: "dedication",
  premise:
    "This is a private late-night radio station that exists for exactly one listener: they turn a dial through static until your frequency locks, and then a show plays — a host's voice introducing each song, a dedication card sliding up over the radio's face, and a sign-off at the end. You are writing the station, the request slip, and every word the host says between the songs; the songs and the voice recordings themselves are supplied by the sender.",
  audience: "partner",
  fields: [
    {
      path: "stationName",
      label: "Station name",
      kind: "text",
      max: 24,
      guide:
        "The station's name, lit up in amber on the radio's display and printed on the body. Under about 20 characters because it is set in condensed caps on a small panel. It is almost always built from the listener's name — 'RADIO MEERA', 'MEERA FM', 'ALL MEERA, ALL NIGHT'. Give it in the sender's own language and script.",
      example: "RADIO MEERA",
      required: true,
    },
    {
      path: "stationFrequency",
      label: "Frequency",
      kind: "text",
      max: 6,
      guide:
        "The number on the dial, as a short decimal string like '98.3'. The good move is to make it mean something — the day and month they met written as a frequency, a flat number, a birthday. Only do that if the story hands you the number; otherwise leave it empty and the form's default stands. Digits and one decimal point, nothing else.",
      example: "98.3",
    },
    {
      path: "recipientName",
      label: "Who it's for",
      kind: "text",
      max: 24,
      guide:
        "The listener's name — the one person this station broadcasts to. It is printed on the request slip and spoken in every dedication, so use the name the sender actually calls them, not a formal one.",
      example: "Meera",
      required: true,
    },
    {
      path: "recipientCity",
      label: "Their city",
      kind: "text",
      max: 24,
      guide:
        "The city the listener is in. Real radio dedications always name the town — 'this one goes out to Meera in Bengaluru' — and that is exactly why it sells. Only fill it if the story says where they are; a wrong city is worse than no city.",
      example: "Bengaluru",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 24,
      guide:
        "The sender's first name, printed on the request slip as who the show is from and spoken at the end of each dedication.",
      example: "Arjun",
    },
    {
      path: "senderCity",
      label: "Your city",
      kind: "text",
      max: 24,
      guide:
        "The city the sender is broadcasting from. When the two cities differ it does a lot of quiet work — the distance is the reason the radio exists. Only fill it if the story says.",
      example: "Pune",
    },
    {
      path: "segments[0].caption",
      label: "Opening voice segment — what's said",
      kind: "text",
      max: 120,
      guide:
        "The host's opening words, before a single song plays: the moment the static clears and someone is talking directly to the listener. Two short sentences at most. It should name the station or the frequency and make the conceit explicit — that for the next few minutes this station only plays for one person. If the sender records their voice this becomes the on-screen subtitle; if they don't, it plays on its own as a card, so it has to work read silently too. " +
        ON_AIR,
      example:
        "Good evening. You're on 98.3, and for the next few minutes this station only plays for one person.",
      required: true,
    },
    {
      path: "segments[1].title",
      label: "First song — title",
      kind: "text",
      max: 60,
      guide:
        "The title of the first song, shown on the radio's screen panel. Fill this ONLY if the sender's story names an actual song they have in mind. If it does not, leave it empty — the sender picks the track by pasting a link, and a title you invented would sit under a completely different song.",
    },
    {
      path: "segments[1].artist",
      label: "First song — artist or where",
      kind: "text",
      max: 60,
      guide:
        "The line under the title. Conventionally the artist, but the better move when the story supports it is WHERE the song lives for them — 'in the auto, both times', 'the kitchen, every Sunday'. Same rule as the title: only if the story gives you something real. Leave empty otherwise.",
    },
    {
      path: "segments[1].dedication",
      label: "First dedication card",
      kind: "text",
      max: 120,
      guide:
        "The line the host reads out as the song fades up, which also slides onto the screen as a card and holds there for four seconds — the single most screenshotted frame in this template. Use the real radio-dedication form: who it goes out to, where they are, who it's from, and then the reason. One or two sentences. Specific beats sweeping: name the thing that happened, not the feeling about it. " +
        ON_AIR,
      example: "This one goes out to Meera in Bengaluru, from Arjun. Because she knows why.",
      required: true,
    },
    {
      path: "segments[2].caption",
      label: "Second voice segment — what's said",
      kind: "text",
      max: 120,
      guide:
        "The host talking between songs, right after the first one ends. This is the intimate one — the bit where they stop performing and say the thing they never said out loud. Two sentences. It should react to the song that just played, then turn toward the next. Do not repeat the opening's phrasing or re-introduce the station. " +
        ON_AIR,
      example:
        "That was the one you hummed the whole way back from the airport. I never told you I noticed.",
    },
    {
      path: "segments[3].title",
      label: "Second song — title",
      kind: "text",
      max: 60,
      guide:
        "Title of the second song. Same rule as the first: only if the sender's story names a real track. Otherwise leave it empty for them.",
    },
    {
      path: "segments[3].artist",
      label: "Second song — artist or where",
      kind: "text",
      max: 60,
      guide:
        "The line under the second title — artist, or where the song belongs to the two of them. Only fill from something the story actually says.",
    },
    {
      path: "segments[3].dedication",
      label: "Second dedication card",
      kind: "text",
      max: 120,
      guide:
        "The dedication read over the second song. It must not be a rewrite of the first — real hosts get shorter and looser as the show goes on, and often just gesture back ('still going out to Meera, still from Arjun') before adding one new reason. One or two sentences, and it should carry a different memory from the first card. " +
        ON_AIR,
    },
    {
      path: "signOff",
      label: "Sign-off",
      kind: "text",
      max: 120,
      guide:
        "The last thing the host says before the radio face dims and the static comes back. It holds alone on screen as a text card, so it has to land. Short — one sentence, ideally under fifteen words. The register is a real station signing off for the night: warm, a little formal, leaving the door open rather than closing it. Say goodnight to the listener's city if you have one.",
      example: "same frequency, same time, whenever you want. goodnight, Bengaluru.",
    },
  ],
};
