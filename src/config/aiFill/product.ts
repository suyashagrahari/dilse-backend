import type { AiFillTemplateSchema } from "./types";

/**
 * product — "loveकार्ट", a listing page where the product is a person.
 *
 * Paths resolve against `ProductData` in
 * client/app/(templates)/product/components/types.ts, held as `mf` in
 * useProductEditor.ts.
 *
 * `subject.photos`, `bundle[].imageUrl` and `aboutSection.imageUrl` are media
 * and are absent by construction — `FieldKind` has no media member. `reviews` is
 * absent too, and that is the whole point of the template: reviews come from the
 * sender's friends through the contributor link, not from a model. A generated
 * review would be a fabricated endorsement attributed to a named person.
 */
export const product: AiFillTemplateSchema = {
  slug: "product",
  audience: "partner",
  premise:
    "A parody e-commerce listing where the product is the sender's girlfriend: photo gallery, buy box, spec table, Q&A, and a review section her friends fill in. The comedy only works if the page is played completely straight — the layout is a real shopping page and the joke lives entirely in the copy. The register is deadpan retail: bureaucratic phrasing applied to a person, never winking at the reader. Warm underneath, bone-dry on the surface.",
  forbiddenOutput: ["Amazon", "Prime", "Alexa", "AWS", "Kindle", "Echo"],
  fields: [
    {
      path: "title",
      label: "Listing title",
      kind: "text",
      max: 120,
      required: true,
      guide:
        "The product title, set at 24px in regular weight. Real listings cram the name, the category, a redundant qualifier and a count into one comma-separated string — copy that exactly. Format: '<Her name> — <relationship>, <qualifier>, 1 Count'. Long is correct here; a short punchy title reads as a graphic, not a listing.",
      example: "Meera Sharma — Girlfriend, Original, 1 Count",
    },
    {
      path: "storeName",
      label: "Store link",
      kind: "text",
      max: 60,
      guide:
        "The blue store link above the title. Always the form 'Visit the ___ Store', using her family name or a running joke about where she comes from. Under 40 characters.",
      example: "Visit the Sharma Store",
    },
    {
      path: "stockLine",
      label: "Stock line",
      kind: "text",
      max: 80,
      guide:
        "The scarcity line in the buy box, rendered in red. 'Only 1 left in stock.' is the canonical joke and hard to beat — a variation must keep the same clipped retail phrasing and the same implication that there is exactly one of her.",
      example: "Only 1 left in stock — and I'm not sharing.",
    },
    {
      path: "deliveryLine",
      label: "Delivery promise",
      kind: "text",
      max: 90,
      guide:
        "The delivery line, with a date in it. Real ones read 'FREE delivery Tomorrow, 4 AM'. Keep the all-caps FREE and an absurdly precise time — the precision is what makes it land.",
      example: "FREE delivery Tomorrow, 4 AM. Order within 2 hrs 14 mins.",
    },
    {
      path: "bullets",
      label: "About this item",
      kind: "list",
      max: 6,
      itemMax: 140,
      required: true,
      guide:
        "The 'About this item' bullet block. 4 to 6 bullets, each under 110 characters, each written as a dry product feature about a specific real trait of hers. Pull concrete details from the sender's story — a habit, a phrase she repeats, something she always does. The joke is the mismatch between retail feature-speak and an actual person, so never write anything sentimental here; that belongs in the About section. Do not start every bullet the same way.",
      example: "Compatible with all moods. Occasionally requires a restart (feed her).",
    },
    {
      path: "specs",
      label: "Product information rows",
      kind: "list",
      max: 12,
      itemMax: 120,
      required: true,
      guide:
        "The spec table — where most of the humour lives, so give it room: 10 to 12 rows. Each item MUST be written as 'Label: Value' with a single colon, because the renderer splits on it into a two-column table row. Labels are short and technical (Model, Material, Batteries, Warranty, Country of Origin, Item Weight, Special Features); values are where the joke goes. Mine the sender's story for real specifics. Keep every value under 60 characters — long values break the table.",
      example: "Batteries: 1 Lithium-ion required (chai, mostly)",
    },
    {
      path: "qa",
      label: "Customer questions",
      kind: "list",
      max: 5,
      itemMax: 220,
      guide:
        "The Q&A block. 3 to 5 items, each written as 'Question | Answer' with a single pipe separating them — the renderer splits on the pipe. Questions should sound like a genuinely confused shopper; answers should be the sender replying with total sincerity, which is the funniest possible register. Keep each side under 100 characters.",
      example: "Does she come in other colours? | No. This is the only one and I checked.",
    },
    {
      path: "aboutSection.heading",
      label: "From the seller — heading",
      kind: "text",
      max: 70,
      guide:
        "The heading of the A+ content block, where the page stops joking. Plain and warm, no retail voice, no puns. This is the hinge into the sincere writing beneath it.",
      example: "From the seller",
    },
    {
      path: "aboutSection.body",
      label: "From the seller — the real writing",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD. Everything above this is spec-sheet comedy; this paragraph is the sender talking honestly about her, and the tonal break is the entire point of the template. 2 or 3 short paragraphs, 350 to 650 characters, separated by blank lines. Drop the retail voice completely — no 'this item', no bullet phrasing, no jokes. Use one concrete detail from the sender's story so it could not have been written about anyone else. Do not summarise the relationship; describe one true thing.",
      example: "I didn't plan any of this. She turned up in a group chat I almost muted, and now I check the weather in a city I don't live in.",
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
