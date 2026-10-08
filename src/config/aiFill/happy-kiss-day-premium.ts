import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-kiss-day-premium — "A Thousand Kisses", the ULTRA-PREMIUM twin of happy-kiss-day. Owned by
 * that template's builder: started as a copy of ./happy-kiss-day.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-kiss-day.ts):
 * happy-kiss-day — "Sealed With a Kiss" (Valentine's week, 13 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 * Not declared: kissStyle, lipShade, kissTarget (visual/number choices).
 *
 * Family-safe by default: the page may be opened on a shared family phone, so
 * every guide keeps kisses at cheek / forehead / blown-kiss level.
 */
export const kissDayPremium: AiFillTemplateSchema = {
  slug: "happy-kiss-day-premium",
  audience: "partner",
  premise:
    "A Kiss Day page, cute and family-safe: the recipient taps to stamp cartoon kisses into a heart jar until it overflows with a giant MWAH, then opens a lipstick-sealed envelope with the sender's letter, sees their photos on a Kiss-Cam, scratches kiss coupons and blows a kiss back. Blush, playful, sweet — cheek, forehead and blown kisses only. This holds in every field, photo notes included: whatever words the story uses for a kiss, the page only ever calls it sweet, shy, tiny or cute — it could be read aloud to grandparents." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Kiss Day",
      letterWhere: "It is inside an envelope sealed with a lipstick kiss, dragged up to read. Keep every kiss reference sweet: forehead kisses, goodnight kisses, blown kisses, 'sealed with a kiss'. If the story describes a kiss in an intimate or intense way, keep only where and when it happened and make it shy and sweet; never describe how a kiss felt physically.",
      letterMax: 3000,
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
      example: "Received your kisses 💋 Here's one back, pagal 😘",
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
