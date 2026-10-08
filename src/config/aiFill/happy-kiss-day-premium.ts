import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/** Not VW_LANGUAGE: its note about the page's Hindi decorations pulled English stories into Hindi here (live runs). */
const LANGUAGE =
  " Write in the language and script the sender's story is written in — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. When the story names a product brand, write what the thing is instead.";

/**
 * happy-kiss-day-premium — "A Thousand Kisses", the ULTRA-PREMIUM twin of
 * happy-kiss-day. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ../premiumDays/happy-kiss-day-premium.ts.
 *
 * Not declared: kissStyle, lipShade, kissTarget, mosaicPhoto, kissCount
 * (visual / number choices the sender taps) and sinceDate (a date the model
 * would invent more often than find). Music, GIFs and media never.
 *
 * Family-safe by default: the page may be opened on a shared family phone, so
 * every guide keeps kisses at cheek / forehead / blown-kiss level, and a few
 * words that would break that are swept after generation (forbiddenOutput).
 */
export const kissDayPremium: AiFillTemplateSchema = {
  slug: "happy-kiss-day-premium",
  audience: "partner",
  premise:
    "A premium Kiss Day page shot like a perfume advert, where kisses are the medium: the recipient opens a perfumed envelope, warms a lip-pressed wax seal until it melts open, catches falling kisses in a little glass heart jar while 'A kiss for…' notes pop out, swipes two thousand tiny kisses into one of their photos (the picture resolves out of kisses), reads the sender's letter written in lipstick on a steamy vanity mirror, gets a photo-booth strip printed and stamps it with their own kiss, and finally kisses the screen back. Flirty-elegant and sweet — cheek, forehead and blown kisses only. This holds in every field, photo notes included: whatever words the story uses for a kiss, the page only ever calls it sweet, shy, tiny or soft — it could be read aloud to grandparents. A story told in English sentences is an English story even when it names Indian places, foods, songs or a borrowed word or two: then every field is natural English, and only a pet name the sender actually uses stays as it is." + LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Kiss Day",
      letterWhere: "It writes itself in lipstick across a steamy vanity mirror, paragraph by paragraph, each paragraph ending in a tiny kiss mark, so short paragraphs read best. Keep every kiss reference sweet: forehead kisses, goodnight kisses, blown kisses, 'sealed with a kiss'. If the story describes a kiss in an intimate or intense way, keep only where and when it happened and make it shy and sweet; never describe how a kiss felt physically.",
      letterMax: 3000,
      endLineWhere: "under the photo-booth strip they keep at the very end.",
      photosWhere: "the photos become a mosaic made of tiny kisses and a vintage kiss-booth photo strip.",
      notes: true,
      greetingPrinted: "The mirror already shows a 'Dear <their name>,' line above it.",
      signaturePrinted: "The mirror already signs it with the sender's name and an x underneath.",
    }),
    {
      path: "extras.openingLine",
      label: "Written on the envelope",
      kind: "text",
      max: 60,
      guide: "The line handwritten on the perfumed envelope, the very first thing they read: flirty-elegant and short, like the tagline of a perfume advert — a few words that tease what is inside, with a nod to one detail of the story. Under 40 characters, at most one emoji, same language as the story.",
    },
    {
      path: "extras.kissNotes",
      label: "A kiss for…",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide: "Four little notes that pop out of the jar as they catch falling kisses. Each starts with 'A kiss for' and names ONE specific thing about them from the story — a habit, a phrase they say, a small kindness — each a different detail. Under 60 characters each, sweet and family-safe." + VW_TONE,
      example: "A kiss for every 'reached home?' text",
    },
    {
      path: "extras.kissBackText",
      label: "Their reply",
      kind: "text",
      max: 80,
      guide: "The prefilled WhatsApp reply the recipient sends back to the sender after kissing the screen, written in the RECIPIENT's voice to the sender (the app adds the sender's name after it, so do not sign it). Cute and a little teasing, in the story's language, correct and natural. Under 75 characters.",
      example: "Kisses received. Sending one back before you even ask 😘",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Line by your voice note",
      kind: "text",
      max: 90,
      guide: "The handwritten line beside the sender's voice note, left on the vanity under the mirror (if no voice note is recorded, this line IS the message). First person, to them, playful and soft, with one small detail from the story. Under 80 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A P.S. card tucked into the mirror's frame. Begin with an 'Open only when…' condition as its own first line, specific to these two (open only when you miss me / open only when you can't sleep), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "sexy", "seductive", "naughty"],
};
