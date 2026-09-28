// ─── AI fill — flags ─────────────────────────────────────────────────────────
//
// Paths address `mf: FlagsData` in
// client/app/(templates)/flags/hooks/useFlagsEditor.ts:51 (`useState<FlagsData>`
// seeded from DEMO_DATA), declared in
// client/app/(templates)/flags/components/types.ts:57.
//
//   cards: FlagCard[]      — types.ts:60. An array of OBJECTS (statement,
//                            responses{red,green,complicated}, truth, kind), so
//                            every slot is a flat numbered path. It is NOT a
//                            string[] and must not be declared as a `list`.
//   cards[n].responses      — a Record<SwipeChoice,string>, addressed as
//                            `cards[0].responses.red` etc.
//   cards[7]                — the SINCERE card in the seeded form (types.ts:285).
//                            `kind: "sincere"` is drag-locked and carries no
//                            responses by design, so only its statement is filled.
//   sender.photoUrl         — media. Never declared. (Rule 1.)
//   truth / kind            — the sender's own verdict and the card's mechanic.
//                            Left to the sender; see the note at the end.
//
// A blank response is the ONE thing that silently breaks this template (swipe
// that way and the card flips to nothing), so the budget is spent on FULLY
// authored cards rather than on many bare statements.

import type { AiFillTemplateSchema } from "./types";

/** The editor hard-slices `statement` at 70 and shows a warning past it. */
const STATEMENT = 70;
/** One line of handwriting on the back of a card. */
const RESPONSE = 110;

export const flags: AiFillTemplateSchema = {
  slug: "flags",
  premise:
    "This is a deck of cards laid out like a dating app, except every card is a statement about the SENDER — one of his own habits, flaws or small decencies — and the recipient swipes to judge it: left for RED FLAG, right for GREEN FLAG, up for BEIGE FLAG (the Gen-Z word for a quirk that is neither good nor bad, just odd — 'it's complicated'). Whichever way she swipes, the card flips over and the sender has already written a reply to that exact verdict, so all three replies must exist and all three must be worth reading. At the end she gets a scorecard about her own generosity, never about him, and then an 'It's a match' screen that opens his real love letter — the one place the jokes stop.",
  audience: "partner",
  fields: [
    {
      path: "sender.name",
      label: "Your name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The name of the person being judged — the sender, whose flaws the whole deck is made of. First name only, as it would appear on a profile.",
      example: "Rohan",
    },
    {
      path: "sender.tagline",
      label: "Profile tagline",
      kind: "text",
      max: 110,
      required: true,
      guide:
        "The bio line under the sender's name on the opening profile screen, written in the flat self-deprecating register of a real dating profile — one absurd irrelevant fact, then one honest admission, separated by a full stop. Two short clauses, under 110 characters, no emoji, no hashtags. It must be about the SENDER, never a description of her.",
      example: "Bad at texting. Reliably present for everything that actually matters.",
    },

    // ── Four fully authored flag cards. Each one is a statement plus all
    //    three replies, because the swipe direction is the mechanic. Each card
    //    is given a different territory so four cards do not arrive as four
    //    versions of "he is bad at replying".
    {
      path: "cards[0].statement",
      label: "Card 1 — the indefensible habit",
      kind: "text",
      max: STATEMENT,
      required: true,
      guide:
        "One of the sender's habits that he genuinely cannot defend and that she has definitely complained about — replying slowly, never being on time, leaving things everywhere. Written in the third person about him, lowercase, no full stop, under 70 characters. It must describe HIM. Never write a statement about her habits, her family, her body or her work; the entire joke of this template is that the sender is the one on trial.",
      example: "he takes 45 minutes to reply to a one-word question",
    },
    {
      path: "cards[0].responses.red",
      label: "Card 1 — if she calls it a RED FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply on the back of the card when she has judged this a red flag. Concede it completely — no excuse, no 'but'. One or two short sentences, lowercase, under 110 characters, and it should sound like it was said out loud rather than written.",
      example: "correct. no defence. I'm working on it.",
    },
    {
      path: "cards[0].responses.green",
      label: "Card 1 — if she calls it a GREEN FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she has been unreasonably generous and called this indefensible habit a green flag. Refuse the compliment, gently — tell her she is being too kind and that it is still a red flag. One or two short sentences, lowercase, under 110 characters.",
      example: "generous of you. it is still a red flag. I'm working on it.",
    },
    {
      path: "cards[0].responses.complicated",
      label: "Card 1 — if she calls it a BEIGE FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she has hedged and called it complicated. Refuse the hedge, cheerfully — insist it is simply a flaw and not a nuance. One or two short sentences, lowercase, under 110 characters.",
      example: "nothing complicated about it. I'm just slow. fair enough though.",
    },

    {
      path: "cards[1].statement",
      label: "Card 2 — the thing that is quietly good",
      kind: "text",
      max: STATEMENT,
      required: true,
      guide:
        "Something the sender does that is unglamorous and genuinely decent, stated flatly so it could plausibly be read either way — calling his mother every day, remembering everything, always carrying an extra charger. Third person about him, lowercase, no full stop, under 70 characters.",
      example: "he calls his mother every single day",
    },
    {
      path: "cards[1].responses.red",
      label: "Card 2 — if she calls it a RED FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's mock-wounded reply to being called out for something that is obviously good. Play offended, stay warm, do not actually argue with her. One or two short sentences, lowercase, under 110 characters.",
      example: "harsh. she's lovely and you know it.",
    },
    {
      path: "cards[1].responses.green",
      label: "Card 2 — if she calls it a GREEN FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender agrees with her, then adds one specific detail she did not know — the small extra fact that turns a nice habit into a real one. One or two short sentences, lowercase, under 110 characters.",
      example: "correct. and she asks about you first, every time.",
    },
    {
      path: "cards[1].responses.complicated",
      label: "Card 2 — if she calls it a BEIGE FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she hedges on something straightforwardly good — tell her this one is not complicated, it is just nice, and let her have the moment. One or two short sentences, lowercase, under 110 characters.",
      example: "nothing complicated there. that one's just good.",
    },

    {
      path: "cards[2].statement",
      label: "Card 3 — the thing that is genuinely his fault",
      kind: "text",
      max: STATEMENT,
      required: true,
      guide:
        "The habit the sender actually needs to fix and knows it — saying he is fine when he is not, going quiet under stress, never asking for help. Third person about him, lowercase, no full stop, under 70 characters. This is the card with real weight in it, so keep it honest rather than cute, and keep it strictly about him.",
      example: "he says 'I'm fine' when he is very obviously not fine",
    },
    {
      path: "cards[2].responses.red",
      label: "Card 3 — if she calls it a RED FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she has correctly identified the real problem. Agree without deflecting and without a joke — this is the one place in the deck the comedy drops. One or two short sentences, lowercase, under 110 characters.",
      example: "yeah. that's the one I actually need to fix.",
    },
    {
      path: "cards[2].responses.green",
      label: "Card 3 — if she calls it a GREEN FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she has been kind about the thing that is genuinely his fault. Ask her not to reward it — warmly, not sternly. One or two short sentences, lowercase, under 110 characters.",
      example: "please don't reward that one. it isn't a good trait.",
    },
    {
      path: "cards[2].responses.complicated",
      label: "Card 3 — if she calls it a BEIGE FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she hedges here — this is the one card where the hedge is the most honest answer, so let him say so. One or two short sentences, lowercase, under 110 characters.",
      example: "okay. that's the honest answer. it is complicated.",
    },

    {
      path: "cards[3].statement",
      label: "Card 4 — the shared and harmless one",
      kind: "text",
      max: STATEMENT,
      required: true,
      guide:
        "A small domestic habit of the sender's that only exists because of the two of them — never finishing a series they started together, keeping every ticket stub, falling asleep first every single time. Third person about him, lowercase, no full stop, under 70 characters. Aim the joke at him or at the shared habit, never at her.",
      example: "he has never once finished a series you started together",
    },
    {
      path: "cards[3].responses.red",
      label: "Card 4 — if she calls it a RED FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender pleads guilty with one specific, faintly ridiculous supporting detail. One or two short sentences, lowercase, under 110 characters.",
      example: "guilty. I am four episodes behind you right now.",
    },
    {
      path: "cards[3].responses.green",
      label: "Card 4 — if she calls it a GREEN FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's disbelief that she has let him off for this. Play it as mock-alarm at how forgiving she is. One or two short sentences, lowercase, under 110 characters.",
      example: "you cannot possibly think that's fine.",
    },
    {
      path: "cards[3].responses.complicated",
      label: "Card 4 — if she calls it a BEIGE FLAG",
      kind: "text",
      max: RESPONSE,
      required: true,
      guide:
        "The sender's reply when she hedges — confess the ridiculous detail that genuinely does complicate it. One or two short sentences, lowercase, under 110 characters.",
      example: "complicated because I do watch them. just alone. at 2 AM. sorry.",
    },

    {
      path: "cards[7].statement",
      label: "The sincere card",
      kind: "text",
      max: STATEMENT,
      required: true,
      guide:
        "The one card in the deck that cannot be swiped. It is pinned about two-thirds of the way through, it is locked in place, it has no punchline and it is the reason the whole deck exists. Name one specific thing the SENDER did for her that he has never brought up since — a week he showed up for, a night he drove somewhere, something he quietly handled. Third person about him, lowercase, one sentence, under 70 characters. No joke, no wink, and nothing that asks her for anything in return.",
      example: "he was there the week your father was in hospital, and never mentioned it again.",
    },

    {
      path: "letter",
      label: "The match letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The love letter that opens on the final 'It's a match' screen, after she has judged every card and seen her scorecard. This is where the comedy drops completely. Open with her name on its own line, then two to four short paragraphs, then sign off with the sender's first name on the last line. Tie it to the game once and lightly — whatever she swiped, he would still swipe right on her — then get sincere: one concrete shared memory from the story and one thing he has never said out loud. First person, simple warm English, no lists, no emoji, no rhymes, and nothing that asks her for a reply. Blank lines between paragraphs, under 1000 characters.",
      example:
        "Ananya,\n\nYou just judged eleven of my worst habits and somehow I still came out at a 96. I'd swipe right on you every single time, even on the days you call my snoring a green flag.\n\nI still think about the drive back from Lonavala when you fell asleep with your hand on the gear stick and I didn't change gears for forty minutes.\n\nI don't say it enough: you make the ordinary days the best ones.\n\nRohan",
    },
    {
      path: "lockQuestion",
      label: "The question before the letter",
      kind: "text",
      max: 120,
      required: false,
      guide:
        "A playful one-line yes/no question she must answer before the match letter opens, phrased like a dating-app prompt and aimed at the sender — something only a yes makes sense for. Lowercase, under 60 characters, ending in a question mark, no emoji.",
      example: "swipe right on me for another year?",
    },
    {
      path: "lockAnswer",
      label: "The yes button",
      kind: "text",
      max: 40,
      required: false,
      guide:
        "The label of the only button that answers the question above and opens the letter — a short, eager yes in the same lowercase texting voice. Two to four words, under 24 characters, may end with one emoji.",
      example: "obviously, yes 💚",
    },
    {
      path: "finalCard",
      label: "The closing card",
      kind: "longtext",
      max: 240,
      required: true,
      guide:
        "The last card, shown after the scorecard, once she has finished judging him. Two short sentences, under 200 characters, lowercase, addressed straight to her: acknowledge that she has just spent the whole deck being far kinder about him than he would have been, and thank her for staying. It must not guilt her, ask her for a reply, or reference any obligation — it closes the joke warmly and stops.",
      example:
        "You just spent eleven cards judging me and still gave me a 96. I'd have gone lower. Thanks for staying.",
    },
  ],
};

// Left out on purpose:
//
//   recipientName — renders once, lowercased, in a byline on the scorecard. The
//     sender types it in the sheet in three seconds, and a slot spent on it is a
//     whole flag card (statement + three replies) not written.
//   cards[n].truth — the sender's own verdict on himself. It drives the "HE SAYS"
//     strip, the OVERRULED stamp and the compatibility number, and it is a
//     judgement about a real person's real habits that only he can make.
//   cards[n].kind — 'sincere' drag-locks a card and blanks its responses. A model
//     flipping this by accident silently removes a card from the deck.
//   sender.age, sender.photoUrl — a number the sender knows and a photograph.
//   cards[4] … cards[6], cards[8] … — the seeded deck holds eleven cards and a
//     twenty-field budget buys four complete ones plus the sincere card. The
//     remaining cards stay in the form for the sender to rewrite or delete.
