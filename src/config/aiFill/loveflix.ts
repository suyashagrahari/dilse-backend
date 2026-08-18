// ─── AI fill — loveflix ──────────────────────────────────────────────────────
//
// Paths address `mf: LoveflixData` in
// client/app/(templates)/loveflix/hooks/useLoveflixEditor.ts, declared in
// client/app/(templates)/loveflix/components/types.ts:97.
//
//   rows: Row[]            — types.ts:112. Array of OBJECTS; each Row has
//                            `title`, `kind` and `items: RowItem[]`
//                            (types.ts:59), so a card is addressed
//                            `rows[0].items[2].caption`. Neither level is a
//                            string[], so neither may be declared as a `list`.
//   credits: Credit[]      — types.ts:118. Array of {role, name} objects;
//                            only the `name` half of two fixed roles is filled.
//   scenes / startSceneId  — a validated branching scene graph. Not filled; see
//                            the note at the end.
//   *ImageUrl              — media. Never declared. (Rule 1.)
//
// BRAND SAFETY, and it is not a preference: this template borrows the LAYOUT
// of a streaming service and no one's identity. The incumbent's name, its red,
// and its wordmark appear nowhere in this file, and `assertBrandSafe()` in
// types.ts:307 scans the saved data for them at mount. Every guide below tells
// the model the same thing.

import type { AiFillTemplateSchema } from "./types";

/** Card titles clamp to a single line in the rail (RowRail.tsx:122). */
const CARD_TITLE = 34;
/** Card captions clamp to two lines (RowRail.tsx:98). */
const CARD_CAPTION = 90;

export const loveflix: AiFillTemplateSchema = {
  slug: "loveflix",
  premise:
    "This page is a parody streaming service whose entire catalogue is one couple: a profile-picker, a dark browse grid, a hero banner with a match percentage, rows of 'shows' that are really their own moments, and one interactive episode that ends in a credits roll. You are writing the catalogue — show titles, taglines and the one-line descriptions under each card — as if their relationship had been commissioned, rated and put on a home screen. Never name a real streaming service, never invent one that sounds like an existing brand, and never mention a real film, series or platform by name; everything on this service is theirs.",
  audience: "partner",
  // A streaming-service parody, so no real service may be named.
  forbiddenOutput: [
    ["Net", "flix"].join(""),
    ["Pri", "me Video"].join(""),
    ["Hot", "star"].join(""),
    ["Dis", "ney"].join(""),
    ["H", "BO"].join(""),
    ["Hu", "lu"].join(""),
  ],
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The name of the person this service was made for — it appears on the profile-picker tile they have to choose before anything opens. First name or pet name, as the sender actually says it.",
      example: "Aditi",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The sender's name — the second profile tile on the picker, the one that is locked and says 'not you.' when tapped. First name only.",
      example: "Rohan",
    },
    {
      path: "showTitle",
      label: "The show's title",
      kind: "text",
      max: 28,
      required: true,
      guide:
        "The name of the series their relationship would be released under, set in enormous display type across the hero. One to three words, the shorter the better — prestige-drama brevity, not a rom-com title. It should read as a real title card, and it must not echo the name of any actual show or platform.",
      example: "US",
    },
    {
      path: "tagline",
      label: "The hero blurb",
      kind: "text",
      max: 120,
      required: true,
      guide:
        "The catalogue description under the title, written in the flat third-person voice of a synopsis that has been slightly betrayed by whoever wrote it. Two or three clipped sentences, under 120 characters total — it clamps to two lines. Describe the two of them as if they were characters, name one specific unresolved thing between them, and land it dry rather than sweet.",
      example:
        "Two people extremely bad at admitting anything. Three seasons. One unresolved argument about a film.",
    },
    {
      path: "rating",
      label: "Certification",
      kind: "text",
      max: 44,
      required: true,
      guide:
        "The certification chip in the hero metadata row, from an obviously invented ratings board. Format it like a real classification and then make the reason personal — the joke is the straight face. Under 44 characters, and it should use the recipient's name.",
      example: "Rated A — for Aditi only",
    },
    {
      path: "seasons",
      label: "Season count",
      kind: "text",
      max: 20,
      required: true,
      guide:
        "How long they have been together, expressed as a season count in the hero metadata row. Two or three words. Round to whole seasons — one year is one season. If the story says they are still in the early months, say so in the same register.",
      example: "3 Seasons",
    },
    {
      path: "metYear",
      label: "Year of release",
      kind: "text",
      max: 4,
      guide:
        "The year they met, as a four-digit number and nothing else — no words, no month, no punctuation. It sits in the hero metadata row where a release year would be. Leave it empty if the story never says when they met.",
      example: "2023",
    },

    // ── One complete rail. Filling a row's title without its cards would leave
    //    someone else's cards under their heading, so the row is done whole.
    {
      path: "rows[0].title",
      label: "First rail heading",
      kind: "text",
      max: 48,
      required: true,
      guide:
        "The heading above the first horizontal row of cards, written in the voice of an algorithmic shelf label that has been quietly personalised. Three to six words, title case. Keep the borrowed grammar of a recommendation row ('Continue Watching…', 'Because You Watched…', 'Trending In…') without naming any real service, and finish it with them.",
      example: "Continue Watching Us",
    },
    {
      path: "rows[0].items[0].title",
      label: "Card 1 — title",
      kind: "text",
      max: CARD_TITLE,
      required: true,
      guide:
        "The title of the first show on the shelf: one specific moment from their life, named the way an episode would be. Two to four words, Title Case, definite article encouraged. It clamps to one line, so stay under 34 characters. Make this one a place or an arrival — the moment something started.",
      example: "The Airport",
    },
    {
      path: "rows[0].items[0].caption",
      label: "Card 1 — description",
      kind: "text",
      max: CARD_CAPTION,
      required: true,
      guide:
        "The one-line description that appears under that card, written to her in the second person rather than as a synopsis. One sentence or two fragments, under 90 characters — it clamps to two lines. Dry, specific, and it should assume she already knows exactly which day this was.",
      example: "You ran. I have never recovered.",
    },
    {
      path: "rows[0].items[1].title",
      label: "Card 2 — title",
      kind: "text",
      max: CARD_TITLE,
      required: true,
      guide:
        "The title of the second show: a long night the two of them got through — a power cut, a delay, a drive, a hospital waiting room. Two to four words, Title Case, under 34 characters.",
      example: "The Power Cut",
    },
    {
      path: "rows[0].items[1].caption",
      label: "Card 2 — description",
      kind: "text",
      max: CARD_CAPTION,
      required: true,
      guide:
        "One line under that card, second person, under 90 characters. Give the concrete detail of that night — the hour, the object, the thing that was finally said — rather than how it felt.",
      example: "Four hours, no phones, one very long conversation.",
    },
    {
      path: "rows[0].items[2].title",
      label: "Card 3 — title",
      kind: "text",
      max: CARD_TITLE,
      required: true,
      guide:
        "The title of the third show: something small, domestic and slightly ridiculous they have done together more than once — a meal, a habit, a route. Two to four words, Title Case, under 34 characters.",
      example: "2 AM Maggi",
    },
    {
      path: "rows[0].items[2].caption",
      label: "Card 3 — description",
      kind: "text",
      max: CARD_CAPTION,
      required: true,
      guide:
        "One line under that card, under 90 characters. Three fragments separated by full stops works well here. Let it be unglamorous on purpose — the joke is that this is the most-watched thing on the service.",
      example: "Half-cooked. On the floor. Perfect.",
    },
    {
      path: "rows[0].items[3].title",
      label: "Card 4 — title",
      kind: "text",
      max: CARD_TITLE,
      required: true,
      guide:
        "The title of the fourth show: the running argument or the joke they have never settled. Two to five words, Title Case, under 34 characters — it should read as a series that is still in production.",
      example: "The Argument About The Film",
    },
    {
      path: "rows[0].items[3].caption",
      label: "Card 4 — description",
      kind: "text",
      max: CARD_CAPTION,
      required: true,
      guide:
        "One line under that card, under 90 characters, written like a status note from the catalogue rather than a sentence — the shortest possible way to say this is unresolved and nobody minds.",
      example: "Ongoing. Season 3.",
    },

    {
      path: "finaleText",
      label: "The finale",
      kind: "longtext",
      max: 600,
      required: true,
      guide:
        "The text that plays over the last scene of the interactive episode, after every branch has converged. Three short paragraphs, separated by blank lines, under 600 characters in total — the renderer reveals it a line at a time, so short lines land better than long ones. It has to work no matter which choices she made: say that every version of the story ended in the same place, and that this was not an accident. Drop the catalogue voice entirely here and speak plainly. Nothing that obliges her to reply.",
      example:
        "Whatever you picked, we ended up here.\n\nThat's not a bug in the writing.\n\nI'd take every version of this.",
    },
    {
      path: "finaleQuestion",
      label: "The button after the finale",
      kind: "text",
      max: 32,
      guide:
        "The label on the single button that appears once the finale text has settled — the last thing on the screen before the credits roll. Two to four words, lowercase, quiet. It should sound like something said into a silence, not a call to action, and it must not demand an answer.",
      example: "still here?",
    },
    {
      path: "credits[2].name",
      label: "Credit — Cinematography",
      kind: "text",
      max: 32,
      guide:
        "The credit given for CINEMATOGRAPHY in the end-credits scroll — the role is already printed, you are writing only what follows it. Name the thing that actually took all their photographs. Two to four words, lowercase, deadpan.",
      example: "her front camera",
    },
    {
      path: "credits[5].name",
      label: "Credit — Based on",
      kind: "text",
      max: 40,
      guide:
        "The credit given for BASED ON in the end-credits scroll — the role is already printed, you are writing only what follows it. The best version names one small, unlikely real event from their story instead of saying 'a true story'. Under 40 characters, lowercase, deadpan.",
      example: "an argument about parking, 2021",
    },
  ],
};

// Left out on purpose:
//
//   scenes[] / startSceneId — the interactive episode is a branching graph that
//     is structurally validated at load (types.ts:181): every non-finale scene
//     needs exactly two choices, every nextSceneId must resolve, no cycles, and
//     all branches must converge on the finale. Filling narration into a graph
//     the model cannot see the shape of produces either an incoherent story or
//     a dead end that renders a blank screen. The sender edits it scene by scene
//     in the sheet, which is the only place the graph is visible.
//   rows[1] … rows[3] — a twenty-field budget buys exactly one complete rail.
//     A renamed heading over cards nobody wrote is worse than an untouched row.
//   matchPercent — a number with a slider in the editor.
//   credits[n].role — the roles are the fixed comic frame; the joke is what is
//     credited to them, not that the role changed.
//   heroImageUrl, senderPhotoUrl, recipientPhotoUrl — media.
