import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * watch — "us.", a video watch page made for her.
 *
 * Paths resolve against `WatchData` in
 * client/app/(templates)/watch/components/types.ts, held as `mf` in
 * useWatchEditor.ts.
 *
 * The "video" is a photo film: the sender's photos play as a video, one frame
 * per chapter, with each chapter's `cc` typing out on screen like subtitles.
 * Chapters are an array of OBJECTS ({ seconds, label, cc }), so they are
 * addressed flatly — `description.chapters[0].label` — never as a string list.
 * Seconds are derived by the player and are not the model's business.
 *
 * Absent on purpose: every photo/avatar/thumbnail (media), `video.youtubeId`
 * (an invented id plays a stranger's video), comment likes/ids (numbers the
 * renderer owns), and reply threads (their authors are retargeted in code).
 */

const FORBIDDEN = [
  ["You", "Tube"].join(""),
  ["Y", "T"].join(""),
  ["Sho", "rts"].join(""),
  ["Goo", "gle"].join(""),
  ["Ve", "vo"].join(""),
];

const CHAPTER_ARC = [
  "the first chapter — the cold open. A small, funny, specific opening moment (how they met, the first impression, a first-date detail). Light.",
  "the second chapter — an early inside joke or habit from their story. Still playful.",
  "the third chapter — a trip, an adventure or a day out they actually had. Warmer.",
  "the fourth chapter — something domestic and real: family, cooking, a fight they laugh about now, a hard week they got through. Tender.",
  "the fifth and LAST chapter — the sincere one. The thing the sender actually wants to say to her. This one should land.",
];

const chapterFields: AiFillField[] = CHAPTER_ARC.flatMap((arc, i): AiFillField[] => [
  {
    path: `description.chapters[${i}].label`,
    label: `Chapter ${i + 1} title`,
    kind: "text",
    max: 70,
    required: i < 3,
    guide: `Chapter title for ${arc} Shown as a tappable chapter in the description, under the player's scrubber and in the chapter list. Lowercase, like a real chapter marker: 3–9 words naming a concrete moment from the sender's story (a place, an object, a line someone said). No timestamps, no numbering, no emoji.`,
    example: "the day you fell asleep on the metro",
  },
  {
    path: `description.chapters[${i}].cc`,
    label: `Chapter ${i + 1} caption`,
    kind: "text",
    max: 120,
    required: i < 3,
    guide: `The subtitle that types out over the photo during ${arc} Written as the sender speaking to her in the first person, lowercase, one or two short sentences (under 110 characters), like a caption line in a home video. It adds a detail the chapter title doesn't say. No hashtags; one emoji at most, usually none.`,
    example: "you said you weren't tired. you were asleep before the next station.",
  },
]);

const COMMENT_ROLES = [
  "her best friend, teasing the sender with receipts from a group chat",
  "a friend of the couple reacting to a specific chapter by its timestamp (write the timestamp as 0:07, 0:14, 0:21 or 0:28 only)",
  "a parent, aunt or elder relative — affectionate, slightly critical, very Indian-family in tone",
  "a friend reporting how she reacted when she watched it (e.g. had to leave her desk)",
];

const commentFields: AiFillField[] = COMMENT_ROLES.flatMap((role, i): AiFillField[] => [
  {
    path: `comments[${i}].author`,
    label: `Comment ${i + 1} — name`,
    kind: "text",
    max: 24,
    guide: `The display name of a commenter who is ${role}. A realistic first name, nickname or relation-style name as it would appear on a comment ("Priya S.", "Mummy", "Rohit"). Use a real friend or family member named in the story if there is one; otherwise invent a plausible one. Never the sender's or her name.`,
    example: "Tanvi 🌸",
  },
  {
    path: `comments[${i}].text`,
    label: `Comment ${i + 1}`,
    kind: "text",
    max: 200,
    guide: `The comment written by ${role}. Sounds exactly like a real comment under a personal video: lowercase or casual casing, 1–2 sentences, and it MUST mention one concrete detail from the story (a place, a food, an event, a thing someone said) — never a generic 'so cute' line. Funny or touching. Refer to the sender and her by the names from the story.`,
    example: "he asked me what her favourite flower was in 2022 and then went silent for two years. this is what he was doing??",
  },
]);

const MEMORY_KINDS = [
  "a birthday or surprise he planned for her",
  "a trip or vlog-style day together",
  "cooking or something at home with family",
  "a time he showed up for her when she needed it",
];

const memoryFields: AiFillField[] = MEMORY_KINDS.flatMap((kind, i): AiFillField[] => [
  {
    path: `related[${i}].title`,
    label: `Memory ${i + 1} — video title`,
    kind: "text",
    max: 80,
    guide: `An "up next" video title in the right-hand column, for a memory about ${kind}. Written in the style of a real upload title — Title Case, a parenthetical or a "|" is welcome — but about their actual life, drawn from the story where possible. 5–12 words, no emoji.`,
    example: "I Tried To Plan Her Birthday Without Her Finding Out (She Found Out)",
  },
  {
    path: `related[${i}].note`,
    label: `Memory ${i + 1} — what it says`,
    kind: "text",
    max: 140,
    guide: `The caption that plays over the photo when she opens memory ${i + 1} (${kind}). First person, to her, lowercase, one or two short sentences with a concrete detail. Sweet, a little funny.`,
    example: "you knew about the cake. you still did the gasp for me.",
  },
]);

export const watch: AiFillTemplateSchema = {
  slug: "watch",
  audience: "partner",
  premise:
    "You are writing every word of a parody video watch page that a man made for his partner. His photos play as the 'video' (a short film with chapters and subtitles), and the page around it is their relationship dressed as a real upload: a title, view and like counts, a channel (him) with exactly one subscriber (her), a description with chapters, a pinned comment, comments from friends and family, 'up next' videos that are other memories, and a private letter that pops up in the corner. The chrome is played completely straight; the comedy is in the metadata, and it gets steadily more sincere — the chapters build to something real, the description's last lines stop joking entirely, and the letter is the heart of it. Warm, specific and Gen-Z casual, always in the exact language and script the sender wrote the story in.",
  forbiddenOutput: FORBIDDEN,
  fields: [
    {
      path: "herName",
      label: "Her name",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "What the sender actually calls her, as it appears in the story — her first name or the pet name he uses. Used in 'Dear ___,' on the letter and around the page. Just the name, no titles.",
      example: "Ananya",
    },
    {
      path: "channel.name",
      label: "Your name (channel)",
      kind: "text",
      max: 30,
      required: true,
      guide: "The sender's first name (or the name she calls him), used as the channel name beside the avatar and as the letter's signature. Short.",
      example: "Arjun",
    },
    {
      path: "channel.handle",
      label: "Channel handle",
      kind: "text",
      max: 30,
      guide: "An @handle for the sender that nods at her: lowercase, underscores, no spaces, starts with @ (e.g. '@arjun_loves_ananya', '@ananyas_boyfriend').",
      example: "@rohan_for_tara",
    },
    {
      path: "channel.subscribers",
      label: "Subscriber line",
      kind: "text",
      max: 30,
      guide: "The line under the channel name. '1 subscriber' is the canonical joke — the whole channel has exactly one viewer and it is her. Keep real counter phrasing.",
      example: "1 subscriber",
    },
    {
      path: "video.title",
      label: "Video title",
      kind: "text",
      max: 90,
      required: true,
      guide:
        "The title under the player (bold, up to two lines). Written like a real personal upload about the two of them — Title Case with a parenthetical or brackets is good ('(Full Video, No Skips) [4K]'), naming her and built around ONE specific thing from their story (a place, a habit, a running joke) — never a generic 'years of us' title. One ♥ at the end is allowed. Under 70 characters reads best.",
      example: "Kabir Tries To Cook Biryani For Riya's Birthday (Gone Wrong) [4K]",
    },
    {
      path: "video.views",
      label: "View count",
      kind: "text",
      max: 20,
      guide: "Rendered next to the date, never parsed. A plausible, non-round count with the word 'views' (never 1,000 or 10,000) — ideally digits that mean something in their story, like an anniversary on 14 Feb → '1,402 views' or the year they met.",
      example: "1,402 views",
    },
    {
      path: "video.postedAgo",
      label: "Posted",
      kind: "text",
      max: 30,
      guide: "Shown as the upload date. 'Premiered' + a meaningful date from their story (anniversary, the day they met, her birthday) in 'D Mon YYYY' form; otherwise a relative age like '2 years ago' that matches how long they've been together.",
      example: "Premiered 3 Mar 2024",
    },
    {
      path: "video.likes",
      label: "Like count",
      kind: "text",
      max: 12,
      guide: "The number on the like button, abbreviated like a real counter (e.g. '12K', '1.4M') — or the single character ∞. String, never parsed.",
      example: "∞",
    },
    {
      path: "description.intro",
      label: "Description — opening",
      kind: "list",
      max: 2,
      itemMax: 220,
      required: true,
      guide:
        "The first 1–2 short paragraphs of the description box, in the voice of someone writing an upload description to her: casual, slightly self-deprecating, specific, not yet sincere. May tell her to turn captions on or that the chapters are load-bearing. No timestamps, no hashtags.",
      example: "for two years you've asked why I keep taking photos of you mid-sentence. this is why.",
    },
    ...chapterFields,
    {
      path: "description.outro",
      label: "Description — the sincere part",
      kind: "list",
      max: 2,
      itemMax: 360,
      required: true,
      guide:
        "The last lines of the description, rendered in a large serif where the upload voice stops completely. 1–2 paragraphs, 180–450 characters total, written directly to her. One concrete detail from the story so it could only be about them. No timestamps, no jokes, no 'like and subscribe'.",
      example: "I don't say it enough, so here it is in writing where you can replay it: every good day I've had in two years has you somewhere in the frame.",
    },
    {
      path: "pinnedComment.text",
      label: "Pinned comment",
      kind: "text",
      max: 220,
      guide:
        "The sender's own pinned comment at the top of the comments, addressed to her by name. One or two sentences: admits the video is a bit, then something sincere, and tells her to check the corner of her screen for a letter. Casual casing, may end with ♥.",
      example: "ananya — the first chapter is a joke. the rest isn't. watch till the end, then look at the corner of your screen ♥",
    },
    ...commentFields,
    ...memoryFields,
    {
      path: "letter",
      label: "The letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The private letter that pops up in the corner of her screen. The page already prints 'Dear <her name>,' above it and the sender's signature below it, so DO NOT start with her name or a greeting and DO NOT sign off. Three to five short paragraphs separated by blank lines: open by nodding at the video joke, then two or three concrete memories from the story named specifically (the place, the food, the exact moment — never 'remember that first day' without saying what happened), then the sincere thing he has never quite said out loud, ending on a line about the future. Every sentence should be one only this sender could write. Simple warm English (or the sender's language), no lists, no hashtags, at most one emoji.",
      example:
        "If you're reading this, you either watched the whole thing or skipped to the end, which is honestly very you.\n\nI still think about the first time you laughed at my terrible joke on the terrace — not because it was funny, but because you didn't have to.\n\nYou make regular Tuesdays feel like the good part of a film. I'd like to keep filming.",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter opens",
      kind: "text",
      max: 80,
      guide: "A short, cute question she must answer 'yes' to before the letter opens, built on an inside joke or detail from their story (who got lost on the way home, who always steals the blanket) — not a generic 'ready?'. Under 60 characters, may end with one emoji.",
      example: "admit it, you cried at the dosa part? 👀",
    },
    {
      path: "lockAnswer",
      label: "Her answer button",
      kind: "text",
      max: 28,
      guide: "The label of the yes button that opens the letter — a sassy or sweet 'yes' in her voice (the 'no' button runs away). 1–4 words, may include one emoji.",
      example: "obviously 🙄",
    },
  ],
};
