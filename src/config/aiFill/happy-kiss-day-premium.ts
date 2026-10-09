import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/** Not VW_LANGUAGE: its note about the page's Hindi decorations pulled English stories into Hindi here (live runs). */
const LANGUAGE =
  " Write in the language and script the sender's story is written in — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. When the story names a product brand, write what the thing is instead.";

const MENU =
  " One of four cards on the page's kiss menu (forehead, cheek, nose, hand); the card already prints the kind of kiss, so this line is only the sender's reason for giving them this kiss, written by the sender to them like a short, natural text message. Tie it to ONE specific detail from the story when one fits this kind of kiss, and use a different detail on each of the four cards; with no detail to use, name a small everyday moment of theirs instead of inventing an event. One or two short sentences, under 80 characters, ending with a full stop rather than an exclamation mark, no emoji, sweet and family-safe, same language as the story (a Hinglish story gets everyday Hinglish that reads like a real chat)." +
  VW_TONE;

/**
 * happy-kiss-day-premium — "Mwah Booth", the ULTRA-PREMIUM twin of
 * happy-kiss-day. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ../premiumDays/happy-kiss-day-premium.ts.
 *
 * Not declared: kissStyle, lipShade, kissFrame (visual / number choices the
 * sender taps) and sinceDate (a date the model would invent more often than
 * find). Music, GIFs and media never.
 *
 * Family-safe by default: the page may be opened on a shared family phone, so
 * every guide keeps kisses at cheek / forehead / blown-kiss level, and a few
 * words that would break that are swept after generation (forbiddenOutput).
 */
export const kissDayPremium: AiFillTemplateSchema = {
  slug: "happy-kiss-day-premium",
  audience: "partner",
  premise:
    "A premium Kiss Day page shaped like a bright, cute kissing booth full of hearts and bear stickers. The recipient twists up a lipstick to open it, kisses the sender's photo three times, flips four cards on a kiss menu (forehead, cheek, nose, hand) to read why the sender gives each one, watches the couple's photos print in a photo-booth strip and decorates it with lipstick stickers, catches flying kisses in a little game that unlocks a list of 'kisses I owe you', opens a letter sealed with a lipstick kiss, hears the sender's whispered voice note, and answers one last question ('Later' runs away from their finger, 'Yes' fills the screen with kisses). Playful, flirty-cute and sweet — cheek, forehead, nose and blown kisses only. This holds in every field, photo notes included: whatever words the story uses for a kiss, the page only ever calls it sweet, shy, tiny or soft — it could be read aloud to grandparents. A story told in English sentences is an English story even when it names Indian places, foods, songs or a borrowed word or two: then every field is natural English, and only a pet name the sender actually uses stays as it is." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Kiss Day",
      letterWhere:
        "It is inside an envelope sealed with a lipstick kiss and types itself out once they tap the seal, so short paragraphs (two to four sentences each, separated by blank lines) read best. Keep every kiss reference sweet: forehead kisses, goodnight kisses, blown kisses, 'sealed with a kiss'. If the story describes a kiss in an intimate or intense way, keep only where and when it happened and make it shy and sweet; never describe how a kiss felt physically.",
      letterMax: 3000,
      endLineWhere: "on the decorated photo strip they keep at the very end, as its caption.",
      photosWhere: "the photos print as the frames of a cute photo-booth strip, and this caption is handwritten under its frame.",
      notes: true,
      greetingPrinted: "The letter already prints a 'Dear <their name>,' line above it.",
      signaturePrinted: "The letter already prints the sender's name and a kiss mark underneath.",
    }),
    {
      path: "extras.openingLine",
      label: "On the lipstick screen",
      kind: "text",
      max: 60,
      guide: "The playful line under their name on the very first screen, where they twist up a lipstick to open the page. A short, flirty-cute nudge to open it, built around one real detail from the story (a habit, a nickname, a place, a joke of theirs) so it could only be for this person. One or two short sentences, under 45 characters in all, at most one emoji, same language as the story.",
    },
    {
      path: "extras.foreheadLine",
      label: "Kiss menu: forehead",
      kind: "text",
      max: 90,
      guide: "The forehead kiss card: the protective, proud, comforting kiss." + MENU,
    },
    {
      path: "extras.cheekLine",
      label: "Kiss menu: cheek",
      kind: "text",
      max: 90,
      guide: "The cheek kiss card: the quick, shy, sneaky kiss." + MENU,
    },
    {
      path: "extras.noseLine",
      label: "Kiss menu: nose",
      kind: "text",
      max: 90,
      guide: "The nose kiss card: the silly eskimo kiss that ends a sulk or a fight." + MENU,
    },
    {
      path: "extras.handLine",
      label: "Kiss menu: hand",
      kind: "text",
      max: 90,
      guide: "The hand kiss card: the royal, old-fashioned kiss the sender gives because the RECIPIENT deserves to be treated like royalty (a king if the recipient is a man, a queen if a woman, or simply royalty)." + MENU,
    },
    {
      path: "extras.kissNotes",
      label: "Kisses I owe you",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide: "Four short lines unlocked after the flying-kiss game, each one a kiss the sender owes them. Each starts with 'A kiss for' (in a Hinglish story, 'Ek kiss' followed by natural Hinglish) and names ONE specific thing about them from the story — a habit, a phrase they say, a small kindness — each a different detail, and none of the details already used on the kiss menu. Use only details the story actually states; when it runs out, make the rest about ordinary things every partner does (good-morning texts, saving the last bite, waiting up) instead of inventing an event. Under 60 characters each, sweet and family-safe." + VW_TONE,
      example: "A kiss for every 'reached home?' text",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide: "The last question before the finale; the answers are 'Yes' and a 'Later' button that runs away. Ask them, cutely and in the sender's own voice, for one real kiss — on the cheek or forehead, or the next time you meet — with a small twist from the story when one fits (where you'll meet, a habit of theirs). Do not start with their name. Under 45 characters, ends with a question mark, no emoji.",
    },
    {
      path: "extras.kissBackText",
      label: "Their reply",
      kind: "text",
      max: 80,
      guide: "The prefilled WhatsApp reply the recipient sends back to the sender at the end, written in the RECIPIENT's voice to the sender (the app adds the sender's name after it, so do not sign it): they got the kisses and are sending one back, with a cute, teasing touch from the story (a nickname or habit). In the story's language, correct and natural. Under 75 characters, at most one emoji.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Your whisper",
      kind: "text",
      max: 90,
      guide: "A whisper shown with the sender's voice note after 'Come closer…' (if no voice note is recorded, this line is typed out big on its own and IS the whisper). First person, to them, playful and soft, with one small detail from the story. Under 80 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The P.S.",
      kind: "longtext",
      max: 600,
      guide: "A folded P.S. note tucked under the letter. Begin with an 'Open only when…' condition as its own first line, specific to these two (open only when you miss me / open only when you can't sleep), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "sexy", "seductive", "naughty"],
};
