import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/** The page prints "Teddy Day · 10 February" right above this line, so it is not a day greeting. */
const END_LINE =
  "The very last line, set large above the signed adoption certificate (the date and day are already printed above it). One short, complete sentence addressed to them (the sign-off and names are printed elsewhere), in the sender's voice, that hands the teddy over for good and says one true thing about the two of them, with a pet name or a callback to one detail from the story. Under 60 characters, same language as the story, no emoji." + VW_TONE;

/**
 * happy-teddy-day-premium — "Adoption Papers", the ULTRA-PREMIUM twin of happy-teddy-day (Valentine's week,
 * 10 Feb). Owned by that template's builder.
 *
 * The page: a manila parcel tag, then a real teddy bear with a woven tag carrying both names; squeezed, he says
 * his first words. His file follows: the couple's photos clipped in as "the family", satin care labels that flip
 * over to love notes written as care instructions, the sender's letter folded in three, the sender's voice. Then
 * a typeset Certificate of Adoption (place of birth, temperament, released by the sender) that the recipient
 * signs with a finger; the gold seal presses and ADOPTED is stamped on it. The signed certificate is the keepsake.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-teddy-day-premium.ts. Not declared: every media / timing / switch premium field.
 * Examples are left off the fields whose example leaked verbatim in live runs (see the template notes).
 */
export const teddyDayPremium: AiFillTemplateSchema = {
  slug: "happy-teddy-day-premium",
  audience: "partner",
  premise:
    "A cinematic Teddy Day page styled as a teddy bear's adoption papers. The recipient first sees a parcel tag, then meets a real teddy bear the sender has named, wearing a woven tag with both their names; squeezed, he says his first words. Then his file: the couple's own photos clipped in as his new family, satin care labels that flip over to reveal love notes written as care instructions, the sender's letter, the sender's voice. Finally a beautifully typeset Certificate of Adoption that the recipient signs with a finger, and a gold seal and an ADOPTED stamp make it official. The teddy is a soft stand-in for the sender: a hug they can keep. Do not assume the couple lives apart unless the story says so. Warm, playful, tender, with the gentle humour of official paperwork. Every line stays true to the story: when the story is short, write simpler lines about what it does say rather than adding trips, habits or events of your own." +
    VW_LANGUAGE +
    LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Teddy Day",
      letterWhere: "It is folded in three and tucked into the teddy's adoption file; it unfolds just before they sign the certificate, so it can introduce the teddy (by his name) as a little piece of the sender they get to keep, using only what the story says about the two of them.",
      letterMax: 3000,
      signaturePrinted: "The page prints the sign-off field under it.",
      endLineWhere: "the very last line, set large above the signed adoption certificate.",
      photosWhere: "each photo is clipped into the teddy's file as 'Exhibit A, B, C…' of his new family, with the caption printed under it. When the story names fewer moments than there are photos, the remaining captions simply describe the two of them as the story does and add no new event, place or object.",
      photoCount: 4,
      notes: false,
    }).map((f) => (f.path === "endLine" ? { ...f, guide: END_LINE } : f)),
    {
      path: "extras.teddyName",
      label: "Teddy's name",
      kind: "text",
      max: 20,
      guide: "A name for the teddy: an inside joke, a food they both love, a nickname from the story turned into a cute toy name. One or two words, under 16 characters, never the recipient's or the sender's own name.",
      example: "Momo",
    },
    {
      path: "extras.parcelNote",
      label: "The parcel tag",
      kind: "text",
      max: 60,
      guide: "The one line handwritten on the parcel tag they see first, before anything opens. The tag already has a red FRAGILE stamp, so do not use the word 'fragile'. A playful shipping-label line from the sender about what's inside (a hug, a stand-in for the sender, something to hold at night), shaped by the story. One sentence, under 55 characters, ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.firstWords",
      label: "His first words",
      kind: "text",
      max: 50,
      guide: "The first thing the teddy says, in a speech bubble, the first time they squeeze him: the teddy speaking in first person, cheerful, greeting the recipient by name and saying who sent him (the sender's first name). Under 45 characters." + VW_TONE,
    },
    {
      path: "extras.birthPlace",
      label: "Place of birth",
      kind: "text",
      max: 40,
      guide: "A field on the adoption certificate, 'Place of birth': a cute, specific place from the story where the teddy was 'born', as if it were official (the sender's hoodie pocket in their city, the café where they met). A short noun phrase, no full stop, under 36 characters. Use only places or things the story mentions; with none, write a hoodie pocket, adding whose it is only when the story gives the sender's first name. Same language as the story.",
    },
    {
      path: "extras.temperament",
      label: "Temperament",
      kind: "text",
      max: 40,
      guide: "A field on the adoption certificate, 'Temperament': two very short deadpan phrases describing the teddy's personality, each starting with a capital letter and ending with a full stop, which secretly describe how the sender loves them, drawn from the story. Same language as the story. Under 36 characters.",
    },
    {
      path: "extras.careLines",
      label: "Care instructions",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide: "Exactly 5 care instructions for the teddy, each printed on its own satin care label: love notes from the sender disguised as laundry-label style instructions in the imperative ('Hug daily.', 'Responds to …', 'Not to be left alone on …'). Each uses a different real detail or habit from the story (long-distance nights, a pet name, a ritual, a fear, a food); when the story is thin, keep them about hugs, sleep and missing each other rather than inventing facts. All five in the same language as the story (Hinglish stories get Hinglish labels). Under 60 characters each, each ends with a full stop." + VW_TONE,
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide: "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Printed in italic under the letter. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Always yours, Aryan",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide: "One line shown with the sender's voice note just before the certificate (or on its own, large, as the sender's spoken words when there is no recording). First person, addressed to them, as if said out loud while they hold the teddy; one small detail from the story. Under 85 characters, same language as the story, no hashtags." + VW_TONE,
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. behind a wax seal at the very end, after the certificate is signed. Begin with a condition as its own first line, 'Open only' followed by a moment or feeling taken from this couple's story, then a blank line, then two to four short sentences to them in first person about the teddy and the sender — quieter than the letter, built on one detail the letter did not use; when no detail is left, make it a small promise instead, never an invented memory. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
