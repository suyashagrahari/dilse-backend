// ─── apology-dashboard — AI form-fill schema ─────────────────────────────────
//
// Editor state: `mf: ApologyData` in
// client/app/(templates)/apology-dashboard/hooks/useApologyEditor.ts, whose type
// is declared in .../components/types.ts. Every path below is a leaf of that
// interface; the array indices match the six `briberyItems` and three `timeline`
// entries that `DEMO_DATA` always seeds, so no patch ever writes past the end of
// a rendered array.
//
// Deliberately NOT addressable: senderPhoto, whackFaces, voiceUrl,
// scratchImages, scratchVoice, sharePhoto, backgroundMusic (media — rule 1),
// deliveryEmail (a real address the sender must type), briberyItems[].icon and
// timeline[].icon (2-char emoji fields, better left to the seeded defaults).

import type { AiFillTemplateSchema } from "./types";

export const apologyDashboard: AiFillTemplateSchema = {
  slug: "apology-dashboard",
  premise:
    "This is an apology built as a playful little app rather than a letter: the recipient opens a 'dashboard' where they scroll past a headline and a heartfelt sorry letter, scratch a card to reveal a hidden note, whack a cartoon version of the sender in a whack-a-mole game, walk a Memory Lane timeline, and finally tick off promises on a 'Sweet Bribery Desk' before signing a mock forgiveness agreement. The whole conceit only works if the joke is always aimed at the sender — he is the one being whacked, he is the one offering bribes — while the apology underneath stays completely sincere.",
  audience: "partner",
  fields: [
    {
      path: "senderName",
      label: "Sender's name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The first name of the person apologising, as their partner would say it. Just the name — no honorifics, no surname, no 'from'. If the story gives a pet name the partner actually uses for them, prefer that over the legal name.",
      example: "Aarav",
    },
    {
      path: "recipientName",
      label: "Recipient's name",
      kind: "text",
      max: 40,
      guide:
        "What the sender calls the person he is apologising to, as it appears in their story — a first name, or the pet name he genuinely uses out loud. Never a formal or full name he would not actually say. If the story never names her, leave this empty rather than inventing one; a wrong name is worse than a blank.",
      example: "Aditi",
    },
    {
      path: "relationship",
      label: "Relationship",
      kind: "enum",
      options: ["girlfriend", "boyfriend", "partner"],
      guide:
        "Who the page is addressed to. This drives the wording and the name of the whack-a-mole game, so read the story for the actual pairing. Choose 'partner' whenever the story does not make the gender clear — guessing wrong here is visible on every screen.",
    },
    {
      path: "headline",
      label: "Hero headline",
      kind: "text",
      max: 70,
      required: true,
      guide:
        "The big title on the very first screen. A plain, unembellished admission — the sentence you'd lead with if you had exactly one. Around five to eight words; one emoji at the end is fine and none is also fine. Do not be clever here: the playfulness lives in the games further down, and a joke in the first line makes the whole page look unserious.",
      example: "I'm really, really sorry 🥺",
    },
    {
      path: "subMessage",
      label: "Sub-message",
      kind: "longtext",
      max: 240,
      guide:
        "Two short sentences under the headline, in the sender's voice, telling her what this page is and that she can take it at her own pace. This is where you acknowledge the slightly ridiculous fact that he built an entire little app to say sorry — self-aware, warm, never smug. Around 25 to 40 words. It must not press her for a response: no 'please just talk to me', no 'I'll be waiting for your reply'.",
      example:
        "I built this whole little thing just to say it properly. Play with it, ignore the games, skip to the end — whatever you want. No rush.",
    },
    {
      path: "sorryLetter",
      label: "Sorry letter",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The heartfelt apology, on its own screen — the emotional core of the page, roughly 90 to 150 words. It must name the actual thing he did, taken from his story: the specific act, when it happened, and what it did to her. A generic 'sorry for everything' is precisely the failure this page exists to avoid. Move through: what I did, what it cost you, what I understand now that I didn't then, and the one concrete thing that changes. Write in the sender's own language and script; Hinglish stays Hinglish. Hard constraints — none of the page's playfulness reaches this field: no jokes, no bribery references, no emoji beyond at most one. Do not ask her to forgive him, do not attach a timeline to her feelings, do not dwell on how much he is suffering (that asks her to comfort him, which inverts the whole apology), and never explain what she did that contributed. If the story describes something genuinely serious — a betrayal, real cruelty — write it sober and stripped of charm, and do not lighten it.",
      example:
        "I know what I did on Saturday, and I've replayed it every day since. I dismissed something that mattered to you in front of people, and then I made you carry the rest of the evening as if nothing had happened. You spent weeks looking forward to that. What I understand now is that being right in the moment was worth nothing next to how you felt walking home. I'm not going to talk over you again. When I feel that heat coming up, I'm stepping outside instead of winning.",
    },
    {
      path: "scratchSecret",
      label: "Hidden scratch-card note",
      kind: "longtext",
      max: 200,
      guide:
        "The short line hidden under the scratch card — the reward for scratching, so it should feel like something small and private he wouldn't put on the first screen. One or two sentences, 15 to 30 words. Warm, specific to the two of them, and ideally not about the apology at all: a thing he loves, a running joke, a true small sentence. It is the one place on this page where sweetness can be unqualified. Do not use it to ask for anything.",
      example:
        "My favourite place in the world is still the passenger seat with you driving badly. That hasn't moved once.",
    },
    {
      path: "briberyItems[0].label",
      label: "Bribe 1",
      kind: "text",
      max: 60,
      guide:
        "The first promise on the 'Sweet Bribery Desk' — a checklist she ticks and which becomes a condition in the mock forgiveness agreement. Write it as a concrete, slightly over-generous offer of the sender's own time or effort, phrased like a line item: chores, cooking, driving, errands, whatever the story says she actually wants off her plate. Under 55 characters, no sentence-ending punctuation. It must cost the SENDER something — never something she has to do, and never a promise about her behaviour.",
      example: "All the chores for 7 days",
    },
    {
      path: "briberyItems[1].label",
      label: "Bribe 2",
      kind: "text",
      max: 60,
      guide:
        "The second bribery-desk promise. Same line-item register, under 55 characters, and materially different from the first — vary the category (food, time, errands, being driven somewhere, a night arranged entirely by him). Pull specifics from the story: her actual favourite dish or place beats a generic 'dinner'.",
      example: "Your favourite biryani tonight, on me",
    },
    {
      path: "briberyItems[2].label",
      label: "Bribe 3",
      kind: "text",
      max: 60,
      guide:
        "The third bribery-desk promise. Under 55 characters. This is a good slot for the one that is openly funny — the joke landing on how much the sender is willing to suffer (a show he hates, a family function, losing an argument on purpose). The comedy must never be at her expense or about the thing he is apologising for.",
      example: "I sit through your show. No commentary.",
    },
    {
      path: "briberyItems[3].label",
      label: "Bribe 4",
      kind: "text",
      max: 60,
      guide:
        "The fourth bribery-desk promise. Under 55 characters. Give this one to plain affection rather than a service — the kind of thing she would tick without thinking. Keep it warm and completely non-physical beyond a hug.",
      example: "Unlimited hugs, no questions asked",
    },
    {
      path: "briberyItems[4].label",
      label: "Bribe 5",
      kind: "text",
      max: 60,
      guide:
        "The fifth bribery-desk promise. Under 55 characters. Reach for something specific to these two from the story — a place they go, a routine of theirs, a thing she has been asking for. A generic offer here is a wasted slot; if the story gives you nothing usable, leave it empty rather than padding.",
      example: "That trip you keep mentioning. I'll book it.",
    },
    {
      path: "briberyItems[5].label",
      label: "Bribe 6",
      kind: "text",
      max: 60,
      guide:
        "The sixth and last bribery-desk promise. Under 55 characters. Close the list with the smallest, most ordinary one — the daily thing rather than the grand gesture, since that is the one that reads as sincere.",
      example: "Coffee in bed, every morning this week",
    },
    {
      path: "timeline[0].title",
      label: "Memory chapter 1 — title",
      kind: "text",
      max: 50,
      guide:
        "The heading of the first chapter on the Memory Lane timeline. The page's house style is 'Chapter I — The Spark', so keep that shape: a roman-numeral chapter label, an em dash, and two or three words naming the era. Under 45 characters. This first one covers how they met or began.",
      example: "Chapter I — The Spark",
    },
    {
      path: "timeline[0].text",
      label: "Memory chapter 1 — text",
      kind: "text",
      max: 120,
      guide:
        "One sentence under the first chapter title, 15 to 25 words, about how the two of them started — drawn from the sender's story, not a generic beginning. Slightly heightened and affectionate is right for this section; it is the part of the page that is allowed to be romantic. Keep it to one sentence, since it renders as a single line in a small timeline node.",
      example: "The day you were three hours late and I waited anyway, which should have told us both everything.",
    },
    {
      path: "timeline[1].title",
      label: "Memory chapter 2 — title",
      kind: "text",
      max: 50,
      guide:
        "Heading of the second Memory Lane chapter, same 'Chapter II — Two Or Three Words' shape, under 45 characters. This middle one covers the private stuff that accumulated: inside jokes, habits, the shorthand only they use.",
      example: "Chapter II — Inside Jokes",
    },
    {
      path: "timeline[1].text",
      label: "Memory chapter 2 — text",
      kind: "text",
      max: 120,
      guide:
        "One sentence, 15 to 25 words, under the second chapter title. This is the slot for a specific shared reference from the story — a phrase they say, a running joke, a thing that means nothing to anyone else. Concrete beats sweet here; if the story hands you the actual joke, use it.",
      example: "Half a dictionary of words that only work if you're in the room.",
    },
    {
      path: "timeline[2].title",
      label: "Memory chapter 3 — title",
      kind: "text",
      max: 50,
      guide:
        "Heading of the third and final Memory Lane chapter, same 'Chapter III — Two Or Three Words' shape, under 45 characters. This one lands on where they are now — steadiness, depth, staying.",
      example: "Chapter III — Growing Closer",
    },
    {
      path: "timeline[2].text",
      label: "Memory chapter 3 — text",
      kind: "text",
      max: 120,
      guide:
        "One sentence, 15 to 25 words, closing the timeline. It should quietly connect to the apology without restating it: the point is that this thing is bigger than the mistake, said without ever implying she therefore has to let it go. Never write anything resembling 'after everything we've been through, you can forgive this' — that is the one sentence that would poison the whole page.",
      example: "Roots now, not just butterflies. Which is exactly why I hated getting this one wrong.",
    },
  ],
};
