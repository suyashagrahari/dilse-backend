// ─── Rewind — AI form-fill schema ────────────────────────────────────────────
//
// Paths address `RewindData`
// (client/app/(templates)/rewind/components/types.ts), held in
// `useRewindEditor`'s `mf` slot.
//
// The page is a music-streaming app clone ("Lovify") around a year-in-review
// story ("Rewind"). THE NUMBERS ARE DERIVED, NOT TYPED: minutes together,
// days, hours, winters, Diwalis, the weekday and the play count all come out
// of `deriveStats()` from `startDate` alone. The couple verdict ("aura") comes
// out of the six `answers.*` quiz choices.
//
// NOT DECLARED: every URL / media leaf (`photos[].url`, crops, `audioUrl`,
// the legacy photo fields), `stats[].key` (generated on save) and the legacy
// `songTitle`/`songArtist` (kept in step with songs[0] on save).

import type { AiFillField, AiFillTemplateSchema } from "./types";

const NO_BRAND =
  " Never name a real music app, streaming service or its year-in-review feature — the app on this page is called Lovify and the story is called Rewind; those are the only product names allowed.";

const JOKE =
  "The three parts are one joke in three beats: LABEL sets up a countable thing, VALUE is the absurd figure, SUB is the punchline that undercuts it. Affectionate teasing about a shared habit from the story, never a real complaint. The punchline must be specific to the story — never stock filler like 'who's counting', 'and still craving more' or 'every time', and no exclamation marks.";

const photoCaption = (i: number): AiFillField => ({
  path: `photos[${i}].caption`,
  label: `Memory ${i + 1} — song title`,
  kind: "text",
  max: 40,
  guide:
    `Photo ${i + 1} is shown as a track in "Liked Songs" and as an album cover; this caption is its song title. 2–5 words, lowercase, like a track name. ` +
    (i === 0
      ? "Photo 1 names the moment the story treats as the start (first meeting, first date, first trip)."
      : "Each caption names a DIFFERENT specific moment, place or in-joke from the story — never repeat an idea used by another photo."),
  example: i === 0 ? "the first chai" : undefined,
});

const photoNote = (i: number): AiFillField => ({
  path: `photos[${i}].note`,
  label: `Memory ${i + 1} — lyrics`,
  kind: "longtext",
  max: 260,
  guide: `The "lyrics" of memory ${i + 1}: one or two sentences, first person, to the recipient as "you", about the exact moment in that photo's caption — a concrete detail (what was said, eaten, the weather, the time). Warm, a little funny, no exclamation marks, never generic. Under 200 characters.`,
});

const quiz = (id: string, label: string, options: string[], meaning: string): AiFillField => ({
  path: `answers.${id}`,
  label,
  kind: "enum",
  options,
  guide: `One quiz answer that decides the couple's verdict. Pick the option the story actually supports: ${meaning} If the story gives no hint, pick the most affectionate plausible one.`,
});

export const rewind: AiFillTemplateSchema = {
  slug: "rewind",
  premise:
    "A parody music-streaming app called Lovify, made by the sender for the recipient. Its home screen shows 'Your Rewind is here'; tapping it plays a year-in-review story of full-screen colour cards: the weekday it started, minutes together (computed), their top genres (made-up genres about the relationship), their top 5 songs, their top places, 5 reasons on repeat, a few joke statistics, 'top 0.01% of your fans', and a verdict on what kind of couple they are. Memories appear as 'Liked Songs' (caption = song title, note = lyrics). It ends on a shareable summary card and a hidden bonus track: the main letter, played as synced lyrics. Gen-Z, dry and warm; the app chrome is played straight and the romance lives in the content." +
    NO_BRAND,
  audience: "partner",
  forbiddenOutput: [["Spot", "ify"].join(""), "JioSaavn", "Gaana"],
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The first name (or the name the sender actually calls them) of the person this is for. It opens the story in the biggest type in the whole thing.",
      example: "Aditi",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 40,
      guide: "The sender's first name. They are 'the artist' on the page and sign the letter.",
      example: "Rohan",
    },
    {
      path: "startDate",
      label: "The date it started",
      kind: "date",
      max: 10,
      required: true,
      guide:
        "YYYY-MM-DD — every number on the page is computed from it. Fill it only if the story states the date; never approximate one from 'about two years ago'. It must not be in the future.",
    },
    {
      path: "genres",
      label: "Top genres",
      kind: "list",
      max: 4,
      itemMax: 28,
      guide:
        "Four made-up 'music genres' that describe this relationship, the first being THE top genre shown huge on its own card. Each is 1–3 words in title case, styled like a real genre name but built from the story's habits, places or in-jokes (a food, a time of night, a city, a running bit). Funny and specific, never generic like 'Romance'. All four different.",
      example: "Chai-core",
    },
    {
      path: "songs",
      label: "Top 5 songs",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide:
        "Their top 5 songs, each written exactly as 'Title | Artist' (title, space, vertical bar, space, artist). If the story names songs, use those first. Fill the rest with real, well-known songs that fit the couple's mood and language (Hindi/Bollywood for Indian couples unless the story suggests otherwise) — real titles with their correct credited singer, never invented ones or wrong credits (if unsure of the singer, choose a different song you are sure about), and no two by the same artist. #1 gets its own spinning-vinyl card.",
      example: "Tum Se Hi | Mohit Chauhan",
    },
    {
      path: "playlistName",
      label: "Playlist name",
      kind: "text",
      max: 50,
      guide: "The name of the sender's playlist of these songs, lowercase, like a real personal playlist title — a dry, affectionate phrase tied to the recipient or an in-joke. 2–6 words.",
      example: "songs that are basically you",
    },
    {
      path: "places",
      label: "Top 5 places",
      kind: "list",
      max: 5,
      itemMax: 40,
      guide:
        "Their top 5 places together, ranked, taken from the story: specific spots (a café, a terrace, a road, a city, 'the auto home'), 2–5 words each, with a tiny detail where it fits ('your terrace, 1 AM'). If the story has fewer, add ordinary shared places that fit it. No two alike.",
      example: "Your terrace, 1 AM",
    },
    {
      path: "topReasons",
      label: "On repeat — 5 reasons",
      kind: "list",
      max: 5,
      itemMax: 110,
      required: true,
      guide:
        "A ranked countdown of 5 things about the recipient the sender 'never skips': small, specific, observed behaviours from the story — a gesture, a habit — never abstract virtues and never stock lines like 'you laugh at my jokes', 'you're the best buddy' or 'you make me happy' — each one uses a concrete detail from the story or a very specific small gesture. One sentence each in the second person, under 90 characters. The most quietly devastating one goes LAST.",
      example: "You hand me the left earbud without looking.",
    },
    ...[0, 1, 2].flatMap((i): AiFillField[] => [
      {
        path: `stats[${i}].label`,
        label: `Joke ${i + 1} — label`,
        kind: "text",
        max: 36,
        guide: `The setup above the big number on joke stat ${i + 1}, the start of a countable phrase — 'times you said', 'cups of chai abandoned'. Lowercase, under six words. ${i > 0 ? "It must count something completely different from the other jokes. " : ""}` + JOKE,
      },
      {
        path: `stats[${i}].value`,
        label: `Joke ${i + 1} — the number`,
        kind: "text",
        max: 10,
        guide: "The figure, set enormous. Digits only, or a duration like '11:42'. Oddly specific beats round: 47 beats 50. " + JOKE,
      },
      {
        path: `stats[${i}].sub`,
        label: `Joke ${i + 1} — punchline`,
        kind: "text",
        max: 80,
        guide: "One short sentence under the number that turns the statistic into a joke by contradicting or deadpanning it. " + JOKE,
      },
    ]),
    {
      path: "fanLine",
      label: "Top-fan line",
      kind: "text",
      max: 110,
      guide: "Shown to the recipient right under 'you were in the top 0.01% of <sender>'s fans' — the SENDER is the artist, the RECIPIENT is the fan. One or two short dry sentences addressed to the recipient as 'you' that land the joke (nobody replays the sender more than you do), naming the sender once and using one detail from the story, e.g. something the recipient keeps doing to or with the sender. Under 90 characters, no exclamation marks.",
      example: "Nobody has replayed Rohan more. Nobody is even close.",
    },
    quiz("argue", "Verdict quiz — arguments", ["talk", "feed", "silence", "loud"], "talk = they talk it out at 2 AM; feed = one of them makes food; silence = nobody speaks for hours; loud = loud, then over."),
    quiz("reply", "Verdict quiz — replies", ["instant", "slow", "voice", "unread"], "instant = always instant; slow = ninety minutes then a novel; voice = long voice notes; unread = left on read, then a call."),
    quiz("plans", "Verdict quiz — plans", ["cancel", "chaos", "spread", "drift"], "cancel = they cancel and stay in; chaos = plans change four times; spread = planned to the minute; drift = they just start walking."),
    quiz("start", "Verdict quiz — how it started", ["slow", "fast", "friends", "chaos"], "slow = painfully slowly; fast = immediately and everyone knew; friends = friends for years first; chaos = nobody agrees on the story."),
    quiz("love", "Verdict quiz — love language", ["food", "photo", "wait", "argue"], "food = 'have you eaten'; photo = sending photos of nothing; wait = showing up / waiting outside; argue = arguing about pointless things."),
    quiz("weekend", "Verdict quiz — perfect Saturday", ["home", "out", "talk", "photo"], "home = neither leaves the house; out = six places, no plan; talk = one long conversation; photo = four hundred photos."),
    {
      path: "closingLine",
      label: "The last line",
      kind: "text",
      max: 60,
      guide: "The final card of the story: this line alone in huge type. Under eight words, one sentence, understated — the sender putting the phone down, not a summary.",
      example: "Same time next year.",
    },
    {
      path: "letter",
      label: "The bonus track (main letter)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The main love letter from the sender, played as a hidden 'bonus track' whose lines light up one at a time like synced lyrics. Line 1 is just the recipient's first name and a comma on its own line. Then 5 paragraphs separated by blank lines, each 3–4 sentences; the whole letter MUST be at least 170 words and at most 230 (a short letter is a failure), sentence case, no exclamation marks, short sentences (they become lyric lines). Never state how long they have been together or how long ago anything was (the page computes all durations and you do not know today's date). Paragraph 1 nods to everything else having been counted and this being the hidden track. Paragraphs 2–3 are two concrete memories from the story with small details. Then what the recipient means in plain spoken words — any news, plan or confession from the story goes HERE. End with one or two lines that tie back to music (on repeat, never skipping, pressing play). No sign-off — the page adds it." +
        NO_BRAND,
    },
    {
      path: "lockQuestion",
      label: "Question before the bonus track",
      kind: "text",
      max: 90,
      guide: "A playful yes-question the recipient answers before the bonus track unlocks, built on an in-joke or habit from the story (not generic), answerable with one tap. Under 60 characters, ends with a question mark.",
    },
    {
      path: "lockAnswer",
      label: "Yes button",
      kind: "text",
      max: 30,
      guide: "The label on the green yes button for the question above (the Skip button runs away): a short teasing yes that fits the question, 1–4 words plus one emoji or ▶, under 22 characters.",
    },
    ...[0, 1, 2, 3].map(photoCaption),
    ...[0, 1, 2, 3].map(photoNote),
  ],
};
