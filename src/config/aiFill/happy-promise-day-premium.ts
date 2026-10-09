import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-promise-day-premium — "Signed, Sealed, Promised", the ULTRA-PREMIUM
 * twin of happy-promise-day (Valentine's week, 11 Feb). Owned by that
 * template's builder.
 *
 * The page: a promise drawn up as a deed, on ivory paper under a desk lamp.
 * A wax-sealed envelope opens; the deed unfolds on two "Whereas…" lines (the
 * couple's story in legal-romantic prose); each promise is typed in by a
 * vintage typewriter, one clause at a time, beside one of their photos; the
 * letter is "Schedule A" which the recipient initials; the voice note is the
 * sender's sworn statement; "And above all…" sits over two signature lines
 * (the sender's already in ink, the recipient signs with a finger); then the
 * deed is sealed in its envelope with wax pressed with their initials,
 * stamped SIGNED · SEALED · PROMISED, and "witnessed by" a private line.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are in server/src/config/premiumDays/happy-promise-day-premium.ts.
 * Not declared: sinceDate (a date the model would invent more often than
 * find), monogram (initials the page derives), waxColour (visual), and every
 * media / timing / switch premium field.
 */
export const promiseDayPremium: AiFillTemplateSchema = {
  slug: "happy-promise-day-premium",
  audience: "partner",
  premise:
    "A cinematic Promise Day page styled as a notarised promise: a deed on warm ivory paper, opened from a wax-sealed envelope. It opens on two 'Whereas…' lines that tell the couple's story in playful legal-romantic prose; then each of the sender's promises is typed in by a vintage typewriter, one numbered clause at a time; the sender's letter is attached as a schedule the recipient initials; both people sign; and the deed is sealed with wax and 'witnessed by' a private joke. The legal framing is the wink — every line underneath it is warm, specific and sincere: small concrete promises rather than grand clichés." + VW_LANGUAGE + LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Promise Day",
      letterWhere: "It is attached to the deed as 'Schedule A — in my own words', set on ivory paper, and the recipient initials it at the bottom. Make it the reasons behind the promises: why these promises, why them, and why the sender is sure — warm and specific, in short paragraphs (two to four sentences each, separated by blank lines), not a list.",
      letterMax: 3000,
      greetingPrinted: "The page already prints a 'Dear <their name>,' line above it.",
      signaturePrinted: "The page prints 'Yours, under oath,' and the sender's name under it.",
      endLineWhere: "under the sealed envelope on the last screen and on the keepsake image of the deed.",
      photosWhere: "the first photo is clipped to the deed as 'Exhibit A' and the next ones are clipped beside each typed promise; the caption is written on the print's white border, so a few words read best.",
      notes: false,
    }),
    {
      path: "extras.envelopeLine",
      label: "On the envelope",
      kind: "text",
      max: 60,
      guide: "A short line typed on the sealed envelope, under their name, on the very first screen, the way a private letter carries a note on its back — who may open it, when to read it, or how to hold it. Build it on one detail from the story when there is one (a habit of theirs, a place, a time of night). One sentence in the sender's voice, in the same language and script as the letter, starting with a capital letter, quiet and a little playful, under 55 characters." + VW_TONE,
    },
    {
      path: "extras.whereas",
      label: "Whereas… (two lines)",
      kind: "list",
      max: 2,
      itemMax: 90,
      required: true,
      guide: "Exactly two lines that open the deed, in the style of a contract's recitals, addressed to them as 'you'. Line one starts with 'Whereas' and states one real, specific moment from the story when it began — keep the story's own detail and its date or place when the story gives one; when the story names no such moment, state one true thing about them that the story does say, and invent no event, date or place. Line two starts with 'and whereas' and says what the sender has felt or known ever since, briefly. Each line ends with a comma, under 80 characters, playful-legal on top and sincere underneath, in the same language and script as the letter (only the words 'Whereas' and 'and whereas' stay in English)." + VW_TONE,
      example: "Whereas you stole my umbrella outside the library in June 2021,",
    },
    {
      path: "extras.promises",
      label: "The promises (one per clause)",
      kind: "list",
      max: 5,
      itemMax: 90,
      required: true,
      guide: "Exactly 5 small, concrete, keepable promises from the sender to them, each typed as one clause of the deed. Each one a first-person promise ('I'll…') grounded in a real detail or habit from the story (their order at the cafe, the late-night calls, how fights end). No two about the same thing, no grand vague clichés, no legal words inside the promise itself. Under 80 characters each." + VW_TONE,
      example: "I'll text you the second my flight lands. Every time.",
    },
    {
      path: "extras.bigPromise",
      label: "Above all",
      kind: "longtext",
      max: 140,
      required: true,
      guide: "The one promise that matters most, printed in large italic right above both signatures, after the words 'And above all,' (which the page prints). The page prints 'And above all,' on the line above it, so begin directly with the promise itself. One sentence, plain and sincere, first person to them, in the same language and script as the letter. Under 120 characters." + VW_TONE,
      example: "I'll keep choosing you, on the easy days and the hard ones.",
    },
    {
      path: "extras.witnessLine",
      label: "Witnessed by",
      kind: "text",
      max: 90,
      guide: "Completes the line 'Witnessed by …' on the last screen: a funny, tender witness only these two would understand, taken from something the story actually mentions — a place, a song, a pet, a person, an object, a ritual — written as that thing (a noun phrase, never a sentence about an event). Lowercase start, no 'Witnessed by' at the front (the page prints it), ends with a full stop, under 70 characters, in the same language and script as the letter. When the story mentions nothing to use, pick an ordinary thing every couple has nearby (a phone at 1% battery, a kettle), never a past event." + VW_TONE,
    },
    {
      path: "extras.replyLine",
      label: "Their WhatsApp reply",
      kind: "text",
      max: 80,
      guide: "The message the RECIPIENT sends back to the sender from the last screen, in the recipient's voice, in the same language and script as the letter, after signing: it must promise something back to the sender, short and warm, with a small nod to one detail from the story or to having signed. Under 70 characters, may end with one or two emoji.",
    },
    {
      path: "premium.voiceCaption",
      label: "Line by your voice note",
      kind: "text",
      max: 90,
      guide: "The sender's 'sworn statement', shown with their voice message (or, without a recording, typed out big on its own as the statement itself). First person, addressed to them, one small detail from the story, sincere with a light smile. Under 85 characters, no hashtags." + VW_TONE,
      example: "I practised this four times and still laughed in the middle.",
    },
    {
      path: "premium.psLetter",
      label: "The codicil (P.S.)",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. attached to the deed as a codicil, opened on the last screen. Begin with an 'Open only if…' condition as its own first line (in the same language and script as the letter, capitalised), about something specific to these two (the distance, a long shift, the next fight), then a blank line, then two to four short sentences to them in first person — quieter than the letter, built on one specific detail from the story the letter did not use; when the story has no detail left — or is only a sentence or two — use no memory at all: make it a small promise or a feeling instead. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "soulmate", "soulmates"],
};
