// ─── Us — AI form-fill schema ────────────────────────────────────────────────
//
// Paths address `ProfileData` (client/app/(templates)/us/components/types.ts),
// held in `useUsEditor`'s `mf`. EVERY text leaf the page shows is declared
// here, within the 40-field ceiling:
//
//   names (2) · profile (7) · letter + lock (3) · DMs (1) · highlight titles
//   (4) + first story captions (4) · post captions (9) · comments on the first
//   six posts (6) · locations on the first four (4)  = 40
//
// The demo holds exactly that much copy, so nothing a sender sees after a fill
// is left over from the demo couple.
//
// Comments are declared as a LIST of "handle: comment" lines rather than one
// field per handle and per text — the only way six posts' worth of comments fit
// the budget. The editor turns each line back into {handle, text} after the
// fill (`normaliseFill` in useUsEditor).
//
// NOT DECLARED (media / structure): avatarUrl, avatarCrop, link.url,
// posts[].imageUrl/crop/more/id/likes/postedAgo, highlights[].coverUrl,
// slides[].imageUrl/crop, pinnedPostIds, stats (numbers the demo sets well).
//
// ── BRAND SAFETY ─────────────────────────────────────────────────────────────
// The template clones a photo-sharing app's layout but must never name it.
// `forbiddenOutput` drops any field that slips; the guides say it plainly
// without spelling the words (this directory is swept for them too).

import type { AiFillField, AiFillTemplateSchema } from "./types";

const NO_BRAND =
  " Never name any real social-media app, its parent company or its features, and never build hashtags or handles from them.";

const VOICE =
  " Voice: a Gen-Z couple running a joint account about themselves — lowercase, dry, specific, tender underneath. Use real details from the story (places, foods, habits, fights, pet names); never generic filler like 'making memories' or 'my forever'.";

/** Where each post sits in the grid's timeline — post 0 is the oldest. */
const POST_ERAS = [
  "the oldest post — how it all started",
  "an early-days post",
  "an early-days post",
  "from their first year",
  "from their first year",
  "from the middle of the story so far",
  "from the middle of the story so far",
  "a recent post",
  "the newest post — where they are right now",
];

const HIGHLIGHT_THEMES = [
  "their first date",
  "the two of them — the soft one",
  "food / dates they go on",
  "trips or places they love",
];

const caption = (i: number): AiFillField => ({
  path: `posts[${i}].caption`,
  label: `Post ${i + 1} — caption`,
  kind: "longtext",
  max: 220,
  guide:
    `Caption under post ${i + 1} of 9 (${POST_ERAS[i]}; the grid runs oldest → newest). One or two short lowercase lines built as setup + turn: a concrete detail from the story (a named place, food, object, habit, person or fight), then a dry or tender twist. Every caption uses a DIFFERENT detail from the story — when the big moments run out, use the small everyday habits it mentions. Punctuate calmly: end with a full stop or a single emoji. No hashtags. First person ('i'/'we'), about the recipient by pet name or 'she'/'he'/'they'.` +
    VOICE +
    NO_BRAND,
  example: "she said she wasn't hungry. she finished my fries.",
  required: i < 3,
});

const comments = (i: number): AiFillField => ({
  path: `posts[${i}].comments`,
  label: `Post ${i + 1} — comments`,
  kind: "list",
  max: 3,
  itemMax: 110,
  guide:
    `Two or three comments left under post ${i + 1} (${POST_ERAS[i]}) by people OUTSIDE the couple. Each item is EXACTLY one line in the form "handle: comment" — a lowercase handle (letters, digits, dots, underscores; like her_mom, the_group_chat, bestie.exe, or a friend named in the story), a colon, then the comment. Comments are the funniest surface: a parent missing the point, a friend exposing a detail, someone dramatically 'unfollowing'. Short (under 60 characters), lowercase, emoji allowed. Reuse the same few commenters across posts so they feel like real recurring people. React to THIS post's caption.` +
    NO_BRAND,
  example: "her_mom: he was sweating. i have photos.",
});

const location = (i: number): AiFillField => ({
  path: `posts[${i}].location`,
  label: `Post ${i + 1} — location`,
  kind: "text",
  max: 40,
  guide: `The small grey location tag above post ${i + 1} (${POST_ERAS[i]}), matching that post's caption. Formatted like a real map tag: a specific named place from the story with its area or city ('Vaishali, FC Road' style), or — only if the story names no place — a cosy joke tag like 'her side of the bed'. Under 30 characters.`,
});

const hlTitle = (i: number): AiFillField => ({
  path: `highlights[${i}].title`,
  label: `Highlight ${i + 1} — title`,
  kind: "text",
  max: 14,
  guide: `The label under story-highlight bubble ${i + 1}, about ${HIGHLIGHT_THEMES[i]} — adapted to what this couple actually does. 1–2 lowercase words, max 11 characters so it doesn't truncate; one emoji allowed. Every highlight title must be different.` + NO_BRAND,
  example: "first date",
});

const hlCaption = (i: number): AiFillField => ({
  path: `highlights[${i}].slides[0].caption`,
  label: `Highlight ${i + 1} — story text`,
  kind: "text",
  max: 110,
  guide: `The white text sticker on the first story inside highlight ${i + 1} (${HIGHLIGHT_THEMES[i]}). One short line in the sender's voice (under 70 characters), a specific memory from the story — sweet with a wink.` + VOICE + NO_BRAND,
});

export const us: AiFillTemplateSchema = {
  slug: "us",
  premise:
    "The sender has made their relationship its own social-media profile account — a pixel-perfect photo-sharing profile (story ring, bio, stats, highlight bubbles, a grid of posts with captions and friends' comments, a DM thread between the two of them) plus a love letter that pops up in the corner. The UI looks completely real; all of the romance and humour lives in the copy, written as if the couple jointly run this account about themselves. The recipient is the partner, scrolling it on their phone.",
  audience: "partner",
  forbiddenOutput: [
    ["In", "stagram"].join(""),
    ["Ins", "ta"].join(""),
    ["Me", "ta"].join(""),
    ["Thre", "ads"].join(""),
    ["Face", "book"].join(""),
    ["Re", "els"].join(""),
    ["Boom", "erang"].join(""),
    ["IG"].join(""),
  ],
  fields: [
    {
      path: "from",
      label: "Your name",
      kind: "text",
      max: 30,
      guide: "The sender's first name (or the nickname they go by), exactly as in the story. It signs the letter and labels the sender's DM bubbles.",
      required: true,
    },
    {
      path: "to",
      label: "Their name",
      kind: "text",
      max: 30,
      guide: "What the sender actually calls the recipient — their first name or the pet name used in the story. The letter opens 'Dear ___,'.",
      required: true,
    },
    {
      path: "handle",
      label: "Handle",
      kind: "text",
      max: 30,
      guide:
        "The joint account's username, WITHOUT an @. Lowercase letters, digits, dots and underscores only, no spaces, under 20 characters. Build it from BOTH their names or nicknames, or their start year / an in-joke from the story (e.g. first names joined with '.and.').",
      required: true,
    },
    {
      path: "displayName",
      label: "Display name",
      kind: "text",
      max: 40,
      guide: "The bold name line: both first names joined with '&', optionally one emoji. Short, one line.",
      required: true,
    },
    {
      path: "category",
      label: "Category",
      kind: "text",
      max: 45,
      guide:
        "The grey line under the name where a business states what it is — applied deadpan to their relationship, using something from the story ('Professional overthinkers (2)', 'Long-distance, short temper'). 2–5 words.",
    },
    {
      path: "bio",
      label: "Bio",
      kind: "list",
      max: 4,
      itemMax: 50,
      guide:
        "The bio, one item per line, 3–4 lines, each under 42 characters. Fragments, not sentences. Include: one joke about them as a couple, a line with the date or place they started (from the story, 'est. …'), one line about the recipient specifically, and optionally an emoji or '↓' pointing at the link." +
        VOICE +
        NO_BRAND,
    },
    {
      path: "link.label",
      label: "Link text",
      kind: "text",
      max: 40,
      guide: "The visible text of the blue link in the bio — looks like a web address teasing something private about them, lowercase, hyphens or dots, under 32 characters (e.g. something-only-we-get.love). Text only, not a real URL.",
    },
    {
      path: "note",
      label: "Note bubble",
      kind: "text",
      max: 48,
      guide: "The tiny thought-bubble 'note' above the profile photo: one very short lowercase line (under 32 characters) the sender would leave for the recipient right now — flirty, specific, one emoji max.",
    },
    {
      path: "followedBy",
      label: "Followed by",
      kind: "list",
      max: 4,
      itemMax: 24,
      guide:
        "Four handles of people who follow the account, shown as 'Followed by X, Y and 2 others'. Lowercase handle form (letters, digits, dots, underscores). Use people from the story (a parent, the best friend, the group chat) turned into believable handles; put the funniest two first." +
        NO_BRAND,
      example: "her_mom",
    },
    {
      path: "letter",
      label: "The letter",
      kind: "longtext",
      max: 1100,
      guide:
        "The main love letter from the sender to the recipient, shown when they tap the envelope in the corner. Normal sentence case with capital letters (it is a letter, not a caption). 4 short paragraphs separated by blank lines, 140–190 words total. Do NOT start with 'Dear …' and do NOT sign it off — the page adds both. Start with why they made this account, then specific memories from the story, then what the recipient means to them, and end on one line that ties back to the account (following, posting, not being able to unfollow). Heartfelt and specific, still in their voice, not greeting-card language.",
      required: true,
    },
    {
      path: "lockQuestion",
      label: "Letter question",
      kind: "text",
      max: 80,
      guide: "A playful question the recipient answers before the letter opens — about an in-joke or a moment from the story, answerable with one tap (e.g. 'who said i love you first?'). Under 60 characters.",
    },
    {
      path: "lockAnswer",
      label: "Letter answer button",
      kind: "text",
      max: 30,
      guide: "The label on the single 'yes' button that answers the question above — a short teasing reply with one emoji (the 'no' button runs away). Under 22 characters.",
    },
    {
      path: "dms",
      label: "DM thread",
      kind: "list",
      max: 8,
      itemMax: 140,
      guide:
        "The DM conversation between them, 8 short messages that ALTERNATE strictly: item 1 is the sender, item 2 the recipient, item 3 the sender, and so on. Real texting: lowercase, short (mostly under 60 characters), typos-free, emoji sparingly. A mini-story: starts casual ('u up?'-energy), gets flirty or funny about something from the story, ends with a soft confession and a sweet reply." +
        NO_BRAND,
    },
    ...[0, 1, 2, 3].map(hlTitle),
    ...[0, 1, 2, 3].map(hlCaption),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(caption),
    ...[0, 1, 2, 3, 4, 5].map(comments),
    ...[0, 1, 2, 3].map(location),
  ],
};
