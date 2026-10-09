import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-promise-day-premium — "The Pinky Promise Club", the premium twin of happy-promise-day (Valentine's week,
 * 11 Feb): little promises, sealed forever, in a cute bright club with exactly two members. She hooks the sender's
 * pinky (his welcome types out), pulls folded paper-star promises out of a jar (the golden one, the big promise,
 * last), signs the club's three "Terms & Cuddle-tions" with her finger, strings letter beads into a bracelet,
 * unlocks the sender's diary to read the letter, plays the voice note on a cassette, flips a sticky-note promise on
 * each photo, then picks one to three promises to give back from chips. On the chorus the love lock (engraved)
 * snaps shut and every promise floats up as a paper lantern; the keepsake is her membership card.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-promise-day-premium.ts. Not declared: sinceDate (a date the model would invent more often
 * than find) and every media / timing / switch premium field.
 */
export const promiseDayPremium: AiFillTemplateSchema = {
  slug: "happy-promise-day-premium",
  audience: "partner",
  premise:
    "A cute, bright Promise Day page styled as 'The Pinky Promise Club', a club with exactly two members. The recipient hooks the sender's pinky to join, pulls folded paper-star promises out of a jar one by one (silly first, deep last, the golden star is the big promise), signs three playful club rules with a finger, strings letter beads into a friendship bracelet, unlocks the sender's diary to read the letter, hears the voice note on a cassette, flips a sticky-note promise on each photo, then picks promises of her own to give back before a love lock snaps shut and every promise floats up as a paper lantern. The club is the wink; every promise underneath is small, concrete, keepable and from this couple's real story. The voice is a real person's texts: short, warm, a little funny, never grand." +
    VW_LANGUAGE +
    LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Promise Day",
      letterWhere:
        "It is locked inside the sender's little diary; the recipient unlocks it with a tiny key and it writes itself out on a lined page. Make it the reasons behind the promises: why these promises, why them, why the sender is sure. Short paragraphs that read well on a phone.",
      letterMax: 3000,
      signaturePrinted: "The page prints its own short sign-off and the sender's name under the letter, so the letter ends on its last sentence.",
      endLineWhere: "printed at the bottom of the recipient's Pinky Promise Club membership card, the keepsake she saves.",
      photosWhere: "each photo is a taped polaroid in a little memory lane with a sticky-note promise stuck on it; the caption is the handwritten line under the photo.",
      notes: false,
    }),
    {
      path: "extras.envelopeLine",
      label: "Your invite line",
      kind: "text",
      max: 60,
      guide:
        "The club's invitation on the very first screen, under their name and above the button 'Pinky promise?'. One short, playful line about the club being tiny and exclusive (two members), with a nod to one detail from the story when it fits. Under 50 characters, starts with a capital, no emoji." +
        VW_TONE,
    },
    {
      path: "extras.pinkyPrompt",
      label: "How you ask for the pinky",
      kind: "text",
      max: 50,
      guide:
        "The heading over two cartoon hands, asking them to hook pinkies before anything else, playful-bossy and sweet (a rule of the club). Under 40 characters, no emoji." + VW_TONE,
    },
    {
      path: "extras.welcomeLine",
      label: "Your welcome, once the pinkies hook",
      kind: "text",
      max: 80,
      guide:
        "What the sender says the moment their pinkies hook: welcoming them into the two-person club, warm and a little funny, may use their pet name from the story. Under 70 characters, may end with one emoji." +
        VW_TONE,
    },
    {
      path: "extras.promises",
      label: "The promise jar",
      kind: "list",
      max: 5,
      itemMax: 90,
      required: true,
      guide:
        "Exactly 5 small, concrete, keepable promises from the sender to them, each written on a folded paper star they pull from a jar, ordered from silly to deep. Each starts with 'I promise' (or the same words in the story's own language) and is grounded in a real detail or habit from the story. No two about the same thing, no grand clichés. A short story still gets all 5: everyday promises about calls, food, fights, cheering them on and being there, with no invented places or events. Under 75 characters each." +
        VW_TONE,
    },
    {
      path: "extras.bigPromise",
      label: "The big one (the golden star)",
      kind: "longtext",
      max: 140,
      required: true,
      guide:
        "The one promise that matters most, the glowing golden star pulled out last; it also floats highest when the love lock closes. One plain, sincere sentence, first person to them, different from the 5 promises. Under 110 characters." +
        VW_TONE,
    },
    {
      path: "extras.clubRules",
      label: "The club rules",
      kind: "list",
      max: 3,
      itemMax: 60,
      guide:
        "Exactly 3 silly-sweet club rules titled 'Terms & Cuddle-tions' that they sign with a finger, written as short house rules for both members (not promises from the sender), at least one tied to a habit from the story when it has one. Under 50 characters each, start with a capital, end with a full stop, no emoji, no numbering." +
        VW_TONE,
    },
    {
      path: "extras.beadWord",
      label: "The word on the bracelet",
      kind: "text",
      max: 6,
      guide:
        "The word they spell with letter beads on a friendship bracelet: their name or pet name from the story when it is 2 to 6 letters (A to Z only), otherwise 'US'. Capital letters only, no spaces, no emoji.",
      example: "US",
    },
    {
      path: "extras.stickyPromises",
      label: "A promise for each photo",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide:
        "Exactly 4 short promises, one on a sticky note stuck to each photo in order, each tied to that photo's own moment (the same memory as that photo's caption) and starting with 'I promise' (or the same words in the story's own language). When a photo has no memory in the story, make it a feeling-only promise about ordinary days together, with no new place, food or event: a short story still gets all 4. Under 60 characters each, no emoji." +
        VW_TONE,
    },
    {
      path: "extras.askBack",
      label: "Promises they can give back",
      kind: "list",
      max: 5,
      itemMax: 50,
      guide:
        "Exactly 5 short promises written in the RECIPIENT's voice to the sender, shown as chips they can pick to promise back. Each starts with 'I promise' (or the same words in the story's own language), is light and sweet, and at least two are tied to a habit or joke the story actually mentions, as their side of it; when the story has none, keep them about ordinary things any couple shares (texts, calls, laughing, being there) without naming a food or place: a short story still gets all 5. The last one is simple and sincere. Under 45 characters each, no emoji, no full stop needed." +
        VW_TONE,
    },
    {
      path: "extras.lockEngraving",
      label: "Engraved on the love lock",
      kind: "text",
      max: 20,
      guide:
        "A tiny engraving on the heart love lock: both first initials joined with ' + ', then ' · ' and one short word or a date the story gives (e.g. 'A + M · forever'). Under 18 characters, Latin capitals for the initials.",
      example: "A + M · forever",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide:
        "One short line from the sender shown on the cassette with the voice message (or alone when there is no recording): first person, a little shy and funny about recording a promise out loud, one small detail from the story. Under 85 characters, no hashtags." +
        VW_TONE,
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A sealed P.S. opened at the very end, under the membership card. Begin with an 'Open only if…' condition as its own first line (capitalised, specific to these two: the distance, a long shift, the next fight, a doubt), then a blank line, then two to four short sentences to them in first person, quieter than the letter, built on one specific detail from the story the letter did not use; when the story has no detail left or is only a sentence or two, use no memory at all: make it a small promise or a feeling instead. No salutation, no sign-off, no sender's name. Under 550 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "soulmate", "soulmates"],
};
