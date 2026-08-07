// ─── Us — AI form-fill schema ────────────────────────────────────────────────
//
// Paths address `ProfileData`
// (client/app/(templates)/us/components/types.ts:185), held in `useUsEditor`'s
// `mf` slot.
//
// ── BRAND SAFETY IS THE LOAD-BEARING CONSTRAINT HERE ─────────────────────────
//
// The template's frozen contract carries a deny-list (`FORBIDDEN_TOKENS`) and a
// checker (`assertBrandSafe`) that is run over the template source AND over the
// rendered DOM. It fails on the name of the photo-sharing app whose layout this
// parodies, on the abbreviation of that name, on its parent company, and on
// three sibling products and features of that company. It also fails on that
// company's six-stop signature colour ramp and on any CSS gradient.
//
// The rendered DOM includes sender-authored copy, which means a bio line or a
// caption naming the real app would fail verification on a published page. The
// model has never seen that deny-list and cannot be shown it — so every guide
// below states the prohibition in plain words instead. This file deliberately
// does not spell out any of the banned names either; it lives in a directory the
// same check is run over.
//
// NOT DECLARED (media): `avatarUrl`, `link.url`, `posts[].imageUrl`,
// `highlights[].coverUrl`, `highlights[].slides[].imageUrl`. Captions that
// accompany those images ARE declared and are the richest fields in the
// template. `pinnedPostIds` and `posts[].id` are structural.

import type { AiFillTemplateSchema } from "./types";

/**
 * Appended to every guide. The model cannot be shown the deny-list, so the
 * prohibition is spelled out behaviourally in each field it could violate.
 */
const NO_BRAND =
  "NEVER name the real photo-sharing app this page imitates, its short/abbreviated form, its " +
  "parent company, or any of that company's other apps, products or features (its messaging app, " +
  "its short-video feed, its text-posts app, its looping-video tool, its social network). Do not " +
  "write those names, hashtags built from them, or handles built from them. The page is a parody " +
  "of the FORMAT, never of a named brand, and any such word fails an automated check on publish.";

export const us: AiFillTemplateSchema = {
  slug: "us",
  premise:
    "A relationship has been given its own social-media profile account: a plain white phone-shaped page with a handle, a bio, follower counts, story highlight bubbles and a three-column grid of posts you can tap into for captions and comments. The layout is completely straight-faced and ordinary — all of the humour lives in the copy, written as if the couple jointly run this account about themselves.",
  audience: "partner",
  fields: [
    {
      path: "handle",
      label: "Handle",
      kind: "text",
      max: 40,
      guide:
        "The account's username, shown in the top bar and under the avatar. Write it WITHOUT an @ — one is added for you. Lowercase, no spaces, underscores or dots only, under 20 characters so it doesn't truncate. It should read as a joint account for the two of them: both names smashed together, or the year they started, or an in-joke. " +
        NO_BRAND,
      example: "us_since_2023",
      required: true,
    },
    {
      path: "displayName",
      label: "Display name",
      kind: "text",
      max: 60,
      guide:
        "The bold name line above the bio. Usually just both their first names joined — the human version of the handle. Short; it sits on one line beside an 86px avatar. " +
        NO_BRAND,
      example: "Ananya & Rohan",
      required: true,
    },
    {
      path: "category",
      label: "Category",
      kind: "text",
      max: 60,
      guide:
        "The small grey line directly under the display name, where a business account states what it is. The joke is applying that bureaucratic register to a relationship: 'Domestic partnership', 'Local nuisance duo', 'Small business (unprofitable)'. Two to four words, title case, delivered completely deadpan. " +
        NO_BRAND,
      example: "Domestic partnership",
    },
    {
      path: "bio",
      label: "Bio",
      kind: "list",
      max: 6,
      itemMax: 60,
      guide:
        "The bio, one array item per rendered line. Real bios are fragments, not sentences: no capital letters needed, no full stops, under about 40 characters each. Mix registers the way people actually do — one joke, one fact, one date, maybe an arrow or a bullet. Three or four lines is right; six is the ceiling. " +
        NO_BRAND,
      example: "two idiots, one shared calendar",
    },
    {
      path: "link.label",
      label: "Link text",
      kind: "text",
      max: 80,
      guide:
        "The blue link line at the bottom of the bio — the visible text only, not an address. Real accounts put something teasing here, and the joke is that the link promises access to something private: 'the-shared-album-nobody-else-sees'. Lowercase, hyphenated, under 40 characters. " +
        NO_BRAND,
      example: "the-shared-album-nobody-else-sees",
    },
    {
      path: "stats.posts",
      label: "Posts count",
      kind: "number",
      max: 6,
      guide:
        "The number of posts, shown beside the avatar. A plausible whole number for a couple's account that has run a couple of years — a few dozen to a few hundred. Not a round number; 143 reads real, 150 reads made up.",
    },
    {
      path: "stats.followers",
      label: "Followers count",
      kind: "number",
      max: 9,
      guide:
        "The follower count. Deliberately small is the joke — this is a private account for two people, so a few hundred (family, the group chat) is far funnier than a big number. Under 10,000 renders with comma grouping; above that it abbreviates to K, which loses the joke.",
    },
    {
      path: "stats.following",
      label: "Following count",
      kind: "number",
      max: 6,
      guide:
        "How many accounts this one follows. The best answer is a very small number — 2, meaning each other and one parent — because it lands the punchline that this account only exists for them.",
    },
    {
      path: "followedBy",
      label: "Followed by",
      kind: "list",
      max: 6,
      itemMax: 30,
      guide:
        "Handles that render into the 'Followed by X, Y and 2 others' line under the bio. The first two are named in bold, so put the funniest two first. Write them as handles, not real names — lowercase, underscores or dots, the way a mother's or a friend's account would actually be named. " +
        NO_BRAND,
      example: "her_mom",
    },
    {
      path: "posts[0].caption",
      label: "Post 1 — caption",
      kind: "longtext",
      max: 400,
      guide:
        "The caption on the first post, read in the full-screen post view under the photo. Write it as a real caption: lowercase, one to three lines, a fragment rather than an essay, and funny by understatement. This is the sender narrating a shared memory to an audience of people who were also there. No hashtags. " +
        NO_BRAND,
    },
    {
      path: "posts[0].likedByName",
      label: "Post 1 — liked by",
      kind: "text",
      max: 30,
      guide:
        "One handle, which renders as 'Liked by ___ and 847 others' above the caption. Pick the handle whose presence is itself the joke — the mother, the friend who comments on everything. Lowercase handle form. " +
        NO_BRAND,
      example: "her_mom",
    },
    {
      path: "posts[0].postedAgo",
      label: "Post 1 — posted",
      kind: "text",
      max: 20,
      guide:
        "The relative timestamp under the post, written exactly the way the format writes it: '2 years ago', '11 months ago', '3 weeks ago'. Lowercase, no date. This is the OLDEST post, so it should be the furthest back of the set.",
      example: "2 years ago",
    },
    {
      path: "posts[0].location",
      label: "Post 1 — location",
      kind: "text",
      max: 40,
      guide:
        "The small grey location line in the post header. Either a real place ('Bandra, Mumbai') or a joke place tag ('some place with fairy lights', 'his mother's kitchen'). Under about 30 characters. Leave it empty if the story gives you nothing — a blank location is completely normal.",
    },
    {
      path: "posts[0].comments[0].handle",
      label: "Post 1 — first commenter",
      kind: "text",
      max: 30,
      guide:
        "The handle of whoever leaves the first comment on post one. Lowercase handle form, and it should be a recognisable character — the mother, the best friend, the group chat — so the comment lands. " +
        NO_BRAND,
      example: "her_mom",
    },
    {
      path: "posts[0].comments[0].text",
      label: "Post 1 — first comment",
      kind: "text",
      max: 120,
      guide:
        "What that person says. Comments are the funniest surface in this template because they come from OUTSIDE the couple: a mother missing the point entirely, a friend supplying a detail nobody asked for, someone dragging them affectionately. One short line, lowercase, no punctuation needed, under about 60 characters. Never sentimental — the couple is sentimental, the comments are not. " +
        NO_BRAND,
      example: "he was sweating. i have photos.",
    },
    {
      path: "posts[1].caption",
      label: "Post 2 — caption",
      kind: "longtext",
      max: 400,
      guide:
        "The caption on the second post. It must be a different kind of memory from the first — if post one was a milestone, this one is ordinary and domestic. Same register: lowercase, short, understated. " +
        NO_BRAND,
    },
    {
      path: "posts[1].location",
      label: "Post 2 — location",
      kind: "text",
      max: 40,
      guide:
        "Location tag for the second post. A joke place tag works well here. Leave empty if nothing fits.",
    },
    {
      path: "posts[2].caption",
      label: "Post 3 — caption",
      kind: "longtext",
      max: 400,
      guide:
        "The caption on the third post. By now the account has a voice — keep it consistent but change the subject again, and let this one be the shortest of the three. A two-word caption is a real and very good caption. " +
        NO_BRAND,
    },
    {
      path: "highlights[0].title",
      label: "Highlight 1 — title",
      kind: "text",
      max: 20,
      guide:
        "The label under the first story-highlight bubble. ONLY THE FIRST 10 CHARACTERS ARE SHOWN, so it must be short and must still make sense truncated. Lowercase, one or two words, naming a chapter of the relationship: 'first date', 'the arguments', 'food we ate'. " +
        NO_BRAND,
      example: "first date",
    },
    {
      path: "highlights[1].title",
      label: "Highlight 2 — title",
      kind: "text",
      max: 20,
      guide:
        "The second highlight bubble's label, same 10-character display limit. Make it a different category from the first — where the first is sweet, this one can be the running joke. " +
        NO_BRAND,
      example: "the arguments",
    },
  ],
};
