import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-rose-day-premium — "The Glasshouse Rose", the premium twin of happy-rose-day: a private glasshouse at
 * dusk, a fogged door with their name, thorns (hard times you got through), a garden blooming in a heart on the
 * song's drop, falling word-petals, a pressed-book letter, dew-drop photos and the rose sealed under an engraved
 * glass dome.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-rose-day-premium.ts. The demo seeds 4 thorns.
 * Not declared: roseColor / roseCount (visual choices), sinceDate (a date the sender picks), the optional couplet
 * (live runs wrote it in Hinglish for English stories 3/4 however it was worded — the sender adds one by hand), and
 * every media/music/drop/unlock field. The P.S. has no example: its old one (a kept ticket) leaked into secretLine.
 */
export const roseDayPremium: AiFillTemplateSchema = {
  slug: "happy-rose-day-premium",
  audience: "partner",
  premise:
    "A Rose Day page set in a private glasshouse at dusk. The recipient wipes the fog off the glasshouse door (their name is traced in it), plucks the thorns off one rose — each thorn names a hard time the couple got through together and turns into '…and we got through it' — then breathes the rose into bloom while a whole garden of roses blooms around it in the shape of a heart. They catch falling petals that spell a hidden sentence, read the sender's letter pressed in an old book beside a dried rose, open photo memories held in dew drops, and finally see the rose sealed forever under a glass dome with both names engraved on the base. Tender, golden-hour, deeply personal: chosen, tended and kept." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Rose Day",
      letterWhere: "It is pressed between the pages of an old book next to a dried rose and writes itself in ink, paragraph by paragraph, after the rose has bloomed and its thorns are gone. It may nod to the hard times they got through, but it is not a list of them.",
      letterMax: 3000,
      endLineWhere: "shown under the rose sealed in its glass dome, on the final screen ('This one never wilts…').",
      photosWhere: "each photo is held inside a dew drop on a rose petal and swells to full screen when tapped.",
      notes: true,
      signaturePrinted: "The page already prints the sign-off field below it.",
    }),
    {
      path: "extras.openingLine",
      label: "The line on the potting bench",
      kind: "text",
      max: 70,
      guide: "The first line they read inside the glasshouse, beside a single rose bud in a pot, before anything blooms: the sender explaining, in one breath, why they grew this for them. Built on something from the story, under 65 characters." + VW_TONE,
    },
    {
      path: "extras.colorReason",
      label: "Why this rose colour",
      kind: "text",
      max: 90,
      guide: "One sentence shown under the printed meaning of the rose colour the sender picks, as the rose opens. It must work whatever colour they pick, so do not name a colour: tie 'this rose' to something real about them from the story. Under 85 characters." + VW_TONE,
      example: "Because this one reminds me of the dupatta you wore the day I knew.",
    },
    {
      path: "extras.thorns",
      label: "Thorns you got through",
      kind: "list",
      max: 5,
      itemMax: 60,
      guide: "Up to 4 short labels for hard times the couple actually got through together, taken ONLY from the story (distance, a move, exams, a job scare, a long wait, winning a parent over, a silly big fight). Each is a gentle noun phrase in the past, 3–8 words, no blame and nothing graver than everyday hardship — the page adds '…and we got through it' after each. Return an empty list when the story mentions no difficulty: the scene is skipped then.",
      example: "7 months of long-distance",
    },
    {
      path: "extras.petalSentence",
      label: "The sentence hidden in falling petals",
      kind: "text",
      max: 60,
      guide: "One short sentence of at most 7 words, one word per falling petal they catch, that reads like a secret said to them: tender, specific to these two where possible, ends with a full stop. Same language as the story.",
      example: "You are my favourite thing that grows.",
    },
    {
      path: "extras.engraving",
      label: "The engraving on the dome's base",
      kind: "text",
      max: 40,
      guide: "A short line engraved forever on the walnut base under the glass dome, beneath their two names (so it contains no name): 3–7 words, timeless, like a ring engraving. Same language as the story. Under 38 characters.",
      example: "My one rose, in all the world.",
    },
    {
      path: "extras.secretLine",
      label: "The secret in the tiny dew drop",
      kind: "text",
      max: 80,
      guide: "A small confession hidden in a tiny dew drop they may or may not find: one sentence, first person, a sweet secret detail about the SENDER that the story itself states, told close to the story's own words (something the sender kept, noticed, or planned); never a new object or event. Under 75 characters. When the story states no such detail, leave it empty — the drop then stays hidden.",
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
      label: "Your note from the gardener",
      kind: "text",
      max: 90,
      guide: "One line under the sender's voice note beside the rose in its glass dome (or shown on its own as the sender's handwritten note when there is no recording), the sender as the gardener who grew this rose. First person, addressed to them, one small detail or inside joke from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. tied with a ribbon at the very end of the page, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you miss me tonight / open only if you ever doubt this), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,

    },
  ],
  // Thorns must stay gentle: a field that names betrayal or abuse is dropped (the sender writes it by hand, or not).
  forbiddenOutput: [...VW_FORBIDDEN, "abuse", "abused", "abusive", "cheated", "cheating"],
};
