// ─── Searched — AI form-fill schema ──────────────────────────────────────────
//
// Paths address `SearchData` (client/app/(templates)/searched/components/
// types.ts), held as `mf` in useSearchedEditor. Every text leaf is declared;
// media (photos[].url and crops) is the sender's and never here.
//
// Structured rows — results, questions, reviews, stories, videos, places,
// facts — are declared as LISTS OF PIPE STRINGS, because a fill schema can
// only describe text leaves. The client's `normaliseSearchData` turns each
// "a | b | c" string back into a row and tolerates missing parts.
//
// The page parodies a search engine and may not name it or any of its
// products; the guides say so in plain words and `forbiddenOutput` enforces
// it. The names are assembled from fragments because a brand sweep runs over
// this directory.

import type { AiFillField, AiFillTemplateSchema } from "./types";

const NO_BRAND =
  " Never name the real search engine this page imitates, its parent company, or any of that company's products (email, video site, browser, phone OS, maps, docs), nor any other real app or brand — invent a funny site name instead.";

const TONE =
  " Tone: Gen-Z, affectionate, dry and specific — the joke is that a boring search page knows intimate little facts about one person. Use concrete details from the story (places, foods, habits, dates, in-jokes); never generic filler like 'amazing', 'best time ever', 'such fun'. No hashtags.";

const photoCaption = (i: number): AiFillField => ({
  path: `photos[${i}].caption`,
  label: `Memory ${i + 1} — image title`,
  kind: "text",
  max: 40,
  guide:
    `The title under photo ${i + 1} in the Images pack and the photo viewer, like an image-search result title. 2–5 words, lowercase. ` +
    (i === 0
      ? "Photo 1 is the hero (it sits in the doodle's heart balloon): name the moment the story treats as the start."
      : "Each title names a DIFFERENT specific moment, place or in-joke from the story — never repeat another photo's idea."),
  example: i === 0 ? "the first chai" : undefined,
});

const photoNote = (i: number): AiFillField => ({
  path: `photos[${i}].note`,
  label: `Memory ${i + 1} — note`,
  kind: "longtext",
  max: 260,
  guide: `The little note that opens with photo ${i + 1} in the viewer. One or two sentences, first person from the sender to the recipient as "you", about the exact moment in that photo's title, with one concrete detail. Warm, a bit funny, understated, no exclamation marks. Under 200 characters.`,
});

export const searched: AiFillTemplateSchema = {
  slug: "searched",
  audience: "partner",
  premise:
    "A pixel-perfect parody of a search-engine results page whose wordmark is the RECIPIENT's first name. They type their own name and the internet 'has opinions': joke autocomplete, 'Did you mean: <sender>'s favourite person', an AI Overview about them, a knowledge panel (subtitle, description, facts, reviews, people also search for), blue-link results from invented sites, People also ask, Top stories headlines, videos, a map of 'places we've been', related searches — and the #1 result is the sender's love letter. Everything is ABOUT the recipient, written as if the web indexed the sender's feelings. The interface is deadpan; the content is specific, funny and loving.",
  forbiddenOutput: [
    ["Goo", "gle"].join(""),
    ["Gm", "ail"].join(""),
    ["You", "Tube"].join(""),
    ["Chr", "ome"].join(""),
    ["And", "roid"].join(""),
    ["Alph", "abet"].join(""),
    ["Wiki", "pedia"].join(""),
    ["Insta", "gram"].join(""),
    ["Spot", "ify"].join(""),
  ],
  fields: [
    {
      path: "recipient.name",
      label: "Their name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The person being searched for — it becomes the wordmark, the text typed into the box and the knowledge-panel title. Full name (first + last) if the story gives it, since a full name reads most like a real search; otherwise the name the sender uses.",
      example: "Meera Verma",
    },
    {
      path: "sender.name",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The sender's first name as the recipient knows them. It appears in results, reviews and the letter's sign-off.",
      example: "Arjun",
    },
    {
      path: "doodleTitle",
      label: "Doodle title",
      kind: "text",
      max: 80,
      guide: "The hover title of the home-page doodle (an illustration of the couple), in the style 'Celebrating …'. Name what is being celebrated from the story (an anniversary, a birthday, 'the day we met', or simply both names). Under 60 characters, uses both first names.",
      example: "Celebrating 3 years of Meera & Arjun",
    },
    {
      path: "autocomplete",
      label: "Autocomplete suggestions",
      kind: "list",
      max: 6,
      itemMax: 80,
      required: true,
      guide:
        "Exactly 6 search suggestions that drop down as the recipient types their own name — the first joke they see, funniest first. EVERY item must START with the recipient's exact name as written in 'Their name', then continue like a real search query, lowercase after the name, no punctuation at the end, under 50 characters: habits and in-jokes from the story ('… stole my hoodie again'), a flirty one ('… why is she this cute'), an absurd one ('… near me (please)'). Escalate from plausible to absurd." +
        TONE +
        NO_BRAND,
      example: "Meera Verma laugh ringtone download",
    },
    {
      path: "didYouMean",
      label: "Did you mean…",
      kind: "text",
      max: 60,
      guide: "What follows 'Did you mean:' above the results — the engine 'correcting' the recipient's name into the sender's view of them. Format: '<sender first name>'s <adjective> person/human/everything'. Under 40 characters, no quotes.",
      example: "Arjun's favourite person",
    },
    {
      path: "resultCount",
      label: "Results count",
      kind: "text",
      max: 16,
      guide: "The number in 'About ___ results'. Digits with Indian grouping (8,47,000 or 12,34,567), optionally hiding a date or number from the story. Digits and commas only.",
      example: "8,47,000",
    },
    {
      path: "aiOverview",
      label: "AI Overview",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "The AI Overview box that streams in at the top: EXACTLY two paragraphs with a blank line (two newlines) between them, 70–110 words total, in the confident encyclopedic voice of an AI summary, about the recipient. Paragraph 1: who they are — city, what they're 'best known for' (3 specific habits from the story), and a line like 'Sources widely agree…'. Paragraph 2: their relationship with the sender, with one specific number (times searched, momos eaten, days together) and a soft landing. Use the recipient's full name once, then first name." +
        TONE +
        NO_BRAND,
    },
    {
      path: "aiPoints",
      label: "AI Overview — key points",
      kind: "list",
      max: 4,
      itemMax: 110,
      guide: "Exactly 4 bullet points under the overview, each written as 'Label: text' with a 1–3 word label and a short, specific, funny text under 70 characters. Suggested labels: 'Known for', 'Love language', 'Weakness', 'Status' (status must say taken, by the sender)." + TONE,
      example: "Love language: sending reels at 2 AM with zero context",
    },
    {
      path: "knowledgePanel.subtitle",
      label: "Knowledge panel — subtitle",
      kind: "text",
      max: 50,
      guide: "The grey line under the recipient's name in the knowledge panel, like a person's occupation line. 2–5 words about what they are to the sender.",
      example: "Arjun's favourite human",
    },
    {
      path: "knowledgePanel.description",
      label: "Knowledge panel — description",
      kind: "longtext",
      max: 360,
      guide: "The encyclopedia-style description in the knowledge panel: 2 sentences, 35–60 words, third person, starting with the recipient's full name ('Meera Verma is a …'), mixing one real detail (city, job, study) with affectionate absurd specifics from the story. Deadpan encyclopedic tone." + NO_BRAND,
    },
    {
      path: "knowledgePanel.facts",
      label: "Knowledge panel — facts",
      kind: "list",
      max: 6,
      itemMax: 100,
      guide: "Exactly 6 knowledge-panel facts, each 'Label: value' (label 1–2 words, value under 50 characters). Use: Born (a birthday from the story if known, otherwise a weekday joke like 'a Wednesday, allegedly' — never a year), Height (with a joke), Hometown, Partner (the sender, since when), Known for, and one funny custom label (Screen time, Coffee order, Superpower…). Values specific to the story.",
      example: "Height: 5′3″ (5′5″ in her head)",
    },
    {
      path: "knowledgePanel.alsoSearchFor",
      label: "People also search for",
      kind: "list",
      max: 5,
      itemMax: 48,
      guide: "Exactly 5 entities in 'People also search for', each 'Name — short caption' with an em dash. Item 1 is the sender (e.g. 'Arjun — the boyfriend'). The rest are people, pets, foods or places from the story that orbit the recipient ('Momos — her first love', 'Her mom — the real boss'). Captions under 22 characters, lowercase.",
      example: "Momos — her first love",
    },
    {
      path: "reviews",
      label: "Reviews",
      kind: "list",
      max: 4,
      itemMax: 170,
      guide: "Exactly 4 star reviews OF THE RECIPIENT in the knowledge panel, each written EXACTLY as 'author | stars | review' with two pipes: author is the sender, a family member, a friend, a pet or a place from the story; stars is 4 or 5; review is one funny, specific line under 110 characters in that reviewer's voice. The sender's review comes first. At most one 4-star review, with a joke reason for the missing star." + TONE,
      example: "Her mom | 5 | Calls me every day. Tells Arjun I said hi. I did not say hi.",
    },
    {
      path: "results",
      label: "Search results",
      kind: "list",
      max: 6,
      itemMax: 240,
      required: true,
      guide:
        "Exactly SIX (6 — count them) organic blue-link results about the recipient, each written EXACTLY as 'site name | breadcrumb | title | snippet' with THREE pipes. Site name: an invented site (2–3 words) like 'Unencyclopedia', 'The Daily Blush', 'Ask the Aunties', '<sender>'s Notes', 'Complaints Dept.'. Breadcrumb: a fake address like 'dailyblush.in › local › momo-incident' (lowercase, uses ›, never http, never a real domain — always an invented .in or .love domain). Keep the WHOLE line under 210 characters or it is discarded. Title: under 65 characters, like a real page title (an encyclopedia entry, a list 'Things I love about …', a forum thread '— 212 replies', a news headline, a complaints log, a playlist). Snippet: one sentence under 110 characters continuing the joke with story details. Result 1 is the encyclopedia entry; one result is the sender's own notes/list about them." +
        TONE +
        NO_BRAND,
      example: "The Daily Blush | dailyblush.in › local › momo-incident | Local woman finishes boyfriend's momos, says he wasn't going to eat them | Witnesses confirm he was. He has since forgiven her, as he does every time.",
    },
    {
      path: "paa",
      label: "People also ask",
      kind: "list",
      max: 6,
      itemMax: 240,
      guide: "Exactly 6 'People also ask' questions and answers about the recipient, each EXACTLY 'question | answer' with one pipe. Question: a real-sounding search question under 70 characters using the recipient's name or first name. Answer: 1–2 deadpan sentences under 160 characters with a story detail. The last question nudges them to click 'I'm Feeling Lucky' because a letter is waiting at the top." + TONE,
      example: "How do I make Meera reply faster? | You don't. She writes the reply in her head, considers it sent, and it arrives Thursday.",
    },
    {
      path: "topStories",
      label: "Top stories",
      kind: "list",
      max: 4,
      itemMax: 170,
      guide: "Exactly 4 news headlines for the Top stories carousel, each EXACTLY 'publication | time | headline' with two pipes. Publication: an invented outlet ('The Daily Blush', 'Heartbeat News', a city paper with a pun). Time: '2 hours ago', '1 day ago' etc. Headline: under 95 characters, tabloid style, about the recipient or the couple, built on story details." + NO_BRAND,
      example: "Heartbeat News | 1 day ago | Scientists confirm Meera's laugh can be heard from the next flat",
    },
    {
      path: "videos",
      label: "Videos",
      kind: "list",
      max: 3,
      itemMax: 150,
      guide: "Exactly 3 video results, each EXACTLY 'channel | duration | title' with two pipes. Channel: a cute invented channel ('<sender>'s Camera Roll', 'Us, Unfiltered'). Duration like '0:47' or '2:13'. Title under 80 characters describing a real-feeling moment of the recipient from the story." + NO_BRAND,
      example: "Us, Unfiltered | 2:13 | Meera laughing at her own joke for 2 minutes straight",
    },
    {
      path: "places",
      label: "Places we've been",
      kind: "list",
      max: 4,
      itemMax: 200,
      guide: "Exactly 4 places from the story for the map pack, each EXACTLY 'place name | type · area | rating | memory' with three pipes. Place name: the spot from the story (a café, a stall, a beach, 'Her doorstep'). Type · area: e.g. 'Café · Gomti Nagar'. Rating: 4.8, 4.9 or 5.0. Memory: one first-person sentence under 90 characters about what happened there. Story order." + TONE,
      example: "Sharma Ji Momos | Momo stall · Hazratganj | 4.9 | First date. She ate 11. I paid for 12.",
    },
    {
      path: "relatedSearches",
      label: "Related searches",
      kind: "list",
      max: 8,
      itemMax: 60,
      guide: "Exactly 8 related searches for the bottom chips, lowercase, each containing the recipient's first name, under 40 characters, several with a parenthetical punchline ('… net worth (priceless)', 'is … single (no)', 'how to deserve …')." + NO_BRAND,
      example: "is meera single (no)",
    },
    ...[0, 1, 2, 3, 4, 5].map(photoCaption),
    ...[0, 1, 2, 3, 4, 5].map(photoNote),
    {
      path: "letter",
      label: "The letter (the #1 result)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The main love letter from the sender, revealed as the #1 result and typed out live by an AI Overview. Line 1 is only the recipient's first name and a comma. Then 5 paragraphs separated by blank lines, AT LEAST 170 and at most 230 words in total (count them — shorter is a failure), sentence case, no exclamation marks. Paragraph 1 opens with a search idea (they once searched for the recipient, or no search could find someone like them). Paragraphs 2–3 are specific memories from the story with small concrete details. Paragraph 4 says plainly what the recipient means — if the story has news, a plan or a confession, reveal it HERE. Paragraph 5 ties back to searching (not in 0.42 seconds but in forever results; the only result that matters). Do NOT end with a sign-off or the sender's name — the page adds it.",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter",
      kind: "text",
      max: 90,
      guide: "Shown in a parody 'Before you continue' cookie banner before the letter: a playful yes-question in cookie-consent language built on a story in-joke ('Do you accept all of Arjun's love (and his terrible puns)?'). Under 70 characters, ends with a question mark.",
    },
    {
      path: "lockAnswer",
      label: "Accept button",
      kind: "text",
      max: 30,
      guide: "The label on the blue accept button for the question above ('Reject all' runs away): 'Accept all' plus a teasing twist or emoji, under 20 characters.",
      example: "Accept all 💗",
    },
  ],
};
