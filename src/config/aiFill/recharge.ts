import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * recharge — "dilpay", a prepaid "relationship recharge" played like an Indian
 * payments app: operator-detected card, offer banners, plan tabs and cards, a
 * UPI payment sheet + PIN pad, the green success tick, a cashback scratch card,
 * the receipt note and a letter that pops in the corner.
 *
 * Paths resolve against `RechargeData` in
 * client/app/(templates)/recharge/components/types.ts, held as `mf` in
 * useRechargeEditor.ts. Every text leaf the page renders is declared here —
 * 40 fields, the ceiling. Photos are media and never declared.
 *
 * Structural keys (`categories[].id`, `plans[].id`, `plans[].categoryId`,
 * `plans[].disabled`) are joins, not prose, and stay out: a model rewriting an
 * id silently detaches a plan from its tab.
 *
 * The demo's plan slots are fixed and the guides say what each slot is:
 *   plans[0] → tab 1, the hero "forever" plan (the one that gets screenshotted)
 *   plans[1] → tab 2, the everyday best-value plan
 *   plans[2] → tab 3, a tiny ₹1-style top-up ("data" = hugs etc.)
 *   plans[3] → tab 4, the long-term / yearly plan
 *   plans[4] → tab 2, the greyed-out UNAVAILABLE plan (a habit they dropped)
 */

const ROWS_GUIDE =
  "Each item MUST be written as 'Label: Value' or 'Label: Value | note' — one colon, then an optional pipe and a small grey note. The first two items become the card's columns next to Validity, so their Label must be one or two words (Hugs, Calls, Reels, Dates, Roaming, Cuddles, Momos, Chai — pick labels from THEIR story; do not give every plan the same Calls/Texts pair, each plan needs at least one label no other plan uses) and their Value under 18 characters, formatted like telecom specs ('2 GB/day', 'Unlimited', '100/min'). The note after the pipe is where the joke lives — a specific detail from the story, under 70 characters.";

const BENEFITS_GUIDE =
  "Short benefit chips, written like bundled telecom perks but absurdly domestic and specific to these two. Each under 38 characters, no trailing full stop, no emoji at the start.";

function planFields(i: number, role: string, priceHint: string, validityHint: string): AiFillField[] {
  return [
    {
      path: `plans[${i}].price`,
      label: `Plan ${i + 1} price`,
      kind: "text",
      max: 10,
      guide: `The big price on plan ${i + 1} (${role}). Printed as-is, never parsed: keep the ₹ sign and keep it very short. ${priceHint}`,
      example: i === 0 ? "₹∞" : "₹84",
    },
    {
      path: `plans[${i}].validity`,
      label: `Plan ${i + 1} validity`,
      kind: "text",
      max: 18,
      guide: `Validity of plan ${i + 1}, formatted exactly like a telecom plan column. ${validityHint}`,
      example: "84 days",
    },
    {
      path: `plans[${i}].rows`,
      label: `Plan ${i + 1} what's included`,
      kind: "list",
      max: 4,
      itemMax: 110,
      guide: `${i === 4 ? "Exactly 2 items" : "EXACTLY 3 or 4 items (never fewer than 3)"} for plan ${i + 1} (${role}). ${ROWS_GUIDE}`,
      example: "Calls: Unlimited | even the 'nothing, you tell' ones",
    },
    {
      path: `plans[${i}].benefits`,
      label: `Plan ${i + 1} benefits`,
      kind: "list",
      max: i === 4 ? 1 : 4,
      itemMax: 44,
      guide: i === 4 ? "One flat, deadpan line saying this plan gave nothing." : `${i === 0 ? "4" : "2 to 3"} items. ${BENEFITS_GUIDE}`,
      example: "Weekly restaurant veto power",
    },
  ];
}

export const recharge: AiFillTemplateSchema = {
  slug: "recharge",
  audience: "partner",
  premise:
    "A parody mobile-recharge flow from an Indian payments app, made as a love letter. The recipient sees their own 'number' detected, offer banners, tabs of prepaid plans where every plan is an inside joke about the relationship (hugs are data, calls are the 2 AM calls, validity is 'Lifetime'), then pays with a UPI PIN, gets the green success tick, scratches a cashback card, and reads a payment note where the joking stops. Tone: Gen-Z, cute, playful — but the chrome copy must still read like real telecom/app microcopy. Every joke should come from a specific detail in the sender's story, never generic romance filler. Keep facts straight: who lives where, who is moving, what happened — never swap them.",
  forbiddenOutput: [
    ["Ji", "o"].join(""),
    ["Air", "tel"].join(""),
    ["Voda", "fone"].join(""),
    ["BS", "NL"].join(""),
    ["Pay", "tm"].join(""),
    ["Phone", "Pe"].join(""),
    ["Google", " Pay"].join(""),
    ["G", "Pay"].join(""),
    ["True", "caller"].join(""),
    ["Net", "flix"].join(""),
    ["Hot", "star"].join(""),
  ],
  fields: [
    {
      path: "subscriber.name",
      label: "Their name",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "What the sender actually calls the recipient — first name or the pet name they use in the story. Shown on the operator card, the PIN screen ('To: …') and the receipt. No surname unless the story uses one.",
      example: "Meera",
    },
    {
      path: "sender.name",
      label: "Your name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The sender's first name as the recipient would say it. Shown as 'Paid by' on the receipt and as the letter's signature.",
      example: "Karan",
    },
    {
      path: "subscriber.number",
      label: "Their number",
      kind: "text",
      max: 18,
      guide:
        "The mobile number being 'recharged'. Must NOT be a real dialable number: format '+91 9XXXX XXXXX' but hide a meaningful date from the story in the digits (e.g. an anniversary 14-02 → '+91 98200 14022'). Never output a plausible real person's number or the sender's actual number.",
      example: "+91 98200 14022",
    },
    {
      path: "subscriber.circle",
      label: "Circle",
      kind: "text",
      max: 24,
      guide: "The telecom 'circle' — really the city or state where the RECIPIENT lives now (not where they met, not where the sender lives), in flat official register (e.g. 'Mumbai', 'Karnataka', 'UP West').",
      example: "Pune",
    },
    {
      path: "currentPlan.expiresIn",
      label: "Expiry pill",
      kind: "text",
      max: 26,
      guide: "The red pill on the operator card saying how long the current plan has left. Real app phrasing, 3–5 words, starting with 'Expires'.",
      example: "Expires in 3 days",
    },
    {
      path: "currentPlan.note",
      label: "Expiry line",
      kind: "text",
      max: 110,
      guide:
        "The grey line under the expiry pill — the first joke on the page. Gen-Z, lowercase is fine, one emoji max, about what 'running out' means for these two (low cuddle balance, dry texting, missing them).",
      example: "cuddle balance critically low bestie 🪫 recharge before you start replying 'k'",
    },
    {
      path: "promos",
      label: "Offer banners",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide:
        "Exactly 4 offer-banner headlines, written like payments-app promo banners ('Flat ₹… cashback on…', 'Buy 1 get…', 'Refer and get…', 'Unlimited … No FUP'). Each about a specific thing from the story, each under 55 characters, and EVERY item must end with one emoji.",
      example: "Refer me to your mom, get lifetime biryani 🍛",
    },
    {
      path: "categories[0].label",
      label: "Tab 1",
      kind: "text",
      max: 18,
      guide: "First plan tab. Keep it the classic 'Popular' plus one emoji, or a two-word variant.",
      example: "Popular 🔥",
    },
    {
      path: "categories[1].label",
      label: "Tab 2",
      kind: "text",
      max: 18,
      guide: "Second tab — the 'Unlimited' category, reworded about love. Two words, no emoji.",
      example: "Unlimited Love",
    },
    {
      path: "categories[2].label",
      label: "Tab 3",
      kind: "text",
      max: 18,
      guide: "Third tab — the 'Data' top-up category, where data is something from their relationship (hugs, cuddles, voice notes). Format 'X = Data' or 'X Top-up'.",
      example: "Hugs = Data",
    },
    {
      path: "categories[3].label",
      label: "Tab 4",
      kind: "text",
      max: 18,
      guide: "Fourth tab — the long-term / annual plans. Two words.",
      example: "Forever Plans",
    },
    ...planFields(0, "the hero plan in tab 1 — the forever plan, the one they'll screenshot", "Almost always '₹∞'.", "'Lifetime', 'Forever' or 'No expiry'."),
    {
      path: "plans[0].badge",
      label: "Plan 1 ribbon",
      kind: "text",
      max: 18,
      guide: "The yellow ribbon on the hero plan, in real app ribbon style, 1–3 words.",
      example: "Most Recharged",
    },
    ...planFields(1, "the everyday best-value plan in tab 2", "A small rupee amount that means something to them (a date, an age, a count) — e.g. '₹84', '₹143'.", "A number of days, or a count of something from the story."),
    {
      path: "plans[1].badge",
      label: "Plan 2 ribbon",
      kind: "text",
      max: 18,
      guide: "Ribbon on the best-value plan, 1–2 words, real ribbon style.",
      example: "Best Value",
    },
    ...planFields(2, "a tiny top-up in tab 3 — the smallest possible dose of affection", "'₹1' or similarly tiny.", "'1 day' or 'Today only'."),
    ...planFields(3, "the long-term plan in tab 4 — the yearly commitment", "'₹365' or an amount that divides into ₹1/day.", "'365 days' or '1 year'."),
    ...planFields(4, "the greyed-out UNAVAILABLE plan in tab 2 — a bad habit from the story they agreed to drop (silent treatment, ghosting, leaving on seen)", "'₹0'.", "'—' or 'Discontinued'."),
    {
      path: "plans[4].disabledReason",
      label: "Why plan 5 is unavailable",
      kind: "text",
      max: 140,
      guide:
        "Shown in a pale red box in place of the button on the unavailable plan. Deadpan app-notice voice explaining that this habit was discontinued, naming a habit or fight that actually appears in the story (only fall back to a generic one if the story has none) and one specific detail about when or why it ended, ending with one emoji.",
      example: "Leaving-on-read was retired after the Diwali incident. Customer care has blocked it permanently 🚫",
    },
    {
      path: "cashback.title",
      label: "Scratch card prize",
      kind: "text",
      max: 60,
      guide:
        "What the recipient wins on the cashback scratch card after paying — a cute, specific, physical reward from the sender (a date, a food, a ritual they share), phrased like a real cashback prize. No 'You won' prefix (the card prints that).",
      example: "1 lifetime supply of forehead kisses",
    },
    {
      path: "cashback.note",
      label: "Scratch card small print",
      kind: "text",
      max: 120,
      guide: "The terms-and-conditions line under the prize, parodying real T&C voice (auto-credited, no expiry, non-transferable) in a sweet way.",
      example: "Auto-credited to your cheeks. No expiry. Non-transferable (I checked).",
    },
    {
      path: "receipt.message",
      label: "Receipt note",
      kind: "list",
      max: 4,
      itemMax: 220,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD — the payment note shown in a pink chat bubble after the green success tick. 3 short paragraphs, 180–420 characters total. The first line drops the bit, the middle says the real thing with one concrete detail from the story (get the facts exactly right — who lives where, who is moving), the last line lands it softly. No telecom puns except optionally the very last line.",
      example: "Okay, no jokes for one second.",
    },
    {
      path: "letter",
      label: "Main letter",
      kind: "longtext",
      max: 1100,
      required: true,
      guide:
        "The main love letter that opens from the envelope in the corner. 3–4 paragraphs separated by blank lines, 600–1000 characters, in the sender's voice, in the SAME language and script as the story (an English story gets an English letter). Do NOT start with 'Dear …' or the recipient's name (the page adds the greeting) and do NOT sign off (the page adds the signature). Weave in 2–3 specific details from the story; one light recharge/network metaphor at most, then be sincere.",
      example: "I tried to find a plan big enough for you and every single one had an expiry date, so I made my own.",
    },
    {
      path: "lockQuestion",
      label: "Question before the letter",
      kind: "text",
      max: 80,
      guide: "A cute yes/no question shown before the letter opens (its 'no' button runs away). Playful, about staying together, tied to something from the story if possible, ends with '?' and one emoji.",
      example: "Promise you'll never port out of us? 🥺",
    },
    {
      path: "lockAnswer",
      label: "Yes button",
      kind: "text",
      max: 26,
      guide: "The label on the yes button that answers the question, 2–4 words, can reference recharging, one emoji at the end.",
      example: "Recharge accepted 💗",
    },
  ],
};
