import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-promise-day-premium — "The Red Thread", the ULTRA-PREMIUM twin of happy-promise-day. Owned by
 * that template's builder: started as a copy of ./happy-promise-day.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-promise-day.ts):
 * happy-promise-day — "Vaada Pakka" (Valentine's week, 11 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: lockStyle, lockFinale (visual choices).
 */
export const promiseDayPremium: AiFillTemplateSchema = {
  slug: "happy-promise-day-premium",
  audience: "partner",
  premise:
    "A Promise Day page on paper-and-ink: the recipient hooks a pinky with the sender's, pulls promise chits from a jar, then signs the sender's letter as a playful '₹∞ Pyaar Stamp Paper' contract (a Vachan Patra) with a thumbprint 'notarised by Cupid', and finally locks a love-lock on a bridge. Sincere at heart, funny around the edges." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Promise Day",
      letterWhere: "It is the body of a mock-official stamp-paper contract (Vachan Patra) the recipient signs with a fingertip — warm first-person promises written like a letter, with at most one playful legal phrase.",
      letterMax: 3000,
      endLineWhere: "under the love-lock on the bridge at the very end.",
      photosWhere: "the photos hang as polaroids on a string of fairy lights.",
      notes: true,
      signaturePrinted: "The contract prints signature lines for both of them right under it.",
    }),
    {
      path: "extras.envelopeLine",
      label: "Envelope line",
      kind: "text",
      max: 60,
      guide: "The line on the envelope that arrives first, addressed to them — short, sweet, a little mysterious, with a nod to the story if it fits. Under 55 characters." + VW_TONE,
    },
    {
      path: "extras.pinkyPrompt",
      label: "Pinky-swear prompt",
      kind: "text",
      max: 50,
      guide: "The instruction asking them to hook their pinky with the sender's before anything opens. Playful and bossy-cute, under 45 characters, in the story's language, one emoji allowed.",
    },
    {
      path: "extras.promises",
      label: "Promises in the jar",
      kind: "list",
      max: 7,
      itemMax: 90,
      required: true,
      guide: "5 to 7 promise chits, printed as numbered clauses of the contract. Each is something the SENDER promises to do, starting with 'I promise' (for a Hinglish story write it the way they would say it, e.g. 'Promise karti hoon…' with the right gender). Small, concrete and keepable, built on a habit or joke from the story — mostly funny everyday ones (sharing the last bite, waking up on time), one or two serious ones. Every promise is about the sender's own behaviour; a flaw of theirs from the story may only appear as a tease where the sender happily gives in to it. No habit the story does not mention. Each under 85 characters." + VW_TONE,
      example: "I promise Maggi at 2 a.m., no questions asked.",
    },
    {
      path: "extras.bigPromise",
      label: "The big promise",
      kind: "longtext",
      max: 140,
      guide: "The last, highlighted chit: the one promise that matters most, sincere and simple, one sentence under 130 characters.",
      example: "I promise that on your worst day, I'll still choose you, every single time.",
    },
    {
      path: "extras.lockEngraving",
      label: "Lock engraving",
      kind: "text",
      max: 20,
      guide: "What is engraved on the love-lock: their initials and a date or a two-word phrase from the story. Under 18 characters.",
      example: "A + M · forever",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "The one handwritten line printed under the sender's voice note, read just before they press play (or, if no voice note is recorded, shown as a short typed 'transmission' from the sender). First person, addressed to them, one small detail or inside joke from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. envelope at the very end of the page, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you miss me tonight / open only if you ever doubt this), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
