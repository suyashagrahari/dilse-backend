import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-kiss-day — "Sealed With a Kiss" (Valentine's week, 13 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: kissStyle, lipShade, kissTarget (visual/number choices).
 *
 * Family-safe by default: the page may be opened on a shared family phone, so
 * every guide keeps kisses at cheek / forehead / blown-kiss level.
 */
export const kissDay: AiFillTemplateSchema = {
  slug: "happy-kiss-day",
  audience: "partner",
  premise:
    "A Kiss Day page, cute and family-safe: the recipient taps to stamp cartoon kisses into a heart jar until it overflows with a giant MWAH, then opens a lipstick-sealed envelope with the sender's letter, sees their photos on a Kiss-Cam, scratches kiss coupons and blows a kiss back. Blush, playful, sweet — cheek, forehead and blown kisses only. This holds in every field, photo notes included: whatever words the story uses for a kiss, the page only ever calls it sweet, shy, tiny or cute — it could be read aloud to grandparents. A story told in English sentences is an English story even when it names Indian places, foods, songs or a borrowed word or two: then every field is natural English, and only a pet name the sender actually uses stays as it is." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Kiss Day",
      letterWhere: "It is inside an envelope sealed with a lipstick kiss, dragged up to read. Keep every kiss reference sweet: forehead kisses, goodnight kisses, blown kisses, 'sealed with a kiss'. If the story describes a kiss in an intimate or intense way, keep only where and when it happened and make it shy and sweet; never describe how a kiss felt physically.",
      letterMax: 1500,
      endLineWhere: "on the final 'blow a kiss back' screen.",
      photosWhere: "the photos play on a stadium Kiss-Cam jumbotron.",
      notes: true,
    }),
    {
      path: "extras.openingLine",
      label: "Envelope teaser",
      kind: "text",
      max: 60,
      guide: "The shy teaser on the closed envelope, written like a phone notification or a delivery alert, with a nod to something from the story. Under 55 characters, one emoji allowed, same language as the story.",
    },
    {
      path: "extras.kissNotes",
      label: "Notes that pop with the kisses",
      kind: "list",
      max: 5,
      itemMax: 60,
      guide: "3 to 5 tiny notes that pop up as the kiss jar fills, each 'for' one specific thing about them from the story, e.g. 'Kiss #7 — for every reached-home text'. Each under 58 characters, sweet and family-safe, each about a different detail." + VW_TONE,
      example: "Kiss #1 — for the way you laugh at my bad jokes",
    },
    {
      path: "extras.coupons",
      label: "Kiss coupons",
      kind: "list",
      max: 4,
      itemMax: 50,
      guide: "Up to 4 scratch-off kiss coupons, each 'what you get — when it's valid'. Each a different sweet gesture (a forehead kiss, a goodnight kiss on a call, a kiss to end any argument) with different, specific terms tied to the story — no two with the same validity. Each under 44 characters (anything past 50 is cut off), family-safe.",
      example: "1 forehead kiss — valid after every exam",
    },
    {
      path: "extras.kissBackText",
      label: "Their reply",
      kind: "text",
      max: 80,
      guide: "The prefilled WhatsApp reply the recipient sends back to the sender after blowing a kiss back, written in the RECIPIENT's voice to the sender (the app adds the sender's name after it, so do not sign it). Cute and a little teasing, in the story's language, correct and natural. Under 75 characters.",
      example: "Received your kisses 💋 Here's one back, silly 😘",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
