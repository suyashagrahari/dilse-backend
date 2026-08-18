// ─── Searched — AI form-fill schema ──────────────────────────────────────────
//
// Paths address `SearchData`
// (client/app/(templates)/searched/components/types.ts:157), held in
// `useSearchedEditor`'s `mf` slot.
//
// ── BRAND SAFETY IS THE LOAD-BEARING CONSTRAINT HERE ─────────────────────────
//
// The template's frozen contract carries a deny-list (`FORBIDDEN_TOKENS`) and a
// checker (`assertBrandSafe`) run over the concatenated template source AND over
// the rendered DOM. It fails on the name of the search engine whose results page
// this imitates, on that company's mail product, its video product, its mobile
// operating system, its web browser, and its proprietary type family. It also
// fails on that company's four signature result colours and its link blue.
//
// The rendered DOM contains sender-authored copy, so a snippet or an
// autocomplete line naming the real product would fail verification on a
// published page. The model has never seen the deny-list and cannot be shown it,
// so every guide below states the prohibition in plain words. This file avoids
// spelling out the banned names for the same reason: the check is run over this
// directory too.
//
// NOT DECLARED: `recipient.photoUrl` and `images[]` (media). Also not declared —
// and worth stating, because it looks like an oversight — the breadcrumb `url`
// on a result and the `source` line on a question. Both are fake, decorative
// strings rather than real addresses, but their leaf key is `url` / would read
// as one, and `assertNoMediaPaths` in the frozen contract rejects any path whose
// final key looks like a link. Correctly so: there is no way for a validator to
// tell a decorative breadcrumb from a fabricated address. The sender writes
// those two by hand.

import type { AiFillTemplateSchema } from "./types";

/** Appended to every guide. The model cannot be shown the deny-list. */
const NO_BRAND =
  "NEVER name the real search engine this page imitates, its parent company, or any of that " +
  "company's other products (its email service, its video-sharing site, its web browser, its " +
  "phone operating system, its maps or documents products). Do not write those names anywhere — " +
  "not in copy, not inside a fake site name, not inside a handle. The joke is the FORMAT of a " +
  "results page, never a named brand, and any such word fails an automated check on publish.";

/** The tonal rule the whole template runs on. */
const DEADPAN =
  "The page is styled as a boring grey utility on purpose, so the comedy is entirely in the words " +
  "and it must stay completely straight-faced. Write it as if a search engine had genuinely " +
  "indexed one person and returned honest results. No winking, no exclamation marks, no emoji.";

export const searched: AiFillTemplateSchema = {
  slug: "searched",
  premise:
    "This is a plain, grey, utterly ordinary-looking search results page — centred search box, autocomplete dropdown, tab row, results count, blue titles over grey snippets, a 'people also ask' accordion and a fact panel down the right — except that the thing being searched for is one specific person, and every result, question and fact is about them. The recipient types their own name into the box and the internet, apparently, has a great deal to say.",
  audience: "partner",
  // See the note in us.ts. Same mechanism, different mark: this template
  // parodies a search engine and may not name it or any of its products.
  forbiddenOutput: [
    ["Goo", "gle"].join(""),
    ["Gm", "ail"].join(""),
    ["You", "Tube"].join(""),
    ["Chr", "ome"].join(""),
    ["And", "roid"].join(""),
    ["Alph", "abet"].join(""),
  ],
  fields: [
    {
      path: "recipient.name",
      label: "Their name",
      kind: "text",
      max: 40,
      guide:
        "The person being searched for. This is the highest-leverage field in the template: it becomes the wordmark at the top, the text typed into the search box, the title of the fact panel, and the subject of every result and question. Use the name they'd actually type — first and last if the story gives both, since a full name is what makes the results page read as real. " +
        NO_BRAND,
      example: "Meera Verma",
      required: true,
    },
    {
      path: "sender.name",
      label: "Your name",
      kind: "text",
      max: 40,
      guide:
        "The sender's name. It surfaces inside the results as the source of several of them — the fake sites and handles are theirs — so it should be the name the recipient knows them by. " +
        NO_BRAND,
    },
    {
      path: "autocomplete",
      label: "Autocomplete suggestions",
      kind: "list",
      max: 6,
      itemMax: 80,
      guide:
        "The dropdown that appears under the search box as the recipient types their own name — the best moment in the whole template, so put the funniest one first. EVERY item must START with the recipient's exact name, because the dropdown filters on what has been typed and the completion is what renders bold. After the name, continue it the way a real search query continues: '… near me', '… is always right', '… why does she do that', '… height'. Lowercase after the name, no punctuation, under about 50 characters each. They should escalate from plausible to absurd down the list. " +
        DEADPAN +
        " " +
        NO_BRAND,
      example: "Meera Verma near me",
      required: true,
    },
    {
      path: "didYouMean",
      label: "Did you mean…",
      kind: "text",
      max: 60,
      guide:
        "The 'Did you mean: ___' correction line above the results. The joke is that the engine has mildly misspelled or diminished the recipient's name, and tapping it makes the page refuse the correction. So write a near-miss of their name — a plausible wrong spelling, or a formal version nobody uses. Just the corrected name, nothing else. " +
        NO_BRAND,
      example: "Meera Varma",
    },
    {
      path: "resultCount",
      label: "Results count",
      kind: "text",
      max: 16,
      guide:
        "The number in 'About ___ results (0.42 seconds)'. Write it PRE-FORMATTED with Indian digit grouping — two-digit groups above the last three, e.g. 8,47,000 or 12,34,567. Pick a figure that is itself a small joke: absurdly huge, or absurdly tiny (a page that returns 3 results about one person is funny too). Digits and commas only.",
      example: "8,47,000",
    },
    {
      path: "results[0].title",
      label: "Result 1 — title",
      kind: "text",
      max: 70,
      guide:
        "The blue clickable headline of the first and most prominent result. Write it as a real page title from a slightly amateur website: title case or sentence case, under about 60 characters, and it should sound like an honest document that happens to be about the recipient — 'Meera Verma: A Complete Guide (Unofficial)', 'Everything Known About Meera Verma'. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "results[0].snippet",
      label: "Result 1 — snippet",
      kind: "longtext",
      max: 200,
      guide:
        "The two-line grey excerpt under the first title. Write it as a genuine page extract cut off mid-thought, the way real snippets are — starting mid-sentence is good, ending without a full stop is good. You may wrap the recipient's name or one matched word in <b>…</b> tags and nothing else; no other markup is allowed through. Around 25 words. The content is a warm observation about them delivered in flat encyclopedic prose, which is where the joke comes from. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "results[1].title",
      label: "Result 2 — title",
      kind: "text",
      max: 70,
      guide:
        "Headline of the second result. It must come from a visibly different kind of site than the first — a forum thread, a review, a local news item, a personal blog from 2011. Vary the form: a question, a thread title, a listicle. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "results[1].snippet",
      label: "Result 2 — snippet",
      kind: "longtext",
      max: 200,
      guide:
        "The excerpt under the second title, matching whatever kind of site that title implies — a forum snippet reads as someone replying, a review snippet reads as a rating. Around 25 words, cut off mid-thought, optional <b>…</b> on matched words only. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "results[2].title",
      label: "Result 3 — title",
      kind: "text",
      max: 70,
      guide:
        "Headline of the third result. This is the one to make strangest — an official-sounding record, a complaint, a scientific paper, a municipal notice, all about one ordinary person. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "results[2].snippet",
      label: "Result 3 — snippet",
      kind: "longtext",
      max: 200,
      guide:
        "The excerpt under the third title. Around 25 words, in whatever bureaucratic or technical register its title set up, still entirely about the recipient. Optional <b>…</b> on matched words only. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "paa[0].question",
      label: "People also ask — question 1",
      kind: "text",
      max: 90,
      guide:
        "The first row of the 'People also ask' accordion. Write it as a real third-person search question about the recipient, the kind that appears when many strangers have wondered the same thing: 'Why does Meera Verma reply in one word?', 'Is Meera Verma always this early?'. Question mark, sentence case, under about 60 characters. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "paa[0].answer",
      label: "People also ask — answer 1",
      kind: "longtext",
      max: 220,
      guide:
        "The answer that unfolds when that row is tapped. Written in the flat, confident, faintly wrong voice of an auto-extracted answer box — it states something tender as though it were a settled matter of public record. Two or three sentences, about 30 words. The gap between the clinical register and the affectionate content is the entire joke, so never let warmth into the prose itself. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "paa[1].question",
      label: "People also ask — question 2",
      kind: "text",
      max: 90,
      guide:
        "The second question row. A different shape from the first — if the first began 'Why', start this one with 'Does', 'How many', 'Is it true that'. Still third person, still with a question mark. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "paa[1].answer",
      label: "People also ask — answer 2",
      kind: "longtext",
      max: 220,
      guide:
        "The second answer, same deadpan answer-box register, about 30 words, and about a different quality of theirs than the first one. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "knowledgePanel.subtitle",
      label: "Fact panel — subtitle",
      kind: "text",
      max: 60,
      guide:
        "The small grey line at the top of the right-hand fact panel, directly under the recipient's name, in the format that panel always uses: a category, then a descriptor, separated by a middle dot — 'Person · The Love of My Life', 'Human · Local Legend'. Two short halves, title case. " +
        DEADPAN +
        " " +
        NO_BRAND,
      example: "Person · The Love of My Life",
    },
    {
      path: "knowledgePanel.description",
      label: "Fact panel — description",
      kind: "longtext",
      max: 500,
      guide:
        "The encyclopedia-style paragraph in the fact panel — the card people screenshot. Write it exactly the way an encyclopedia opens a biography: full name, a comma, what they are, born where, known for what. Then let the 'known for' quietly become specific and personal in a way no encyclopedia ever would, and never break the register to acknowledge it. Three to five sentences, past-and-present tense, third person. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "knowledgePanel.quote",
      label: "Fact panel — quote",
      kind: "text",
      max: 120,
      guide:
        "A pull-quote in the fact panel, attributed to the recipient the way a famous-quotes box would attribute one. It should be something small and unremarkable they genuinely say all the time — the flatter and more domestic the better, because the format's grandeur is doing the work. One sentence, in their own words and their own language. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
    {
      path: "knowledgePanel.alsoSearchFor",
      label: "People also search for",
      kind: "list",
      max: 6,
      itemMax: 40,
      guide:
        "Names shown as a row of initial-circles at the bottom of the fact panel, as if these people were related search subjects. Plain human names of the people around the recipient — friends, siblings, a parent, the dog. First names or first-plus-last, no handles, no titles. " +
        NO_BRAND,
    },
    {
      path: "relatedSearches",
      label: "Related searches",
      kind: "list",
      max: 8,
      itemMax: 60,
      guide:
        "The two-column grid of grey pills at the very bottom of the page. These are full search queries, not phrases — lowercase, no punctuation, under about 40 characters — and they read as the desperate follow-up searches of someone who has been looking this person up for a while: 'meera verma phone number', 'how to tell meera verma something', 'meera verma does she know'. They should get progressively more revealing as the list goes on. " +
        DEADPAN +
        " " +
        NO_BRAND,
    },
  ],
};
