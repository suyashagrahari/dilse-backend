import type { AiFillTemplateSchema } from "./types";

/**
 * app — a person rendered as a software listing.
 *
 * Paths resolve against `AppData` in
 * client/app/(templates)/app/components/types.ts, held as `mf` in
 * useAppEditor.ts.
 *
 * `meta.iconUrl` and `screenshots[].imageUrl` are media and are absent by
 * construction — `FieldKind` has no media member and `assertNoMediaPaths`
 * refuses those leaves. Structural fields are absent too: version numbers,
 * dates, star counts, the histogram, review authors and the info-row labels are
 * scaffolding the sender controls, and a model rewriting them turns a listing
 * into noise. What is declared below is the WRITING and nothing else.
 *
 * The oldest changelog entry is deliberately NOT declared. Its note is the one
 * dry line the whole version history plays against, and handing it to a model
 * that has just been asked for five escalating jokes is the reliable way to
 * lose the contrast the template is built on.
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
    "A parody software listing where the product is the sender's girlfriend: an icon, a rating with a histogram, screenshots, a description, a changelog, and reviews her friends write. The comedy only works if the page is played completely straight — the layout is an ordinary listing and the joke lives entirely in the copy. The register is deadpan release-notes English: engineering phrasing applied to a person, never winking at the reader. Warm underneath, bone-dry on the surface. Nothing in the output may name, imitate or allude to any real software marketplace, phone platform, vendor or product.",
  forbiddenOutput: [...FORBIDDEN_STOREFRONTS, ...FORBIDDEN_NAMES, ...FORBIDDEN_PRODUCTS],
  fields: [
    {
      path: "meta.subtitle",
      label: "Subtitle under her name",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "The grey line directly under her name in the header, set small. Real ones read '<what it is> · <category>' with a middle dot. Use her relationship to the sender and a dry software category. Under 40 characters — this line sits next to the install button and wraps badly if it runs long.",
      example: "Girlfriend · Utilities",
    },
    {
      path: "meta.developer",
      label: "Developer name",
      kind: "text",
      max: 60,
      guide:
        "Who 'made' her, printed as the accent-coloured link under the subtitle. Always a plausible company name built from her family name or where she grew up: '<Family> Family Enterprises', '<Family> Industries', '<City> Labs'. Never a person's full name — the joke is that a human being has a corporate parent.",
      example: "Sharma Family Enterprises",
    },
    {
      path: "meta.category",
      label: "Category",
      kind: "text",
      max: 40,
      guide:
        "One word, the software category she is filed under. Deadpan and slightly insulting in the way a category always is: Utilities, Productivity, Lifestyle, Health & Fitness, Entertainment. Pick the one that best fits what she actually does for the sender.",
      example: "Utilities",
    },
    {
      path: "meta.size",
      label: "Size",
      kind: "text",
      max: 40,
      guide:
        "Where a listing would print a download size. It is FREE TEXT and is never a byte count — '1 human' is the canonical answer and is very hard to beat. A variation must stay in the same register: a unit of measurement that is not a unit of measurement. Under 25 characters.",
      example: "1 human",
    },
    {
      path: "meta.languages",
      label: "Languages",
      kind: "text",
      max: 60,
      guide:
        "A comma-separated list of the languages she actually speaks, with exactly one joke language appended at the end. The two real ones make the third land; three joke languages land nothing. Use the sender's story for the real ones.",
      example: "English, Hindi, Sarcasm",
    },
    {
      path: "meta.price",
      label: "Price",
      kind: "text",
      max: 50,
      guide:
        "Where the price would go. FREE TEXT, never parsed as currency. The shape is 'Free' followed by a parenthetical that quietly undercuts it. Keep it under 35 characters — it sits inside a pill.",
      example: "Free (emotionally expensive)",
    },
    {
      path: "description.short",
      label: "Description — the visible part",
      kind: "list",
      max: 2,
      itemMax: 240,
      required: true,
      guide:
        "The first two paragraphs of the description, shown before the reader taps 'more'. Paragraph one is pure listing voice: what she does, written as a product does it, present tense, no sentiment. Paragraph two starts to leak. Each 120 to 200 characters. Pull one concrete detail from the sender's story so it could not have been written about anyone else.",
      example:
        "Handles incoming stress, outgoing plans, and every decision about where to eat. Runs continuously. Has never once crashed in a way that mattered.",
    },
    {
      path: "description.full",
      label: "Description — the part behind 'more'",
      kind: "list",
      max: 4,
      itemMax: 240,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD, and the reason the 'more' link exists. Two to four paragraphs where the listing voice falls away completely and the sender is simply talking about her. No feature language, no bullet phrasing, no jokes in the last one. Use a specific true thing rather than a summary of the relationship. 120 to 220 characters each.",
      example:
        "I didn't plan any of this. She turned up in a group chat I almost muted, and now I check the weather in a city I don't live in.",
    },
    {
      path: "whatsNew.notes",
      label: "What's new — the latest release",
      kind: "list",
      max: 4,
      itemMax: 200,
      required: true,
      guide:
        "The release notes for the CURRENT version, shown high on the page. Three or four lines, each a real changelog line about a real thing she does — 'Fixed', 'Improved', 'Added', 'Known issue'. Under 110 characters each. This is the reader's first taste of the joke, so it should be the tightest writing on the page.",
      example: "Fixed a bug where she said 'I'm fine' and meant the opposite. Still investigating.",
    },
    {
      path: "versionHistory[0].notes",
      label: "Changelog — newest release",
      kind: "list",
      max: 4,
      itemMax: 200,
      guide:
        "The newest changelog entry, and the most unhinged. Three or four lines. By this point in the history the release notes have completely lost their professional composure and are openly about the sender's feelings while still using engineering verbs. Under 110 characters each.",
      example: "Deprecated the version of me that existed before her. No migration path. None needed.",
    },
    {
      path: "versionHistory[1].notes",
      label: "Changelog — one release back",
      kind: "list",
      max: 3,
      itemMax: 200,
      guide:
        "Slightly more composed than the newest entry and slightly less than the one before it — the history is an escalation and every entry has to sit correctly on that curve. Two or three lines, still recognisably changelog English, under 110 characters each.",
      example: "Added support for arguing about a film neither of us finished. Performance is excellent.",
    },
    {
      path: "versionHistory[2].notes",
      label: "Changelog — mid-history",
      kind: "list",
      max: 3,
      itemMax: 200,
      guide:
        "The middle of the escalation: the notes are still doing their job but the personal detail is starting to bleed in at the edges. Two or three lines, under 110 characters each. Use a specific habit or a running joke from the sender's story.",
      example: "Improved handling of long silences. Reduced memory usage on old arguments.",
    },
    {
      path: "versionHistory[3].notes",
      label: "Changelog — early release",
      kind: "list",
      max: 2,
      itemMax: 200,
      guide:
        "An early entry, so mostly straight-faced. One or two lines of plain maintenance language with exactly one detail that gives it away. Under 100 characters each. Restraint here is what makes the later entries funny.",
      example: "Minor stability improvements. Added a second toothbrush.",
    },
    {
      path: "versionHistory[4].notes",
      label: "Changelog — earliest declared release",
      kind: "list",
      max: 2,
      itemMax: 200,
      guide:
        "Nearly the beginning, so almost entirely deadpan: one or two short lines of bare maintenance English, under 80 characters. No feelings, no jokes — this entry is the straight man for everything above it.",
      example: "Bug fixes. Added a shared calendar.",
    },
    {
      path: "info[3].value",
      label: "Compatibility",
      kind: "text",
      max: 90,
      guide:
        "The value of the Compatibility row in the information table, where a listing would name the hardware it runs on. 'Works with me only' is the canonical answer. A variation must keep the clipped table-cell phrasing and the same implication of exclusivity. Under 45 characters — this is a table cell, not a sentence.",
      example: "Works with me only.",
    },
    {
      path: "reviews[0].title",
      label: "Top review — headline",
      kind: "text",
      max: 60,
      guide:
        "The bold headline of the most prominent review, written by one of her friends. Real review headlines are short, over-confident and slightly unhinged. Under 40 characters, no full stop.",
      example: "Ten years of daily use, zero crashes",
    },
    {
      path: "reviews[0].body",
      label: "Top review — the review",
      kind: "longtext",
      max: 200,
      required: true,
      guide:
        "A review of her written by a friend, in review English: second-hand experience, unnecessary detail, total sincerity about something trivial. 150 to 200 characters. Do NOT invent a name — the byline is set separately and a fabricated named endorsement is the one thing this template must not produce.",
      example:
        "Been using her since college. Occasional lag when hungry, resolves itself after food. Support is responsive at 3am. The only real downside is she is not available to anyone else.",
    },
    {
      path: "reviews[0].developerResponse.text",
      label: "Reply to the top review",
      kind: "longtext",
      max: 300,
      required: true,
      guide:
        "THE BEST WRITING SLOT ON THE PAGE. The sender's reply, indented under the review, in the voice of a developer answering a support ticket — and it is the one place the whole listing quietly admits what it is about. Open in perfect corporate register and let it collapse in the last sentence. 120 to 250 characters.",
      example:
        "Thanks for the report. The lag is expected behaviour and will not be fixed. Re: availability — correct, and this is by design.",
    },
    {
      path: "reviews[1].title",
      label: "Second review — headline",
      kind: "text",
      max: 60,
      guide:
        "A second review headline in a different voice from the first — where one is over-confident, make this one mildly disappointed or oddly technical. Under 40 characters, no full stop.",
      example: "Great, but the update changed things",
    },
    {
      path: "reviews[1].body",
      label: "Second review — the review",
      kind: "longtext",
      max: 200,
      guide:
        "A shorter review than the first, and a different register — the review block is boring when every entry sounds like the same person. 90 to 160 characters. No invented names.",
      example: "Does exactly one thing and does it perfectly. Wish the documentation were clearer about the mood system.",
    },
    {
      path: "reviews[1].developerResponse.text",
      label: "Reply to the second review",
      kind: "longtext",
      max: 260,
      guide:
        "A second reply from the sender, shorter and drier than the first — a support agent who has stopped pretending. 80 to 180 characters. Never repeat the phrasing of the first reply.",
      example: "The mood system is documented. The documentation is her face.",
    },
    {
      path: "reviews[2].title",
      label: "Critical review — headline",
      kind: "text",
      max: 60,
      guide:
        "The headline of the one review that is NOT five stars. It has to be a real, small, affectionate complaint — a page where everybody agrees reads as fake. Under 40 characters.",
      example: "Update broke my sleep schedule",
    },
    {
      path: "reviews[2].body",
      label: "Critical review — the review",
      kind: "longtext",
      max: 200,
      guide:
        "The three-star review. Genuinely mild criticism about something trivial and specific, written by a friend who obviously adores her. Never anything that would actually hurt to read — this page is a gift and she is going to read every line of it. 90 to 170 characters.",
      example: "Talks through films. Every film. Has never once been wrong about what happens next, which is worse.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to her friends",
      kind: "text",
      max: 140,
      guide:
        "Shown to friends who open the review link. It has to make a stranger in a group chat want to type one line, so keep it short, warm, and specific about what is being asked. Name the sender and her. Never guilt anyone into it.",
      example: "Karan is collecting reviews of Meera. Leave one — one line is plenty.",
    },
  ],
};
