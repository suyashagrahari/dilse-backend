import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-rose-day — "Ek Gulaab, Sirf Tumhare Liye" (Valentine's week, 7 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: roseColor, roseCount, petalStyle (visual choices the sender taps).
 */
export const roseDay: AiFillTemplateSchema = {
  slug: "happy-rose-day",
  audience: "partner",
  premise:
    "A Rose Day page for their partner. The recipient presses and holds to grow a single rose until it blooms, plucks its petals in a 'loves me, loves me not' game that always ends on 'loves me', then opens a wax-sealed envelope with the sender's letter and a bouquet of photo memories. Tender, botanical, morning-garden mood." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Rose Day",
      letterWhere: "It is written in ink inside a wax-sealed envelope with a pressed rose, revealed line by line after the rose has bloomed.",
      letterMax: 1500,
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
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
