// ─── AI fill — vending-machine ───────────────────────────────────────────────
//
// Paths address `mf: VendingData` in
// client/app/(templates)/vending-machine/hooks/useVendingMachineEditor.ts:61
// (`useState<VendingData>` seeded from DEMO_DATA with the slots cloned),
// declared in client/app/(templates)/vending-machine/components/types.ts:38.
//
//   slots: Slot[]              — types.ts:42. An array of OBJECTS
//                                ({code, kind, label, payload, price, soldOut,
//                                sticks}), so a slot is addressed
//                                `slots[3].label` / `slots[3].payload`. NOT a
//                                string[], so it cannot be a `list`.
//                                Seeded order is A1…A6, B1…B6, C1…C6, so index 0
//                                is A1, index 6 is B1. Index 0 (A1) is the
//                                RESERVED slot that never vends and is left alone.
//   creditPrompts: string[]    — types.ts:44. A genuine array of STRINGS → ONE
//   displayIdleMessages: …[]     `list` field, not numbered paths.
//   letter: string             — the love-kit main letter, printed as the
//                                secret prize at the foot of the receipt.
//
// `photos[]` (the memory cards) is media — its caption/note leaves sit under a
// media-word path and the list is empty until the sender adds photos, so they
// are left to the sender. `gifs` and `theme` are not copy.

import type { AiFillTemplateSchema } from "./types";

/** SHELF_LABEL_MAX = 22 (types.ts:74); past it the shelf tag is ellipsised. */
const SHELF = 22;
/** The coupon starts scrolling past 300 characters (Coupon.tsx:17). */
const PAYLOAD = 300;

export const vendingMachine: AiFillTemplateSchema = {
  slug: "vending-machine",
  premise:
    "This is a vending machine standing in a corridor, stocked entirely by one person for one other person. Eighteen slots on three shelves, each with a printed tag behind the glass and something folded inside it; the machine does not take coins — it asks a question, and her answer is the payment — and when she punches in a code the coil turns, the item drops and unfolds into a coupon carrying the full text. You are stocking the machine: what is written on each shelf tag, and what she finds when the item drops.",
  audience: "partner",
  fields: [
    {
      path: "machineName",
      label: "Name on the front of the machine",
      kind: "text",
      max: 28,
      required: true,
      guide:
        "The name stencilled across the top of the machine, set in ALL CAPS in a stencil face. Two words in the deadpan register of real industrial signage — a noun that should not be dispensable, followed by DISPENSER, UNIT, VENDOR or CO. Under 28 characters. The straight face is the whole joke; no exclamation marks, no hearts.",
      example: "AFFECTION DISPENSER",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The name of the person who stocked the machine. It is printed under the keypad and, more importantly, in the notice above the answer box that tells her exactly who her answers go to — so use the name she would recognise instantly.",
      example: "Rohan",
    },
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The name of the only person this machine will serve, as the sender actually says it. One or two words.",
      example: "Ananya",
    },
    {
      path: "creditPrompts",
      label: "What the machine asks for",
      kind: "list",
      max: 5,
      itemMax: 70,
      required: true,
      guide:
        "The questions the machine asks before it will release anything — her typed answer is the coin. Write 5. Each is ONE question in ALL CAPS, under 70 characters, in the clipped imperative of a machine that has been programmed by someone who knows her ('ONE THING YOU LOVE ABOUT HIM', 'THE LAST TIME HE MADE YOU LAUGH'). No question marks. They must be answerable in a single line by someone standing in a corridor with a phone in one hand, and easy enough that nobody is ever locked out — never ask for a promise, a commitment, or anything she might not want to put in writing. Refer to the sender in the third person the way a machine would.",
      example: "SOMETHING YOU'VE NEVER SAID OUT LOUD",
    },

    // ── Eight of the eighteen slots. The seeded machine already assigns each
    //    slot a kind (compliment / memory / voucher) which colours its tag and
    //    icon, so each guide below writes to the kind that slot already has.
    {
      path: "slots[1].label",
      label: "A2 — shelf tag (a compliment)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot A2, which dispenses a compliment. Write it like a product name on a shelf strip, not like a sentence: lowercase, 2 to 4 words, no full stop. Name the version of her the compliment is about ('you, arguing'). Hard limit 22 characters — past that the shelf tag is cut off with an ellipsis, though the coupon still carries the full text.",
      example: "you, arguing",
    },
    {
      path: "slots[1].payload",
      label: "A2 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The compliment printed on the coupon that falls out of A2, addressed to her. One or two sentences, under 300 characters. Compliment something she does rather than how she looks — a way she argues, decides, handles people — and include the faintly annoying part of it, because a compliment with a complaint inside it is the only kind she will believe.",
      example:
        "You argue like someone who has already decided, and you are usually right, which is the annoying part.",
    },
    {
      path: "slots[2].label",
      label: "A3 — shelf tag (a memory)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot A3, which dispenses a memory. Lowercase, 2 to 4 words, under 22 characters — a memory filed by its object or its hour, the way it would be labelled on a shelf ('the 2 AM maggi').",
      example: "the 2 AM maggi",
    },
    {
      path: "slots[2].payload",
      label: "A3 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The memory on the coupon from A3. Two or three sentences, under 300 characters, told as one continuous run of concrete detail — where they were, what went wrong, what she said. End on the small admission the sender never made at the time.",
      example:
        "The night the gas went out and we ate half-cooked maggi on the floor and you said it was the best meal of your life. You were lying. I still think about it.",
    },
    {
      path: "slots[3].label",
      label: "A4 — shelf tag (a voucher)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot A4, which dispenses a voucher — a thing she can actually redeem from the sender. Write it exactly like stock in a machine: a quantity, then the item, lowercase, under 22 characters. Make it the thing he is worst at giving.",
      example: "one (1) real apology",
    },
    {
      path: "slots[3].payload",
      label: "A4 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The voucher terms printed on the coupon from A4, written in flat redemption language — 'Redeemable for…', then the conditions, then an expiry. One or two sentences, under 300 characters. It must be a real thing the sender will actually honour, with no conditions attached to her behaviour, and it should expire never.",
      example:
        "Redeemable for one genuine, non-defensive apology. No conditions. No 'but'. Expires never.",
    },
    {
      path: "slots[4].label",
      label: "A5 — shelf tag (a compliment)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot A5, another compliment. Lowercase, 2 to 4 words, under 22 characters. This one is about something of hers the world would call a flaw — a laugh, a temper, a way of eating — labelled affectionately.",
      example: "your terrible laugh",
    },
    {
      path: "slots[4].payload",
      label: "A5 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The compliment on the coupon from A5. One or two sentences, under 300 characters. Say the unflattering thing first and flatly, then turn it — the turn has to arrive in the same breath, and it has to be about what it has done for the sender rather than how it looks.",
      example:
        "It is loud, it is ugly, and it has fixed more of my bad days than anything else.",
    },
    {
      path: "slots[5].label",
      label: "A6 — shelf tag (a memory)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot A6, another memory. Lowercase, 2 to 4 words, under 22 characters. File this one by place and year, the way a photograph would be captioned on the back.",
      example: "the airport, 2024",
    },
    {
      path: "slots[5].payload",
      label: "A6 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The memory on the coupon from A6. Two or three short sentences, under 300 characters, built from short declaratives — the sender describing something she did in public that he has never got over.",
      example:
        "You ran. Actually ran. In a crowded terminal. I have never been more embarrassed or more sure.",
    },
    {
      path: "slots[6].label",
      label: "B1 — shelf tag (a voucher)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot B1, another voucher. Lowercase, 2 to 4 words, under 22 characters. This one is for something quiet rather than something owed — an hour, a drive, a silence.",
      example: "one silent car ride",
    },
    {
      path: "slots[6].payload",
      label: "B1 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The voucher terms on the coupon from B1, in the same redemption register. One sentence, under 300 characters. It should offer her the absence of something — no talking, no plans, no questions — rather than an activity.",
      example:
        "Redeemable for one long drive where neither of us has to say anything.",
    },
    {
      path: "slots[7].label",
      label: "B2 — shelf tag (a compliment)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot B2, a compliment about how she treats the sender rather than about her. Lowercase, 2 to 4 words, under 22 characters.",
      example: "how you handle me",
    },
    {
      path: "slots[7].payload",
      label: "B2 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The compliment on the coupon from B2 — the shortest item in the machine and the one that lands hardest. ONE sentence, ideally under 90 characters, saying the thing she has never been thanked for. No joke, no qualifier, no second sentence.",
      example: "You have never once made me feel like a project.",
    },
    {
      path: "slots[8].label",
      label: "B3 — shelf tag (a memory)",
      kind: "text",
      max: SHELF,
      required: true,
      guide:
        "The tag on slot B3, a memory involving her family or her home rather than the two of them alone. Lowercase, 2 to 4 words, under 22 characters.",
      example: "your grandmother's kitchen",
    },
    {
      path: "slots[8].payload",
      label: "B3 — what drops out",
      kind: "longtext",
      max: PAYLOAD,
      required: true,
      guide:
        "The memory on the coupon from B3. Two or three sentences, under 300 characters. Tell the small moment the sender first felt let in somewhere, and end by naming plainly that it mattered — this is the sincere slot on the shelf, so no punchline.",
      example:
        "She handed me chai without asking how I take it, and got it exactly right, and you looked at me like that meant something. It did.",
    },
    {
      path: "letter",
      label: "The letter on the receipt",
      kind: "longtext",
      max: 1200,
      guide:
        "The main love letter. After she has vended the slots and collected the memory cards, the machine prints a receipt — every card itemised at ₹∞, a subtotal of PRICELESS — and under 'SECRET PRIZE UNLOCKED' at the foot of it, this letter. Open with her name on its own line, then two to four short paragraphs, then sign off with the sender's name on the last line after a dash. Nod to the machine once, lightly (it printed what would not fit on a shelf), then drop the joke and be sincere: one concrete shared memory from the story and one thing the sender has never said out loud. It may end with a receipt-style line such as 'No refunds. No returns. No expiry.' Simple warm English, no lists, no emojis, no rhymes. Line breaks between paragraphs.",
      example:
        "Ananya,\n\nEighteen slots weren't enough, so the machine printed the rest.\n\nI still think about the night the gas went out and we ate half-cooked maggi on the floor. You said it was the best meal of your life. I think I knew then.\n\nI've never said this properly: you make ordinary days feel like something I'd want to keep.\n\nNo refunds. No returns. No expiry.\n\n— Rohan",
    },
  ],
};

// Left out on purpose:
//
//   slots[0] (A1) — the RESERVED slot. It is force-marked sold out in the wire
//     coercer, never vends, and its whole job is the one-line joke already in it.
//   slots[9] … slots[17] (B4…C6) — nine more slots. A twenty-field budget stocks
//     eight of them properly, and a half-written slot behind glass reads worse
//     than one the sender fills himself. The editor shows every slot with its
//     seeded contents for him to rewrite or mark sold out.
//   slots[n].kind — colours the tag and picks its icon, and the seeded machine
//     already balances compliments, memories and vouchers across the shelves.
//     Each guide above writes to the kind its slot already has.
//   slots[n].sticks — exactly ONE slot in the machine jams and has to be shaken
//     loose. Which item is worth making her work for is the sender's call, and
//     the coercer silently drops any second sticky slot.
//   slots[n].price / soldOut — machine mechanics, not copy.
//   displayIdleMessages — the amber sign scrolling WELCOME / SELECT ITEM /
//     THANK YOU. It is deliberately machine-generic, it reads correctly out of
//     the box, and every field spent here is a slot left unstocked.
