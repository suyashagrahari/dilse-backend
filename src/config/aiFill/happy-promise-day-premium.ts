import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-promise-day-premium — "The Red Thread", the ULTRA-PREMIUM twin of
 * happy-promise-day (Valentine's week, 11 Feb). Owned by that template's builder.
 *
 * The page: the red thread of fate. The recipient pulls a red thread tied to
 * their little finger through the sender's photos until the other end arrives,
 * tied to the sender's finger; the knot cinches, the thread turns gold and
 * writes "I promise" with the big promise beneath. They thread gold rings (one
 * promise each), read the vow (stitched in, sealed with their thumbprint), seal
 * a promise for later in a vial, and are asked "Do you promise too?".
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are in server/src/config/premiumDays/happy-promise-day-premium.ts.
 * Not declared: futureDate (a date the sender picks), distanceKm (a number only
 * they know), threadColor (visual), and every media / timing / switch premium field.
 */
export const promiseDayPremium: AiFillTemplateSchema = {
  slug: "happy-promise-day-premium",
  audience: "partner",
  premise:
    "A cinematic Promise Day page built on the legend of the red thread of fate: an invisible red thread ties two people's little fingers together; it can stretch or tangle but never breaks. The recipient pulls the thread through the sender's photos until the other end arrives, tied to the sender's finger; the knot tightens, the thread turns gold and writes 'I promise', with the sender's biggest promise beneath. Then they thread gold rings that each hold one small promise, read the sender's vow, seal a promise for later in a glass vial that opens on a future date, and are asked 'Do you promise too?'. Quiet, tender, cinematic, with small concrete promises rather than grand clichés." + VW_LANGUAGE + LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Promise Day",
      letterWhere: "It is the vow: stitched into the page one paragraph at a time with red thread, then sealed with the recipient's thumbprint. Make it a vow — what the sender promises them and why they are sure — warm and specific, not a list.",
      letterMax: 3000,
      signaturePrinted: "The page prints the sender's name as a signature under it.",
      endLineWhere: "on the last screen and the keepsake poster.",
      photosWhere: "each photo hangs from the red thread on a little wooden peg, and the caption is written under it.",
      notes: false,
    }),
    {
      path: "extras.gateLine",
      label: "Opening line",
      kind: "text",
      max: 70,
      guide: "The first line they read, under their name, on a dark screen with one red thread swaying down to their little finger. An invitation to follow this thread to whoever holds the other end, quiet and intriguing, one sentence that mentions the thread, under 65 characters." + VW_TONE,
      example: "Pull gently. Someone's been holding the other end.",
    },
    {
      path: "extras.sharedSince",
      label: "Together since",
      kind: "text",
      max: 24,
      guide: "The moment they got together, written as just that moment — a month and year ('March 2022'), a season, an occasion ('that Diwali', 'college') — because the page prints its own lead-in before it. When the story gives only how long they have been together, or nothing, leave it empty.",
    },
    {
      path: "extras.promises",
      label: "Promises (one per ring)",
      kind: "list",
      max: 5,
      itemMax: 90,
      required: true,
      guide: "Exactly 5 small, concrete, keepable promises from the sender to them, each unfurling from a gold ring as a ribbon. Each one a first-person promise written wholly in the story's language and script, grounded in a real detail or habit from the story (their coffee order, the 2 a.m. calls, how fights end). No two about the same thing; no grand vague clichés. Under 80 characters each." + VW_TONE,
      example: "I'll text you the second my flight lands. Every time.",
    },
    {
      path: "extras.bigPromise",
      label: "The promise under “I promise”",
      kind: "longtext",
      max: 160,
      required: true,
      guide: "The one promise that matters most, shown beneath a gold 'I promise' at the climax, after the thread knots. One or two sentences, plain and sincere, in first person to them; it may use the image of the thread (staying on the other end of it), once. Under 150 characters." + VW_TONE,
      example: "Wherever life pulls us, I'll be on the other end of this thread.",
    },
    {
      path: "extras.futurePromise",
      label: "A promise for later",
      kind: "longtext",
      max: 200,
      guide: "A promise sealed in a glass vial that opens on a future date the sender picks (a year or two away). Written as if read on that day, starting straight with 'By the time you read this,' (or the story language's equivalent): something the two of them will have done together by then, taken from plans or dreams in the story (a trip, a home, a ritual), ending with a small wink like 'I promised. Check.'. First person. Under 180 characters. Leave it empty when the story has no plan or dream to build it on." + VW_TONE,
    },
    {
      path: "extras.replyLine",
      label: "Their WhatsApp reply",
      kind: "text",
      max: 80,
      guide: "The message the RECIPIENT sends back to the sender from the last screen, in the recipient's voice: promising back, short and warm, with a nod to the thread. Under 70 characters, may end with one or two emoji.",
      example: "I promise too. Both ends tied 🤞",
    },
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "A one-line note from the sender shown with their voice message just before the vow (or, without a recording, as a short handwritten line on its own). First person, addressed to them, one small detail from the story. Under 85 characters, no hashtags." + VW_TONE,
      example: "Headphones on. I practised this four times and still laughed.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. tied to the end of the thread on the last screen. Begin with an 'open only if…' condition as its own first line, specific to these two (open only if you're ever unsure / open only if the distance gets loud), then a blank line, then two to four short sentences to them in first person — quieter than the vow, built on one specific detail from the story the vow did not use; when the story has no detail left, make it a small promise or a feeling instead, never an invented memory. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you're ever unsure.\n\nI meant every one of them. Even the one about the last slice.",
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "soulmate", "soulmates"],
};
