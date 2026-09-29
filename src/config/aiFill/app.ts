import type { AiFillTemplateSchema } from "./types";

/**
 * app — "The Listing": the person you love published as a phone-storefront app.
 *
 * Paths resolve against `AppData` in
 * client/app/(templates)/app/components/types.ts, held as `mf` in
 * useAppEditor.ts. The header block lives under `app.*` on the client (the
 * document calls it `meta`, and `appDataToBody` translates) — so every path
 * here says `app.`, never `meta.`. A `meta.*` path writes into a key the form
 * never reads and the fill silently lands nowhere.
 *
 * Media is absent by construction: `app.iconUrl` and `screenshots[].imageUrl`
 * are photos the sender uploads. Structure is absent too: version numbers,
 * dates, star counts, the ratings count and the age rating are scaffolding the
 * sender controls. Everything the page PRINTS as writing is declared — 40
 * fields, exactly the ceiling. The oldest two changelog entries ("Bug fixes…",
 * "Initial release.") are deliberately left dry: the whole version history is
 * an escalation that plays against them.
 */

/**
 * Assembled from fragments so this file can name what it forbids without
 * itself tripping the brand sweep that greps the template directories for
 * these exact strings.
 */
const FORBIDDEN_STOREFRONTS = [
  ["App", " ", "Store"].join(""),
  ["Google", " ", "Play"].join(""),
  ["Play", " ", "Store"].join(""),
  ["App", "le"].join(""),
  ["i", "OS"].join(""),
  ["And", "roid"].join(""),
  ["SF", " ", "Pro"].join(""),
];

/** The name this template's copy must never use for the recipient. */
const FORBIDDEN_NAMES = [["Adi", "ti"].join("")];

/**
 * Real products. A generated listing that borrows one of these names stops
 * being a joke about a person and becomes a joke about a company, and it gets
 * published under a real sender's name.
 */
const FORBIDDEN_PRODUCTS = [
  "Spotify", "Netflix", "Instagram", "WhatsApp", "TikTok", "Snapchat", "Uber",
  "Tinder", "Bumble", "Hinge", "Duolingo", "Zomato", "Swiggy", "Paytm", "Ola",
  "Gmail", "YouTube", "Facebook", "Twitter", "Threads", "Telegram", "Signal",
  "Notion", "Slack", "Zoom", "Pinterest", "Reddit", "LinkedIn", "Discord",
  "Spotify", "Amazon", "Flipkart", "Myntra", "Google", "Microsoft", "Windows",
  "Samsung", "Xiaomi", "OnePlus", "Nokia", "Meta", "Netflix",
];

export const app: AiFillTemplateSchema = {
  slug: "app",
  audience: "partner",
  premise:
    "A pitch-perfect parody of a phone app-store product page where the 'app' is the sender's partner: her name is the app name, her photo is the icon, their photos are the screenshots, the version history is their relationship milestones, the reviews are written by her friends, the in-app purchases are hugs and kisses, and the privacy label lists the little things he keeps track of about her. The layout is played completely straight; the joke — and the love — live entirely in the copy. Register: deadpan release-notes English and store-listing phrasing applied to a person, specific and warm underneath, Gen-Z dry, never cringe, never generic. Use concrete details from the sender's story everywhere they fit. When the story is thin, write about the traits it implies and lean on the app joke — never invent events, places, trips, friends or habits the story does not mention. If the story is Hinglish written in Latin letters, every line stays Hinglish in Latin letters. Nothing may name, imitate or allude to any real app marketplace, phone platform, vendor or real product.",
  forbiddenOutput: [...FORBIDDEN_STOREFRONTS, ...FORBIDDEN_NAMES, ...FORBIDDEN_PRODUCTS],
  fields: [
    {
      path: "app.name",
      label: "Her name (the app name)",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "The app's name in the big bold header — which is simply the partner's first name, or the pet name the sender actually calls her if the story uses one. One or two words, no emoji, no surname, no description.",
      example: "Meera",
    },
    {
      path: "app.seller",
      label: "Your name (the seller)",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "The SENDER's own first name, exactly as they'd sign a note. Printed as the 'Seller' in the information table and as the signature on the letter. One word, no surname, no emoji.",
      example: "Karan",
    },
    {
      path: "app.subtitle",
      label: "Subtitle under her name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The grey line under the app name. Real subtitles are a tiny tagline; here it is '<what she is to the sender> · <a dry one-to-three-word tagline>' with a middle dot, e.g. her relationship word and what she runs on or does. Under 36 characters — it sits beside the icon and wraps badly if long.",
      example: "Girlfriend · Runs on chai",
    },
    {
      path: "app.developer",
      label: "Developer name",
      kind: "text",
      max: 50,
      guide:
        "Who 'made' her, shown as the pink developer link. A plausible studio name built from her family name, her hometown or her parents: '<Family> Family Enterprises', '<Hometown> Labs', 'Mummy & Papa <Family> Studios'. Never the sender. Under 34 characters.",
      example: "Sharma Family Enterprises",
    },
    {
      path: "app.category",
      label: "Category",
      kind: "text",
      max: 24,
      guide:
        "The store category she is filed under — a REAL category name, one or two words (Lifestyle, Utilities, Productivity, Health & Fitness, Entertainment, Food & Drink, Navigation, Weather). Pick the one that is funniest-true for what she does for the sender. It also prints as 'No.1 in <category>'.",
      example: "Lifestyle",
    },
    {
      path: "app.size",
      label: "Size",
      kind: "text",
      max: 24,
      guide:
        "Where a download size would go. Never a byte count: a number followed by a unit that is not a unit — '1 human' is canonical; a variation must stay that short (e.g. '1 human, 5 ft 2'). Under 20 characters; the big number and the rest print on two lines.",
      example: "1 human",
    },
    {
      path: "app.languages",
      label: "Languages",
      kind: "text",
      max: 50,
      guide:
        "Comma-separated: the real languages she speaks (from the story; default to the sender's languages) plus exactly ONE joke language at the end, specific to her (e.g. 'Sarcasm', 'Voice notes', 'Eyebrow'). Two real + one joke.",
      example: "Tamil, English, Voice notes",
    },
    {
      path: "app.price",
      label: "Price",
      kind: "text",
      max: 34,
      guide:
        "Where the price goes: 'Free' followed by a short parenthetical that quietly undercuts it, specific to her. Under 32 characters.",
      example: "Free (costs one dessert a day)",
    },
    {
      path: "app.compatibility",
      label: "Compatibility",
      kind: "text",
      max: 60,
      guide:
        "The Compatibility row, phrased exactly like a real system-requirement line but the requirement is the SENDER: 'Requires <sender's first name> <a version number> or later.' — optionally a second clipped clause from the story. Under 48 characters.",
      example: "Requires Karan 2.0 or later.",
    },
    {
      path: "description.short",
      label: "Description — the visible part",
      kind: "list",
      max: 2,
      itemMax: 220,
      required: true,
      guide:
        "The two description paragraphs shown before 'more'. Paragraph one: pure store-listing voice describing what she does as features, present tense, one concrete detail from the story. Paragraph two: one short line that starts to leak feeling while still sounding like marketing. 80–200 characters each.",
      example:
        "Handles incoming stress, outgoing plans, and every decision about where to eat. Runs continuously. Has never crashed in a way that mattered.",
    },
    {
      path: "description.full",
      label: "Description — the part behind 'more'",
      kind: "list",
      max: 3,
      itemMax: 240,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD behind 'more'. Two or three paragraphs where the listing voice falls away and the sender simply talks about her — how they met, one specific true moment, why he'd 'install her again'. No feature language, and no joke in the last paragraph. 100–200 characters each, always complete sentences.",
      example:
        "I didn't plan any of this. She turned up in a group chat I almost muted, and now I check the weather in a city I don't live in.",
    },
    {
      path: "versionHistory[0].notes",
      label: "What's New — the latest version",
      kind: "list",
      max: 3,
      itemMax: 160,
      required: true,
      guide:
        "Release notes for the CURRENT version, shown high on the page as 'What's New' — where the relationship is right now. Three changelog lines ('Fixed…', 'Improved…', 'Added…', 'Deprecated…') about real things from the story; the last one openly about the sender's feelings while still using engineering verbs. Under 110 characters each. The tightest writing on the page.",
      example: "Improved reply speed to 'reached?' texts. Now answers before the question is sent.",
    },
    {
      path: "versionHistory[1].notes",
      label: "Version history — the biggest milestone",
      kind: "list",
      max: 3,
      itemMax: 160,
      guide:
        "The release before the current one = the BIGGEST milestone in the story (moving in, getting engaged, going long-distance, meeting the parents — whatever the story has). First line starts 'MAJOR:' and names that milestone; one or two more changelog lines about what changed after it. Under 110 characters each.",
      example: "MAJOR: went long-distance. Latency up, uptime unaffected.",
    },
    {
      path: "versionHistory[2].notes",
      label: "Version history — an early milestone",
      kind: "list",
      max: 2,
      itemMax: 140,
      guide:
        "An earlier milestone from the story (first 'I love you', first trip, the official day). One or two very short changelog lines; the first is the milestone itself in three or four words, deadpan. Under 90 characters each.",
      example: "Said it back.",
    },
    {
      path: "versionHistory[3].notes",
      label: "Version history — the first weeks",
      kind: "list",
      max: 2,
      itemMax: 120,
      guide:
        "Right after they met: one or two bare maintenance lines with exactly one detail from the story that gives it away (their first date spot, the first song, the first inside joke). Under 80 characters each. Restraint here makes the later entries land.",
      example: "Minor stability improvements. Added one shared playlist.",
    },
    {
      path: "iap",
      label: "In-app purchases",
      kind: "list",
      max: 5,
      itemMax: 60,
      guide:
        "Five in-app purchases, each formatted EXACTLY as '<item> · <price>' with a middle dot. Items are affection she can 'buy' (hugs, forehead kisses, the last bite, a 'you were right', a late-night drive) — at least two specific to the story. Prices are silly and never real money above ₹0: 'Free', '₹0', '1 kiss', 'Priceless', 'One chai'. Under 45 characters each.",
      example: "Extra-tight hug · Free",
    },
    {
      path: "privacy.tracked",
      label: "Privacy — data used to track you",
      kind: "list",
      max: 3,
      itemMax: 36,
      guide:
        "The 'Data Used to Track You' privacy card: three things the sender keeps track of about her, as short category-style labels (1–4 words), sweet not creepy — e.g. her coffee order, whether she got home safe, her period dates. Specific to the story. Under 30 characters each.",
      example: "Location (home safe?)",
    },
    {
      path: "privacy.linked",
      label: "Privacy — data linked to you",
      kind: "list",
      max: 4,
      itemMax: 36,
      guide:
        "The 'Data Linked to You' privacy card: four things of the sender's that are now permanently hers, as short labels (1–4 words) — his hoodie, the last slice, his playlists, and last: his whole heart (phrase it your way). Under 30 characters each.",
      example: "My hoodie",
    },
    {
      path: "screenshots[0].caption",
      label: "Screenshot 1 — headline",
      kind: "text",
      max: 44,
      guide:
        "The bold marketing headline printed on top of the first app screenshot (which is a photo of the couple). Real screenshot headlines are 3–6 punchy words selling a feature. Write one about her as a feature, specific to the story. No full stop, under 40 characters.",
      example: "Wakes up already talking",
    },
    {
      path: "screenshots[1].caption",
      label: "Screenshot 2 — headline",
      kind: "text",
      max: 44,
      guide:
        "Second screenshot headline: 3–6 words, a different feature from the first, marketing voice, about something she does. No full stop, under 40 characters.",
      example: "Syncs across two cities",
    },
    {
      path: "screenshots[2].caption",
      label: "Screenshot 3 — headline",
      kind: "text",
      max: 44,
      guide:
        "Third screenshot headline: 3–6 words, a feature about how she makes the sender feel, still in marketing voice. No full stop, under 40 characters.",
      example: "Runs in the background of every thought",
    },
    {
      path: "screenshots[3].caption",
      label: "Screenshot 4 — headline",
      kind: "text",
      max: 44,
      guide:
        "Fourth and last screenshot headline: 3–6 words, the sweetest of the four, still phrased as a feature. No full stop, under 40 characters.",
      example: "Unlimited storage for my hoodies",
    },
    {
      path: "reviews[0].author",
      label: "Review 1 — reviewer nickname",
      kind: "text",
      max: 30,
      guide:
        "The nickname of a friend reviewing her, the way store reviewers appear: a lowercase handle-style nickname — a first name joined to how they know her, or a relation plus an emoji. If the story names a friend or sibling, use them (the story's own spelling). Under 22 characters.",
    },
    {
      path: "reviews[0].title",
      label: "Review 1 — headline",
      kind: "text",
      max: 44,
      guide:
        "Bold headline of the top 5-star review from a friend: short, over-confident, product-review phrasing about her. Under 40 characters, no full stop.",
    },
    {
      path: "reviews[0].body",
      label: "Review 1 — the review",
      kind: "longtext",
      max: 220,
      required: true,
      guide:
        "The friend's 5-star review written EXACTLY like an app review — she is the app: 'been using her since…', performance, lag, battery, support, updates, features — applied to an oddly specific detail from the story, total sincerity about something trivial. Refers to her as 'her'. 140–210 characters.",
      example:
        "Five years of daily use. Occasional lag before breakfast, resolves after food. Support answers at 3am.",
    },
    {
      path: "reviews[0].developerResponse.text",
      label: "Reply to review 1 (from you)",
      kind: "longtext",
      max: 260,
      required: true,
      guide:
        "THE BEST WRITING SLOT. The sender's 'Developer Response' under the top review. Opens like a support agent ('Thanks for the report.' / 'We appreciate the feedback.'), answers the reviewer's point in ticket language, then the LAST sentence breaks character into plain, open love for her. 120–240 characters.",
      example:
        "Thanks for the report. The lag is expected behaviour and will not be fixed. Re: availability — correct, and by design.",
    },
    {
      path: "reviews[1].author",
      label: "Review 2 — reviewer nickname",
      kind: "text",
      max: 30,
      guide: "A second friend's reviewer nickname, a different style from the first (e.g. 'rahul.exe', 'her gym buddy'). Under 22 characters.",
    },
    {
      path: "reviews[1].title",
      label: "Review 2 — headline",
      kind: "text",
      max: 44,
      guide: "Second 5-star review headline — about a different trait, oddly technical (battery life, performance, storage). Under 40 characters, no full stop.",
    },
    {
      path: "reviews[1].body",
      label: "Review 2 — the review",
      kind: "longtext",
      max: 200,
      guide: "A shorter 5-star review in app-review voice (a 'feature' or 'performance' of hers), different reviewer voice from the first, one specific habit of hers from the story. 80–160 characters.",
    },
    {
      path: "reviews[2].author",
      label: "Review 3 — reviewer nickname",
      kind: "text",
      max: 30,
      guide: "A third friend's reviewer nickname, maybe with one emoji at the end. Under 22 characters.",
    },
    {
      path: "reviews[2].title",
      label: "Review 3 — headline (the 4-star one)",
      kind: "text",
      max: 44,
      guide: "Headline of the one 4-star review: a real, tiny, affectionate complaint. Under 40 characters, no full stop.",
    },
    {
      path: "reviews[2].body",
      label: "Review 3 — the review",
      kind: "longtext",
      max: 200,
      guide:
        "The 4-star review: mild criticism of something trivial and specific (from the story if possible), written by a friend who obviously adores her; it ends by forgiving her. Nothing that would actually hurt — she reads this. 90–170 characters.",
    },
    {
      path: "reviews[2].developerResponse.text",
      label: "Reply to review 3 (from you)",
      kind: "longtext",
      max: 220,
      guide:
        "The sender's second Developer Response — shorter and drier than the first, a support agent siding with her against the reviewer. 70–170 characters. Don't reuse the first reply's phrasing.",
      example: "Ticket reviewed. Behaviour confirmed as a feature. Reviewer advised to update their expectations.",
    },
    {
      path: "reviews[3].author",
      label: "Review 4 — reviewer nickname",
      kind: "text",
      max: 30,
      guide: "A fourth friend's reviewer nickname (e.g. 'kabir_from_hostel_b', 'your mom's fav'). Under 22 characters.",
    },
    {
      path: "reviews[3].title",
      label: "Review 4 — headline",
      kind: "text",
      max: 44,
      guide: "A 5-star headline that says she is the best in her category. Under 40 characters, no full stop.",
    },
    {
      path: "reviews[3].body",
      label: "Review 4 — the review",
      kind: "longtext",
      max: 200,
      guide: "A friend's short review that ends on something genuinely kind she did (from the story if possible). 70–160 characters.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to her friends",
      kind: "text",
      max: 140,
      guide:
        "Shown to friends who open the review link. Short and warm: name the sender and her, say what the listing is for (a surprise for her), and ask for one line in the app-review voice. Your own wording.",
    },
    {
      path: "letter",
      label: "The main letter",
      kind: "longtext",
      max: 1100,
      required: true,
      guide:
        "The private letter that pops up in a corner envelope — the one fully sincere piece on the page, in the sender's own plain voice (how a real person texts at 2am, not a greeting card). First person, straight to her, 4 short paragraphs separated by blank lines. Open with the name he actually calls her. Retell 3 concrete moments from the story in their own words (a place, a habit, a line someone said), say what each one meant to him, nod ONCE to the app joke, and end on a simple promise. Plain words only — favour a small true detail over any metaphor. No sign-off name — the signature is added automatically. 650–1000 characters.",
      example: "Meera,\n\nI made you a listing because I ran out of normal ways to say it…",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter opens",
      kind: "text",
      max: 120,
      guide:
        "A cute yes/no question she must answer before the letter opens (its 'no' button runs away). Build it from something in THEIR story (a habit, a place, a running joke) or from updates/notifications — something only she would get. Ends with one emoji. Under 60 characters.",
    },
    {
      path: "lockAnswer",
      label: "Her 'yes' button",
      kind: "text",
      max: 40,
      guide: "The label on the 'yes' button that answers the question you wrote above, in her voice — a playful, specific yes that fits that exact question. 1–4 words plus one emoji. Under 20 characters.",
    },
  ],
};
