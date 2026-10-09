import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-hug-day-premium — "The Twenty-Second Hug", the premium twin of happy-hug-day. "Come here." arrives one word
 * per screen; two black-and-white photos of the couple are dragged together across the distance; then the recipient
 * holds a thumb on the sender's photo for twenty seconds while it blooms into colour, a heartbeat slows and the
 * sender's lines fade in, landing on the chorus. Then what the hugs feel like (one line over each photo), the letter,
 * the voice note, and a hug coupon to tear off and redeem.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-hug-day-premium.ts. The demo seeds 6 photos, 4 hug lines, 4 feel lines and 2 coupons, so
 * those indices exist while the sender builds.
 *
 * Not declared: distanceKm, holdSeconds, heartbeatBpm (numbers the sender sets; a story rarely states them and the
 * model would invent them), photo notes (this page never shows them), music, drop, unlock, GIFs, media.
 * forbiddenOutput sweeps the medical framing the brief rules out (the copy says "they say…", never a health claim).
 * The P.S. has no example: an example there leaks into the other fields.
 */
export const hugDayPremium: AiFillTemplateSchema = {
  slug: "happy-hug-day-premium",
  audience: "partner",
  premise:
    "A cinematic Hug Day page that is the closest a phone can get to being held. It opens on 'Come here.', one word per screen, then the recipient's name. Two black-and-white photos of the two of them stand at the edges of the screen with the distance between them printed large; the recipient drags them together until the number reaches zero. Then the recipient holds a thumb on the sender's photo for twenty seconds: it slowly blooms from black-and-white into colour under their thumb while a heartbeat slows and the sender's short lines fade in one by one, until the song's chorus lands and the hug is delivered. Afterwards the page is in colour: four lines about what the sender's hugs feel like, each over a photo; the letter; the sender's voice; and a hug coupon they tear off to redeem in person. Soft, slow, intimate and present-tense: comfort, warmth, 'I'm here'. Never jokes during the hug, never therapy-speak, never health claims. Usually for a partner who is far away, but it can be for anyone who needs a hug: follow the story. Every line stays true to the story: when the story is short, write simpler lines about what it does say rather than adding trips, habits or events of your own." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Hug Day",
      letterWhere:
        "It unfolds on soft paper right after the twenty-second hug, so it should read like what the sender would say with their arms still around them: warm, close and specific, with one honest line about the distance or the hard part if the story has one.",
      letterMax: 3000,
      endLineWhere: "the very last line, set large beside the hug coupon at the end.",
      photosWhere:
        "the photos are prints: the first is the one that blooms into colour during the hug, the rest lie in a stack under 'what your hugs feel like', each with its caption written along the bottom in italic. When the story names fewer moments than there are photos, the remaining captions simply describe the two of them as the story does and add no new event, place or object.",
      photoCount: 4,
      signaturePrinted: "The page signs it with the sender's name underneath.",
    }),
    {
      path: "extras.openingLine",
      label: "The first words, one at a time",
      kind: "text",
      max: 40,
      guide:
        "Two to four words that open the page, shown one word per screen, huge, just before the recipient's name: a soft call to come close, in the sender's voice, ending with a full stop (for example a variation on 'come here'). No name (the page prints it next), no emoji.",
    },
    {
      path: "extras.meetLine",
      label: "When the two photos meet",
      kind: "text",
      max: 50,
      guide:
        "One short sentence that appears the moment the recipient drags the two photos of them together and the distance between them reaches zero, just before the twenty-second hug: relief at being close, and an invitation to hold on. 3–8 words, in the sender's voice, ends with a full stop." +
        VW_TONE,
    },
    {
      path: "extras.hugLines",
      label: "What you'd whisper during the hug",
      kind: "list",
      max: 4,
      itemMax: 60,
      guide:
        "Four very short lines that fade in one after another while the recipient holds the screen for a twenty-second hug: the things the sender would murmur while holding them. Present tense, calm, simple words, each a different feeling (permission to rest, staying, being safe, being home); one may carry a tiny real detail from the story. Each under 40 characters, no emoji, no questions." +
        VW_TONE,
    },
    {
      path: "extras.hugFeels",
      label: "What your hugs feel like",
      kind: "list",
      max: 4,
      itemMax: 60,
      guide:
        "Four lines that each complete 'Your hugs feel like…' and are printed large over a photo after the hug, one per photo. Each is a vivid comparison. At least two of the four are built from something real the story names (a place, a habit, an object, a ritual of theirs) turned into a feeling; the others may be quiet sensory comforts. Four different images, each under 45 characters, ending with a full stop, no emoji. Same language as the rest of the page: in English each starts with 'Like'; in Hinglish, write the comparison the Hinglish way." +
        VW_TONE,
    },
    ...[0, 1].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Hug coupon ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide:
          i === 0
            ? "The headline of the hug coupon on the last screen, which the recipient tears off and sends back to redeem in person: the hug the sender owes them, named in a few words (for example a count of hugs owed, or one specific hug at a place or moment the story mentions). Under 26 characters."
            : "A second, different hug coupon: one more specific hug the sender owes them, named simply. It is always a hug (a kind of hug, or a hug at a moment the story mentions), never a meal, a date or a gift. Under 26 characters.",
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
      label: "Their message when they redeem it",
      kind: "text",
      max: 80,
      guide:
        "The prefilled WhatsApp message the recipient sends when they tear off the coupon, written in the RECIPIENT's voice to the sender (the app adds the coupon and the sender's name after it, so do not sign it or repeat the coupon). Soft and a little playful, one small detail from the story. Under 70 characters, at most one emoji.",
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "The line with your voice note",
      kind: "text",
      max: 90,
      guide:
        "One line shown with the sender's voice note near the end of the page (or on its own, large, as the sender's words when there is no recording). First person, to them, quiet and close, with one small detail from the story, as if said out loud. Under 80 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide:
        "A sealed P.S. at the very end of the page, labelled 'open only…'. Begin with that condition as its own first line, 'Open only on' or 'Open only when' followed by a hard or tender moment the recipient might be living through when they read it (a heavy day, a night they can't sleep, missing the sender), taken from the story where it gives one, then a blank line, then two to four short sentences to them in first person: quieter than the letter, built on one detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 520 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "oxytocin", "scientifically", "jaadu"],
};
