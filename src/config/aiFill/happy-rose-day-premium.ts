import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-rose-day-premium — "The Bloom of Us", the premium twin of happy-rose-day: a velvet bud the recipient holds
 * to warm, which opens on the song's drop into one rose whose every petal is a photo of the couple; then three photos
 * pressed under vellum with their captions, the letter on cream paper, the sender's voice note, and a keepsake card.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-rose-day-premium.ts. The first three photos are the pressed pages, so three captions + notes.
 * Not declared: roseColor (a visual choice), sinceDate (a date the sender picks), the optional couplet (live runs
 * wrote it in Hinglish for English stories; the sender adds one by hand), and every media/music/drop/unlock field.
 * The P.S. has no example: an example there leaks into the other fields.
 */
export const roseDayPremium: AiFillTemplateSchema = {
  slug: "happy-rose-day-premium",
  audience: "partner",
  premise:
    "A cinematic Rose Day page where the couple's own photos are the petals of a single rose. It opens in the dark on a closed velvet bud; the recipient holds it to warm it, and on the chorus of the sender's song it unfurls ring by ring until every petal is one of their photos together. Then three of those photos lie pressed under sheets of vellum that the recipient lifts one by one, each with a short handwritten caption and note; then the sender's letter on cream paper with a pressed petal; then the sender's voice; and finally a keepsake card with both names. Quiet, warm, unhurried and deeply personal: the feeling is 'look closer, it's us'. Every line stays true to the story: when the story is short, write simpler lines about what it does say (who they are to each other, how long, how it feels) rather than adding trips, habits or events of your own." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Rose Day",
      letterWhere: "It unfolds on cream paper with a pressed rose petal, after the rose of their photos has opened, and reveals itself paragraph by paragraph.",
      letterMax: 3000,
      endLineWhere: "the very last line, set large over the keepsake card with both their names.",
      photosWhere: "the photo lies pressed under a sheet of vellum that they lift to see it; the caption is written under it in italic. When the story names fewer than three moments, the remaining captions and notes simply describe the two of them as the story does (married, best friends, years together) and add no new event, place or object.",
      photoCount: 3,
      notes: true,
      signaturePrinted: "The page already prints the sign-off field below it.",
    }),
    {
      path: "extras.openingLine",
      label: "The line over the closed bud",
      kind: "text",
      max: 60,
      guide: "The first line they read, over a closed rose bud in the dark, just before they hold it to make it open: a quiet, slightly mysterious promise in the sender's own voice that something has been waiting for them, shaped by this couple's story (how long they waited, what they kept, how slowly it grew). One short sentence, 4–9 words, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.bloomLine",
      label: "The line over the open rose",
      kind: "text",
      max: 60,
      guide: "One short sentence that appears over the open rose at the moment they realise every petal is a photo of the two of them: it says, tenderly and in the sender's voice, what this rose is made of, using something only this couple has (their years together, their city, the way they met). 4–9 words, ending with a full stop." + VW_TONE,
    },
    {
      path: "extras.colorReason",
      label: "Why this rose colour",
      kind: "text",
      max: 90,
      guide: "One sentence shown under the printed meaning of the rose colour the sender picks, once the rose has opened. It must work whatever colour they pick, so do not name a colour: tie 'this rose' to something real about them from the story. Under 85 characters." + VW_TONE,
      example: "Because this one reminds me of the dupatta you wore the day I knew.",
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Printed in italic under the letter. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Forever yours, Rohan",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide: "One line shown with the sender's voice note near the end of the page (or on its own, large, as the sender's spoken words when there is no recording). First person, addressed to them, one small detail or inside joke from the story, as if said out loud. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. behind a wax seal at the very end of the page, labelled 'open only if…'. Begin with that condition as its own first line, 'Open only if' followed by a moment or feeling taken from this couple's story, then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN],
};
