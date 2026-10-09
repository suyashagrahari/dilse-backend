import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-hug-day-premium — "The Hug Passport" (v3), the premium twin of happy-hug-day: the recipient collects every
 * kind of hug in their own Hug Passport. A bear with open arms opens it; five short gesture hugs (bear, back, twirl,
 * pat-pat, long-distance) each stamp the passport with a photo as the souvenir and the sender's line for that hug;
 * then the letter by hug mail, the voice note, hug coupons to redeem, and one last yes/no question whose yes stamps
 * the passport "forever" on the song's chorus. It ends on the finished passport with their title on it.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-hug-day-premium.ts. The demo seeds 6 photos, 4 hug lines and 4 coupons, so those indices exist.
 *
 * Not declared: distanceKm (a number the sender sets; a story rarely states it and the model would invent it),
 * characters (a look the sender picks), photo notes (this page never shows them), music, drop, unlock, GIFs, media.
 * The P.S. has no example: an example there leaks into the other fields.
 */
const HUGS = ["the bear hug (a big tight squeeze)", "the back hug (sneaking up from behind)", "the twirl hug (lifting them and spinning round)", "the pat-pat hug (a comforting pat on the head)"];
const HUG_FOR = [
  "a hard or heavy day",
  "a quiet everyday moment at home the story gives (cooking, working, getting ready), or simply catching them off guard",
  "good news or a happy moment worth celebrating",
  "a sad or tired day, when they need comforting",
];

export const hugDayPremium: AiFillTemplateSchema = {
  slug: "happy-hug-day-premium",
  audience: "partner",
  premise:
    "A bright, cute, playful Hug Day page: the recipient's own Hug Passport, where they collect every kind of hug. A bear with open arms says a short 'come here' line on the cover. Then five quick hugs, each done with a gesture: a bear hug, a back hug, a twirl hug, a pat-pat hug and a long-distance hug (two phones dragged together). Each hug thunks a stamp into the passport, with one of their photos as the souvenir and the sender's one-line reason for that kind of hug. Then the sender's letter arrives by 'hug mail', the sender's voice plays, hug coupons can be redeemed, and one last yes/no question stamps the passport 'forever' on the song's chorus. The feeling is warm, cosy and a little silly, like a boyfriend's real texts: short, specific, funny, never formal or poetic. Every line stays true to the story: when the story is short, write simpler lines about what it does say (who they are to each other, how long, how far apart, how it feels) rather than adding trips, habits or events of your own." +
    VW_LANGUAGE +
    " Indian place names, foods and song titles inside an English story keep it an English story: write the whole page in English then, quoting those names as they are.",
  fields: [
    ...valentineCommon({
      dayName: "Hug Day",
      letterWhere:
        "It arrives by 'hug mail' in an airmail envelope after the five hugs and types itself out, so it should read like what the sender would say with their arms still around them: warm, close and specific, with one honest line about the distance or the hard part if the story has one.",
      letterMax: 3000,
      endLineWhere: "the very last line, handwritten under their finished Hug Passport.",
      photosWhere:
        "each photo is the polaroid souvenir of one hug in their passport, with this caption written on it. When the story names fewer moments than there are photos, the remaining captions simply describe the two of them as the story does (married, best friends, years together) and add no new event, place or object.",
      photoCount: 4,
    }),
    {
      path: "extras.openingLine",
      label: "What the bear says",
      kind: "text",
      max: 40,
      guide:
        "A tiny speech bubble from a bear with its arms thrown open on the cover of the passport, just before the recipient taps 'Come here': a soft, playful call to come close for a hug, in the sender's voice. 2–5 words, ends with a full stop or an exclamation mark. No name (the page prints it), no emoji.",
    },
    {
      path: "extras.hugLines",
      label: "Your line for each hug",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide:
        `Four lines, in this exact order, one for each hug the recipient collects: ${HUGS.map((h, i) => `${i + 1}) ${h}`).join(", ")}. Each line names, in the sender's voice, the moment that kind of hug is for: line 1 ${HUG_FOR[0]}; line 2 ${HUG_FOR[1]}; line 3 ${HUG_FOR[2]}; line 4 ${HUG_FOR[3]}. Turn at least two of them into something real the story names (their own words, places, habits). Each under 60 characters, ending with a full stop, no emoji. Language: the same as the story's own sentences. A Hinglish story gets four Hinglish lines (Hindi words in Latin letters, the way the sender texts), never English ones. Never add a trip, event or habit the story does not mention.` +
        VW_TONE,
    },
    {
      path: "extras.meetLine",
      label: "When the two phones meet",
      kind: "text",
      max: 50,
      guide:
        "One short line that appears when the recipient drags two phones (one with each of them in it) together across the distance between them and they finally touch: relief and joy at being close, in the sender's voice. 3–7 words, ends with a full stop." +
        VW_TONE,
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Hug coupon ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide:
          i === 0
            ? "The headline of the first hug coupon in a little booklet the recipient can redeem: one hug the sender owes them, named in a few words, best a specific hug from the story (a hug at a place or moment it mentions) or how long it lasts. The title itself contains the word 'hug' (or 'jhappi' in Hinglish): it is never a meal, an outing, a date or a gift, even one the story mentions. Under 26 characters."
            : `Hug coupon ${i + 1}: a different hug the sender owes them, named simply, best tied to a moment the story mentions. The title itself contains the word 'hug' (or 'jhappi' in Hinglish): never a meal, an outing, a date or a gift, even one the story mentions. Under 26 characters.`,
      },
      {
        path: `extras.coupons[${i}].detail`,
        label: `Hug coupon ${i + 1}: fine print`,
        kind: "text" as const,
        max: 80,
        guide: `The fine print on hug coupon ${i + 1}: when or how it can be redeemed, warm and a little playful. Tie it to something the story actually says; when the story names no place or date for it, use the next time they meet or when the sender is back, without naming a place. Under 70 characters.`,
      },
    ]),
    {
      path: "extras.replyLine",
      label: "Their message when they redeem a coupon",
      kind: "text",
      max: 80,
      guide:
        "The prefilled WhatsApp message the recipient sends when they redeem a hug coupon, written in the RECIPIENT's voice to the sender (the app adds the coupon and the sender's name after it, so do not sign it or repeat the coupon). Playful, like calling them in for hugging duty. Under 70 characters, at most one emoji.",
    },
    {
      path: "extras.question",
      label: "The last question",
      kind: "text",
      max: 60,
      guide:
        "The one sweet yes/no question before the last stamp, with a Yes button that stamps their passport 'forever' and a No that pleads and runs away. It asks them to be the sender's hug (or hugging partner) for good, in the sender's own words, nudged by what the story says they are to each other (dating, engaged, married). 4–9 words, ends with a question mark." +
        VW_TONE,
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 70,
      guide:
        "One short line that appears on a wall of hugging cartoon couples right after the recipient tapped yes. It is the SENDER reacting to their yes, in first person, to them: delight, relief or a little tease (never letting go, being stuck with them). It reacts to their answer and never answers the question itself. 4–10 words, can end with one emoji, written in the same language as the story's own sentences." +
        VW_TONE,
    },
    {
      path: "extras.hugTitle",
      label: "Their passport title",
      kind: "text",
      max: 24,
      guide:
        "The recipient's funny official title printed on their Hug Passport and on the last stamp, like a job title for hugging (for example 'VIP Hugger'). Two or three words, Title Case, playful, may nod to something from the story. Under 22 characters, no emoji, no name.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide:
        "One line shown under the sender's voice note, next to a little plush that purrs while it plays (or, when there is no recording, in the plush's speech bubble as the sender's own words). First person, addressed to them, one small detail or inside joke from the story, as if said out loud. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A sealed P.S. behind a wax seal under the finished passport at the very end, labelled 'open only…'. Begin with that condition as its own first line, 'Open only on' or 'Open only when' followed by a hard or tender moment the recipient might be living through when they read it (a heavy day, a night they can't sleep, missing the sender), taken from the story where it gives one, then a blank line, then two to four short sentences to them in first person: quieter than the letter, built on one detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 520 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "jaadu"],
};
