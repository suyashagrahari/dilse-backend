import type { AiFillTemplateSchema } from "./types";

/**
 * nutrition — a parody regulatory nutrition panel where the product is a person.
 *
 * Paths resolve against `NutritionData` in
 * client/app/(templates)/nutrition/components/types.ts, held as `mf` in
 * useNutritionEditor.ts.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 *
 * `amount`, `dv`, `bold`, `indent` and `calories` are the panel's STRUCTURE —
 * the bold/indent hierarchy is what makes the thing read as a real label, and a
 * model rewriting an indent level flattens the whole design into a list. The
 * amounts and percentages are printed as free text and are funnier when the
 * sender picks them, so they stay in the form.
 *
 * `photoUrl` is media and could not be declared here even if we wanted it.
 *
 * The register the guides keep asking for is FLAT. This template is funny
 * because the type is dead serious and the copy never winks — a nutrient note
 * that tries to be a joke is much less funny than one that states an absurd
 * fact in the voice of a compliance document. The only field allowed to drop
 * the act is `message`, and the whole template is built around that break.
 */
export const nutrition: AiFillTemplateSchema = {
  slug: "nutrition",
  audience: "bestfriend",
  premise:
    "A parody nutrition-facts panel printed on a package, where the product is a person. It looks exactly like the regulatory panel on the back of a snack box: 8px type, hard black rules, bold major nutrients with indented sub-nutrients, a % Daily Value column, an ingredients paragraph and an allergen warning. Every nutrient is a trait of that person, and tapping a row reveals the sender's line about it. Below the package, in a completely different voice and a readable serif, the sender says the sincere thing. The comedy is 100% in the copy and it only lands because the design never breaks character — so write like a compliance document that happens to be about somebody you love, and save the warmth for the message at the end.",
  forbiddenOutput: [
    "Aditi",
    "FDA",
    "USDA",
    "Nestle",
    "Nestlé",
    "Kellogg",
    "Cadbury",
    "Britannia",
    "Parle",
    "Amul",
    "Maggi",
    "Oreo",
    "Nutella",
    "Pepsi",
    "Coca-Cola",
    "Lay's",
    "Haldiram",
    "Bournvita",
  ],
  fields: [
    {
      path: "productName",
      label: "The product",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "Printed above the panel as the product name — it is the person this label is about. Use the name the sender actually calls them, exactly as it appears in their story. A full name reads more official and is usually funnier than a nickname, but never invent a surname they did not give.",
      example: "Meera Sharma",
    },
    {
      path: "servingSize",
      label: "Serving size",
      kind: "text",
      max: 40,
      guide:
        "The 'Serving size' line at the top of the panel, in the flat regulatory register. Almost always a quantity of the person themselves. Under 20 characters.",
      example: "1 Meera",
    },
    {
      path: "servingsPerContainer",
      label: "Servings per container",
      kind: "text",
      max: 60,
      guide:
        "The line above serving size. This is the first joke on the label and it should be delivered completely straight — a number followed by a parenthetical clarification that is technically accurate and quietly fond.",
      example: "1 (there is only one)",
    },
    {
      path: "caloriesNote",
      label: "Note under the calories",
      kind: "text",
      max: 50,
      guide:
        "Nine-pixel italic sitting under the big calorie figure, right-aligned. The calorie count itself is set by the sender and is usually an infinity sign, so this line is the wry footnote to it. Four or five words, lowercase, no punctuation at the end.",
      example: "worth every one",
    },

    // ── The nutrient rows ──────────────────────────────────────────────────
    // Eight declared rows: enough for a real bold/indent hierarchy without
    // pushing the panel past the point where it stops reading as a label. The
    // sender's form keeps the rest.
    {
      path: "nutrients[0].label",
      label: "Nutrient 1 — name",
      kind: "text",
      max: 34,
      required: true,
      guide:
        "The first and most prominent nutrient — a bold major row, so this should be the single biggest thing about them. Written like a nutrient, not like a compliment: a noun phrase in Title Case, no verbs, no 'Amount of'. Keep it under 24 characters or it wraps.",
      example: "Total Loyalty",
    },
    {
      path: "nutrients[0].note",
      label: "Nutrient 1 — the sender's line",
      kind: "text",
      max: 220,
      required: true,
      guide:
        "Revealed when the recipient taps this row, in 8px type inside the panel. One or two sentences, warm but still deadpan, naming a REAL thing from the sender's story that proves the nutrient above it. This is where the template earns its second read, so no generic praise — a specific evening, a specific text message, a specific favour.",
      example: "Drove four hours in the rain because I said I was fine on the phone.",
    },
    {
      path: "nutrients[1].label",
      label: "Nutrient 2 — name",
      kind: "text",
      max: 34,
      guide:
        "An indented sub-nutrient under the first one — a narrower, more specific version of it, exactly as 'Saturated Fat' sits under 'Total Fat'. Same flat noun-phrase register.",
      example: "Saturated Loyalty",
    },
    {
      path: "nutrients[1].note",
      label: "Nutrient 2 — the sender's line",
      kind: "text",
      max: 220,
      guide:
        "The tap-to-reveal line for nutrient 2. One or two sentences, concrete, in the same flat voice.",
      example: "The kind that does not thin out when it is inconvenient.",
    },
    {
      path: "nutrients[2].label",
      label: "Nutrient 3 — name",
      kind: "text",
      max: 34,
      guide:
        "A bold major nutrient. Pick a trait from a different part of the person than nutrient 1 — the panel is duller when every row is about the same quality.",
      example: "Total Chaos",
    },
    {
      path: "nutrients[2].note",
      label: "Nutrient 3 — the sender's line",
      kind: "text",
      max: 220,
      guide: "The tap-to-reveal line for nutrient 3. Concrete, specific, deadpan.",
      example: "Has never once left a house without going back in for something.",
    },
    {
      path: "nutrients[3].label",
      label: "Nutrient 4 — name",
      kind: "text",
      max: 34,
      guide: "An indented sub-nutrient under nutrient 3. A narrower cut of the same trait.",
      example: "Of which, Group Chat Chaos",
    },
    {
      path: "nutrients[3].note",
      label: "Nutrient 4 — the sender's line",
      kind: "text",
      max: 220,
      guide: "The tap-to-reveal line for nutrient 4.",
      example: "Forty-one messages about a restaurant we did not go to.",
    },
    {
      path: "nutrients[4].label",
      label: "Nutrient 5 — name",
      kind: "text",
      max: 34,
      guide:
        "A bold major nutrient. This is a good slot for something the person would themselves admit is a flaw — a label that only somebody who loves them could print, which is exactly what makes it affectionate rather than cruel.",
      example: "Unsolicited Advice",
    },
    {
      path: "nutrients[4].note",
      label: "Nutrient 5 — the sender's line",
      kind: "text",
      max: 220,
      guide:
        "The tap-to-reveal line for nutrient 5. If the row above is a flaw, this is the line that turns it — state the flaw plainly, then the reason the sender would not remove it.",
      example: "Almost always right, which is the annoying part.",
    },
    {
      path: "nutrients[5].label",
      label: "Nutrient 6 — name",
      kind: "text",
      max: 34,
      guide: "A bold major nutrient. Something small and domestic works well this far down the panel.",
      example: "Dietary Nonsense",
    },
    {
      path: "nutrients[5].note",
      label: "Nutrient 6 — the sender's line",
      kind: "text",
      max: 220,
      guide: "The tap-to-reveal line for nutrient 6.",
      example: "Explained cricket to me three separate times. I still do not know.",
    },
    {
      path: "nutrients[6].label",
      label: "Nutrient 7 — name",
      kind: "text",
      max: 34,
      guide:
        "A bold major nutrient. One of the eight should be noticeably longer than the others so the panel wraps somewhere — a label that never wraps looks drawn rather than printed. This is a good one to make long.",
      example: "Emotionally Available Protein",
    },
    {
      path: "nutrients[6].note",
      label: "Nutrient 7 — the sender's line",
      kind: "text",
      max: 220,
      guide: "The tap-to-reveal line for nutrient 7.",
      example: "Asked the second question. Nobody asks the second question.",
    },
    {
      path: "nutrients[7].label",
      label: "Nutrient 8 — name",
      kind: "text",
      max: 34,
      guide:
        "The last nutrient before the rule. A good closing row is one with no measurable amount at all — a trait that cannot be quantified, printed as though somebody tried.",
      example: "Being Around",
    },
    {
      path: "nutrients[7].note",
      label: "Nutrient 8 — the sender's line",
      kind: "text",
      max: 220,
      guide: "The tap-to-reveal line for nutrient 8. The warmest of the eight, but still in the flat voice.",
      example: "No quantity given. There has never been a shortage.",
    },

    // ── The small block below the medium rule ──────────────────────────────
    {
      path: "vitamins[0].label",
      label: "Vitamin 1",
      kind: "text",
      max: 34,
      guide:
        "The smaller block under the heavy rule, where a real panel lists Vitamin D, Calcium, Iron. Same construction here, but the vitamin is a trait: two or three words, Title Case, no note of explanation in the label itself.",
      example: "Vitamin D (Sunlight)",
    },
    {
      path: "vitamins[0].note",
      label: "Vitamin 1 — the sender's line",
      kind: "text",
      max: 200,
      guide: "Tap-to-reveal line for the first vitamin. One short sentence.",
      example: "Genuinely brighter rooms. I have checked.",
    },
    {
      path: "vitamins[1].label",
      label: "Vitamin 2",
      kind: "text",
      max: 34,
      guide: "The second vitamin row. Same register as the first.",
      example: "Iron (Will)",
    },
    {
      path: "vitamins[1].note",
      label: "Vitamin 2 — the sender's line",
      kind: "text",
      max: 200,
      guide: "Tap-to-reveal line for the second vitamin. One short sentence.",
      example: "Finished the thing everyone told her to drop.",
    },
    {
      path: "vitamins[2].label",
      label: "Vitamin 3",
      kind: "text",
      max: 34,
      guide: "The third vitamin row. Same register.",
      example: "Potassium (Backbone)",
    },
    {
      path: "vitamins[2].note",
      label: "Vitamin 3 — the sender's line",
      kind: "text",
      max: 200,
      guide: "Tap-to-reveal line for the third vitamin. One short sentence.",
      example: "Said the unpopular thing at the table and did not take it back.",
    },

    // ── The dry lines ──────────────────────────────────────────────────────
    {
      path: "notSignificantSource",
      label: "Not a significant source of…",
      kind: "list",
      max: 6,
      itemMax: 40,
      required: true,
      guide:
        "Joined by the renderer into the single line 'Not a significant source of ___, ___ and ___.' set in the driest, smallest type on the label — and it is the funniest line on the page precisely because of that. Four to six items, each ONE OR TWO WORDS, all lowercase, all nouns. These are the things the person genuinely does not have, listed like trace minerals. Do not write a sentence; write ingredients.",
      example: "punctuality",
    },
    {
      path: "footnote",
      label: "The % Daily Value footnote",
      kind: "longtext",
      max: 260,
      required: true,
      guide:
        "The small-print paragraph under the heavy rule, where a real panel explains that percentages are based on a 2,000 calorie diet. Open in exactly that bureaucratic construction and then substitute the person for the diet, so the sentence stays regulatory while the meaning turns. One or two sentences, no exclamation marks, no emoji.",
      example:
        "2,000 calories a day is used for general nutrition advice. One of her a day is used for everything else.",
    },
    {
      path: "ingredients",
      label: "Ingredients",
      kind: "list",
      max: 12,
      itemMax: 60,
      required: true,
      guide:
        "Joined with commas into one dense unbroken paragraph that is deliberately hard to read, exactly like a real ingredients list. Eight to twelve items. Mix plain traits with mock-technical constructions — parentheticals, percentages, 'contains one or more of the following', an E-number-shaped code. All lowercase except proper nouns. This block is scanned, not read, so it works by texture; the reward is for the one person who actually reads it.",
      example: "unsolicited playlists (14%), stubbornness, water",
    },
    {
      path: "allergen",
      label: "Allergen warning",
      kind: "text",
      max: 90,
      required: true,
      guide:
        "Set in 9px bold capitals in its own box, the way a real allergen warning is. MUST begin with the word CONTAINS followed by a colon, then two to four things about the person that a stranger would want warning about. Comma-separated, no full stop.",
      example: "CONTAINS: sarcasm, strong opinions",
    },
    {
      path: "message",
      label: "The message",
      kind: "list",
      max: 4,
      itemMax: 400,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD, and the only field that leaves the joke behind. It is rendered BELOW the package in a readable serif at a comfortable size, so the reader goes from 8px regulatory density straight into real writing — that tonal break is the entire point of this template. Two to four paragraphs, 200 to 500 characters total. No nutrition vocabulary, no percentages, no callback to the labels above, no jokes at all. Just the sender saying the thing plainly, with one concrete detail from their story that means it could not have been written about anybody else.",
      example: "I made you a label because I did not know how else to say it. There is no daily value for you.",
    },
  ],
};
