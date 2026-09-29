import type { AiFillTemplateSchema } from "./types";

/**
 * product — "loveकार्ट", a shopping-app listing where the product is a person.
 *
 * Paths resolve against `ProductData` in
 * client/app/(templates)/product/components/types.ts, held as `mf` in
 * useProductEditor.ts.
 *
 * Every TEXT leaf of the listing is declared — names, the title, the buy box,
 * offers, variants, bullets, specs, the bundle, "Customers say", the seeded
 * reviews, Q&A, the A+ block, the letter and its lock. Media is absent by
 * construction (`subject.photos`, `bundle[].imageUrl`, `reviews[].imageUrl`,
 * `aboutSection.imageUrl`). Dates, stars and counts stay the editor's.
 *
 * Three list fields are written as flat strings and turned back into objects by
 * `normalizeProductData` on the client: `specs` ("Label: Value"), `qa`
 * ("Question | Answer") and `bundle` ("Name | Price | Note"). `offers` stays a
 * list of "Label | text" strings and is split at render.
 *
 * The seeded reviews are written as the sender's own voice and as clearly
 * role-labelled people from the sender's story ("Her best friend", "Her mom")
 * — never as invented full names of real people. Her actual friends add real
 * reviews later through the contributor link.
 */
export const product: AiFillTemplateSchema = {
  slug: "product",
  audience: "partner",
  premise:
    "A pitch-perfect parody of an Indian shopping-app product page where the product is the person the sender loves: gallery, 'Limited time deal' badge, price ∞, offers, mood swatches, a buy box, bullet points, a spec table, 'Frequently bought together', an AI 'Customers say' summary, reviews, Q&A, and a sincere 'From the manufacturer' block — plus a private letter that pops up after she 'places the order'. The layout is played completely straight; all the comedy and all the romance live in the copy. Register: deadpan e-commerce phrasing applied to a real person, Gen-Z dry, warm underneath. Every line should be specific to THIS couple — lift real habits, places, foods, phrases and inside jokes from the sender's story; nothing that could be pasted onto any other couple.",
  forbiddenOutput: [["Ama", "zon"].join(""), "Prime", "Alexa", "AWS", "Kindle", "Echo", "Flipkart", "Myntra", "Meesho"],
  fields: [
    {
      path: "subject.firstName",
      label: "Her first name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The first name of the person being listed, exactly as the sender writes it in the story. If the sender only ever uses a pet name, use the pet name. Just the name — no emoji, no title.",
      example: "Meera",
    },
    {
      path: "subject.lastName",
      label: "Her last name",
      kind: "text",
      max: 40,
      guide:
        "Her surname ONLY if the story actually states it. If it is not in the story, return an empty string — never invent a surname.",
      example: "Sharma",
    },
    {
      path: "sender.firstName",
      label: "Your first name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The sender's own first name as it appears in the story or the names given. Just the name.",
      example: "Karan",
    },
    {
      path: "title",
      label: "Listing title",
      kind: "text",
      max: 190,
      required: true,
      guide:
        "The product title, shown at 24px. Real listings cram name, category, qualifiers and a count into one long comma-separated string with a bracketed extra — copy that exactly. Format: '<Her full name> — <relationship word>, <2–3 dry qualifiers from the story>, 1 Count (<one bracketed detail, e.g. edition or origin city>)'. 90–170 characters. Long is correct.",
      example: "Aanya Rao — Wife, Original, Sarcasm Included, 1 Count (Pune Edition, Monsoon Tested)",
    },
    {
      path: "storeName",
      label: "Store link",
      kind: "text",
      max: 60,
      guide:
        "The blue link above the title. Always 'Visit the ___ Store', using her family name if known, otherwise her first name or her hometown from the story. Under 40 characters.",
      example: "Visit the Rao Store",
    },
    {
      path: "dealLabel",
      label: "Deal badge",
      kind: "text",
      max: 30,
      guide:
        "The small red badge over the price. Real ones say 'Limited time deal' or 'Deal of the Day'. Keep that exact clipped shape but make it romantic or a tiny joke about forever. 2–4 words, no emoji.",
      example: "Lifetime deal",
    },
    {
      path: "boughtLine",
      label: "Bought line",
      kind: "text",
      max: 70,
      guide:
        "The grey social-proof line under the rating, in the real format '<number> bought in past month', twisted so it's clear only the sender ever bought her. Under 50 characters.",
      example: "1 bought in past 3 years · same buyer",
    },
    {
      path: "price.original",
      label: "M.R.P. (struck through)",
      kind: "text",
      max: 20,
      guide:
        "The struck-through maximum retail price next to the ∞ price. An absurd rupee figure in Indian digit grouping with the ₹ sign, optionally tied to a number from the story (a date, a flat number). Only the price — no words.",
      example: "₹14,02,2023",
    },
    {
      path: "stockLine",
      label: "Stock line",
      kind: "text",
      max: 90,
      guide:
        "The stock line in the buy box. Must contain the words 'Only 1 left' (the renderer turns it red) plus a short possessive or sweet twist. Clipped retail phrasing.",
      example: "Only 1 left in stock — and it's reserved.",
    },
    {
      path: "deliveryLine",
      label: "Delivery promise",
      kind: "text",
      max: 160,
      guide:
        "The delivery line. Start with 'FREE delivery' then a weekday or date (it gets bolded), an absurdly precise order-within countdown, and how the sender personally delivers it, using a real detail from the story (his scooter, the metro, the 2 AM drive). 90–150 characters.",
      example: "FREE delivery Saturday, 9 PM. Order within 3 hrs 12 mins. Delivered by Arjun on his scooter, with momos.",
    },
    {
      path: "variantLabel",
      label: "Swatch label",
      kind: "text",
      max: 20,
      guide: "The label above the variant swatches, like 'Colour' or 'Size' on a real listing. One word describing her moods or modes.",
      example: "Mood",
    },
    {
      path: "variants",
      label: "Swatches",
      kind: "list",
      max: 5,
      itemMax: 24,
      guide:
        "4–5 variant swatches: her real moods or modes from the story, each 1–2 words followed by one fitting emoji. Specific to her ('Post-gym', 'Exam week'), not generic.",
      example: "Hangry 🍕",
    },
    {
      path: "offers",
      label: "Offer cards",
      kind: "list",
      max: 4,
      itemMax: 150,
      guide:
        "Exactly 4 offer cards. Each item MUST be 'Label | text' with ONE pipe. Labels are the real ones in this order: 'Bank Offer', 'No Cost EMI', 'Cashback', 'Partner Offer'. Text is 60–120 characters of mock-offer fine print that is actually a sweet promise from the sender, using specifics from the story.",
      example: "No Cost EMI | Pay in forehead kisses. 0% interest, 100% commitment, tenure: forever.",
    },
    {
      path: "bullets",
      label: "About this item",
      kind: "list",
      max: 6,
      itemMax: 200,
      required: true,
      guide:
        "The 'About this item' bullets. Exactly 5 or 6. Each starts with a SHORT ALL-CAPS FEATURE NAME and a colon, then one dry product-spec sentence about a specific real trait, habit or quirk of hers from the story (80–170 characters). Mix funny and quietly sweet. Never start two bullets with the same word.",
      example: "NOISE CANCELLATION: Mutes every bad day with one voice note. Works across cities and time zones.",
    },
    {
      path: "specs",
      label: "Product information rows",
      kind: "list",
      max: 12,
      itemMax: 110,
      required: true,
      guide:
        "The spec table — exactly 11 rows. Each item MUST be 'Label: Value' with a single colon. Labels are real technical labels (Brand, Model Name, Colour, Material, Special Feature, Country of Origin, Batteries Required, Item Weight, Included Components, Care Instructions, Warranty, Date First Available). Every value must carry a specific detail from the story (her city, her job, her foods, her habits, the pet) — no value that would fit any person. 'Country of Origin' is her city or state; 'Date First Available' is when they met if the story says. Keep each value under 60 characters.",
      example: "Batteries Required: 1 × masala chai, refilled every 3 hours",
    },
    {
      path: "bundle",
      label: "Frequently bought together",
      kind: "list",
      max: 3,
      itemMax: 170,
      guide:
        "Exactly 3 items bought with her. Each item MUST be 'Name | Price | Note' with two pipes. Item 1 is the sender himself as a product (e.g. '<Sender> — Boyfriend, Slightly Used, 1 Count'). Items 2–3 are real things from their story (her favourite food, a shared ritual, a pet, a family member's opinion). Price is short text like '₹0', 'Free' or '₹180'. Note is one dry line, under 70 characters.",
      example: "Midnight Maggi, 2 plates | ₹40 | Ships at 1 AM whether requested or not.",
    },
    {
      path: "customersSay",
      label: "Customers say",
      kind: "longtext",
      max: 600,
      guide:
        "The AI review-summary box. Write it in the exact register of a shopping app's generated summary: 'Customers find this product … They appreciate … Some customers mention … but …'. 3–4 sentences, 300–520 characters, entirely about her real traits from the story, with one mild 'complaint' that is actually endearing.",
      example: "Customers find her warm, quick-witted and dangerously good at picking restaurants. Some customers mention the 20-minute 'five minutes', but all would buy again.",
    },
    {
      path: "customersSayTags",
      label: "Customers say chips",
      kind: "list",
      max: 6,
      itemMax: 24,
      guide:
        "5–6 aspect chips under the summary, like the real 'Quality', 'Value for money'. 1–2 words each, Title Case, each a trait of hers from the story. Include 'Value for money' as the last one.",
      example: "Hug quality",
    },
    {
      path: "qa",
      label: "Customer questions",
      kind: "list",
      max: 5,
      itemMax: 220,
      guide:
        "4–5 Q&A items. Each item MUST be 'Question | Answer' with one pipe. Questions sound like a confused shopper about her specific quirks; answers are the sender replying with total sincerity and deadpan honesty. Each side under 100 characters.",
      example: "Does it work before coffee? | Technically yes. I would not test it.",
    },
    {
      path: "reviews[0].author",
      label: "Review 1 — name",
      kind: "text",
      max: 40,
      guide: "The sender's own first name — review 1 is the buyer's review.",
      example: "Arjun",
    },
    {
      path: "reviews[0].title",
      label: "Review 1 — headline",
      kind: "text",
      max: 120,
      guide:
        "The buyer's 5-star review headline, in real review-title style ('Worth every rupee', 'Ordered once, using daily'), bent toward them. Mention how long they've been together if known. Under 80 characters.",
      example: "Bought in 2022. Still my favourite purchase.",
    },
    {
      path: "reviews[0].body",
      label: "Review 1 — text",
      kind: "longtext",
      max: 600,
      guide:
        "The sender's own review, AT LEAST 300 characters (up to 500), written like a detailed verified-purchase review ('Arrived early…', 'Build quality…') that slowly becomes sincere, anchored in two concrete memories from the story. Ends on a dry 'would recommend, but not available' type line.",
      example: "Arrived at a friend's birthday I almost skipped. Build quality unchanged since. Would recommend, but it's out of stock.",
    },
    {
      path: "reviews[1].author",
      label: "Review 2 — name",
      kind: "text",
      max: 40,
      guide:
        "A reviewer who knows her: a friend or sibling NAMED in the story (first name + initial), otherwise a role label like 'Her best friend (since class 6)'. Never invent a full name.",
      example: "Her best friend",
    },
    {
      path: "reviews[1].title",
      label: "Review 2 — headline",
      kind: "text",
      max: 120,
      guide: "A 5-star review headline from that friend's point of view, teasing the sender a little. Under 80 characters.",
      example: "Exactly as described. He got lucky.",
    },
    {
      path: "reviews[1].body",
      label: "Review 2 — text",
      kind: "longtext",
      max: 500,
      guide:
        "That friend's review, 180–380 characters: they've known her longer than the sender, confirm a specific bullet point, add one detail only a friend would know, and roast the sender affectionately.",
      example: "Known this unit since school. Can confirm the laugh. Rahul, you won the lottery and we're all watching.",
    },
    {
      path: "reviews[2].author",
      label: "Review 3 — name",
      kind: "text",
      max: 40,
      guide: "A family-member role label from the story ('Her mom', 'Her younger brother'), or 'Her mom' if the story names nobody.",
      example: "Her mom",
    },
    {
      path: "reviews[2].title",
      label: "Review 3 — headline",
      kind: "text",
      max: 120,
      guide: "A 4-star headline in a proud, slightly bossy family voice explaining why one star is withheld. Under 70 characters.",
      example: "One star withheld on principle",
    },
    {
      path: "reviews[2].body",
      label: "Review 3 — text",
      kind: "longtext",
      max: 450,
      guide:
        "The family member's review, 150–320 characters, warm and a little bossy, Indian-parent energy, with one line of grudging approval of the sender. Match the sender's language (Hinglish stays Hinglish).",
      example: "She is perfect, I am her mother. If I give five she will get ideas. Boy is fine also. Eats properly now.",
    },
    {
      path: "reviews[3].author",
      label: "Review 4 — name",
      kind: "text",
      max: 40,
      guide: "A funny bystander label from their world ('Chaiwala outside her office', 'The group chat', 'Her dog (translated)').",
      example: "The group chat",
    },
    {
      path: "reviews[3].title",
      label: "Review 4 — headline",
      kind: "text",
      max: 120,
      guide: "A 5-star headline from the bystander, deadpan. Under 70 characters.",
      example: "Cannot get the buyer to stop talking about it",
    },
    {
      path: "reviews[3].body",
      label: "Review 4 — text",
      kind: "longtext",
      max: 400,
      guide: "The bystander's review, 100–260 characters, a single funny observed detail about the two of them from the story.",
      example: "Every dinner, forty minutes on how she carried his bag at the airport. Five stars for her. One for our Fridays.",
    },
    {
      path: "aboutSection.heading",
      label: "From the manufacturer — heading",
      kind: "text",
      max: 70,
      guide:
        "The heading of the A+ block where the page stops joking. A short, plain, warm line in the sender's voice — no retail words, no puns.",
      example: "Why there's only one",
    },
    {
      path: "aboutSection.body",
      label: "From the manufacturer — the real writing",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "THE EMOTIONAL CENTRE of the listing, set in serif. 2–3 short paragraphs separated by a blank line, 420–750 characters, in the sender's own voice. Drop the retail voice completely. Tell ONE true, concrete scene from the story as it happened — where they were, what time it was, what she did or said — and let it show who she is. Plain sentences, no abstract praise, no summary of the relationship.",
      example: "She once took a night bus four hours to sit with a friend in a hospital corridor.\n\nI was the friend's cousin. That's how I met her.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to her friends",
      kind: "text",
      max: 140,
      guide:
        "Shown to friends who open the review link. Short, warm, specific: name the sender and her, and ask for one line. Never guilt anyone.",
      example: "Arjun is collecting reviews of Aanya. Leave one — a single line is plenty.",
    },
    {
      path: "letter",
      label: "The letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The private letter that opens after she 'places the order'. AT LEAST 650 characters (up to 1100), in 4 or 5 short paragraphs separated by blank lines, the sender writing directly to her ('you'). Do NOT open with a salutation or her name on its own line — the page already prints 'Dear <name>,' above it; begin straight with the first sentence. One short paragraph may wink at the shopping-page idea in fresh words of your own; every other paragraph is sincere and built from concrete details in the story — a named place, a time of day, a food, a habit, something she said — at least four of them across the letter. End with a plain, specific promise. Do not sign it (the signature is added).",
      example: "(register only) …the Tuesday you fixed my bike chain in the rain with a hairclip…\n\n…so here is the promise: …",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter",
      kind: "text",
      max: 120,
      guide:
        "A playful yes-or-no question she must answer before the letter opens (the 'no' button runs away). Shopping-flavoured and sweet, under 70 characters, ending with '?'.",
      example: "Confirm your order: me, forever?",
    },
    {
      path: "lockAnswer",
      label: "Yes button",
      kind: "text",
      max: 30,
      guide: "The label on the yes button, 2–4 words with one emoji, shopping-flavoured.",
      example: "Place order 💛",
    },
  ],
};
