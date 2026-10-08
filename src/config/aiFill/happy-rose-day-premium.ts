import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-rose-day-premium — "The Glasshouse Rose", the ULTRA-PREMIUM twin of happy-rose-day. Owned by
 * that template's builder: started as a copy of ./happy-rose-day.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-rose-day.ts):
 * happy-rose-day — "Ek Gulaab, Sirf Tumhare Liye" (Valentine's week, 7 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: roseColor, roseCount, petalStyle (visual choices the sender taps).
 */
export const roseDayPremium: AiFillTemplateSchema = {
  slug: "happy-rose-day-premium",
  audience: "partner",
  premise:
    "A Rose Day page for their partner. The recipient presses and holds to grow a single rose until it blooms, plucks its petals in a 'loves me, loves me not' game that always ends on 'loves me', then opens a wax-sealed envelope with the sender's letter and a bouquet of photo memories. Tender, botanical, morning-garden mood." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Rose Day",
      letterWhere: "It is written in ink inside a wax-sealed envelope with a pressed rose, revealed line by line after the rose has bloomed.",
      letterMax: 3000,
      endLineWhere: "shown under the full-bloom rose on the final screen.",
      photosWhere: "each photo is a rosebud in a bouquet that blooms into a polaroid.",
      notes: true,
      greetingPrinted: "The page already prints 'My dear <their name>,' above it.",
      signaturePrinted: "The page already prints the sign-off field below it.",
    }),
    {
      path: "extras.openingLine",
      label: "Opening line",
      kind: "text",
      max: 70,
      guide: "The first line on the arrival screen, next to an empty flower pot, before the rose grows. Playful and specific to the two of them, under 65 characters." + VW_TONE,
    },
    {
      path: "extras.colorReason",
      label: "Why this rose colour",
      kind: "text",
      max: 90,
      guide: "One sentence shown under the printed meaning of the rose colour the sender picks. It must work whatever colour they pick, so do not name a colour: tie 'this rose' to something real about them from the story, a little playfully. Under 85 characters." + VW_TONE,
      example: "Because every shade of red reminds me of your laugh.",
    },
    {
      path: "extras.shayari",
      label: "A little shayari",
      kind: "longtext",
      max: 160,
      guide: "An optional two-line couplet about a rose and this person, separated by a line break, shown as a pull-quote. Write an original one that rhymes and actually scans, in Roman-script Hindi/Urdu for a Hinglish story or simple English for an English story, ideally with one detail from the story in it. It is unsigned: no poet, no author, no dash-credit, nobody's name after it. Under 150 characters. If you cannot make it rhyme, return null.",
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 30,
      guide: "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Printed in script under the letter. Same language as the story; match the sender's gender in Hindi. Under 28 characters.",
      example: "Forever yours, Rohan",
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
