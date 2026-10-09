import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/** Not VW_LANGUAGE: its note about the page's Hindi decorations pulled English stories into Hindi here (live runs). */
const LANGUAGE =
  " Write in the language and script the sender's story is written in — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. When the story names a product brand, write what the thing is instead.";

/**
 * happy-kiss-day-premium — "Photo Booth", the ULTRA-PREMIUM twin of
 * happy-kiss-day. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ../premiumDays/happy-kiss-day-premium.ts.
 *
 * Not declared: kissStyle, lipShade, stripTone, kissFrame (visual / number
 * choices the sender taps) and sinceDate (a date the model would invent more
 * often than find). Music, GIFs and media never.
 *
 * Family-safe by default: the page may be opened on a shared family phone, so
 * every guide keeps kisses at cheek / forehead / blown-kiss level, and a few
 * words that would break that are swept after generation (forbiddenOutput).
 */
export const kissDayPremium: AiFillTemplateSchema = {
  slug: "happy-kiss-day-premium",
  audience: "partner",
  premise:
    "A premium Kiss Day page set in a vintage photo booth behind a red velvet curtain. The recipient presses the booth's button, four flashes fire and a four-frame photo strip of the couple's own photos prints and drops out of the slot; they turn each frame over to read the caption and note written on its back, hear the sender's voice note, read the sender's letter printed on a long booth receipt (with a list of 'kisses owed' under it) and tear it off, then kiss the screen so their kiss lands on the strip next to the sender's. Playful, nostalgic and sweet — cheek, forehead and blown kisses only. This holds in every field, photo notes included: whatever words the story uses for a kiss, the page only ever calls it sweet, shy, tiny or soft — it could be read aloud to grandparents. A story told in English sentences is an English story even when it names Indian places, foods, songs or a borrowed word or two: then every field is natural English, and only a pet name the sender actually uses stays as it is." + LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Kiss Day",
      letterWhere: "It is printed in typewriter type on a long photo-booth receipt that the recipient scrolls and then tears off to keep, so short paragraphs (two to four sentences each, separated by blank lines) read best. Keep every kiss reference sweet: forehead kisses, goodnight kisses, blown kisses, 'sealed with a kiss'. If the story describes a kiss in an intimate or intense way, keep only where and when it happened and make it shy and sweet; never describe how a kiss felt physically.",
      letterMax: 3000,
      endLineWhere: "under the photo strip they keep at the very end, as its caption.",
      photosWhere: "the photos print as the four frames of a vintage photo-booth strip, and this caption is handwritten on the back of its frame.",
      notes: true,
      greetingPrinted: "The receipt already prints a 'Dear <their name>,' line above it.",
      signaturePrinted: "The receipt already prints the sender's name and an x underneath.",
    }),
    {
      path: "extras.openingLine",
      label: "On the booth",
      kind: "text",
      max: 60,
      guide: "The line printed under their name on the booth's red curtain, read just before they step in. Write it as the booth's own pose direction to these two, the way a photographer coaxes a couple into the frame — short imperative beats such as lean in, sit closer, hold still, smile — and bend one beat around a real detail from the story (a habit of theirs, a place, a joke). Two to four very short sentences, under 40 characters in all, at most one emoji, same language as the story.",
    },
    {
      path: "extras.kissNotes",
      label: "Kisses owed (receipt)",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide: "Four line items printed on the booth receipt under the letter, each one a kiss the sender owes them. Each starts with 'A kiss for' and names ONE specific thing about them from the story — a habit, a phrase they say, a small kindness — each a different detail. Use only details the story actually states; when it runs out, make the rest about ordinary things every partner does (good-morning texts, saving the last bite, waiting up) instead of inventing an event. Under 60 characters each, sweet and family-safe." + VW_TONE,
      example: "A kiss for every 'reached home?' text",
    },
    {
      path: "extras.kissBackText",
      label: "Their reply",
      kind: "text",
      max: 80,
      guide: "The prefilled WhatsApp reply the recipient sends back to the sender after kissing the screen and keeping the strip, written in the RECIPIENT's voice to the sender (the app adds the sender's name after it, so do not sign it). Cute and a little teasing, in the story's language, correct and natural. Under 75 characters.",
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
      guide: "The line shown with the sender's voice note, as if the booth also recorded a message (if no voice note is recorded, this line is printed big on its own and IS the message). First person, to them, playful and soft, with one small detail from the story. Under 80 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The P.S.",
      kind: "longtext",
      max: 600,
      guide: "A P.S. printed at the bottom of the booth receipt, after the letter and the kisses owed. Begin with an 'Open only when…' condition as its own first line, specific to these two (open only when you miss me / open only when you can't sleep), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "sexy", "seductive", "naughty"],
};
