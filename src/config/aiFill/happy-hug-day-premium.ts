import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-hug-day-premium — "Hold Me for 20 Seconds", the ULTRA-PREMIUM twin of
 * happy-hug-day. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); the extras keys are in
 * ../premiumDays/happy-hug-day-premium.ts.
 *
 * The demo seeds 4 photos, 4 hug lines, 3 mittens and 2 hug passes, so those
 * indices exist while the sender builds.
 *
 * Not declared: distanceKm, holdSeconds, heartbeatBpm (numbers the sender
 * sets; a story rarely states them and the model would invent them), music,
 * GIFs, media.
 *
 * forbiddenOutput sweeps brand names, the $2 page's own identity (its café
 * name) and medical framing the brief rules out — the copy says "long enough
 * to feel it", never a health claim.
 */
const LANGUAGE =
  " Write in the language and script the sender's story is written in — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. When the story names a product brand, write what the thing is instead.";

export const hugDayPremium: AiFillTemplateSchema = {
  slug: "happy-hug-day-premium",
  audience: "partner",
  premise:
    "A premium Hug Day page that is the closest a phone can get to being held. The recipient wipes a frosted winter window to find their name and one line from the sender, drags two tiny figures (the two of them) together across a snowy field, then holds the phone with both thumbs for twenty seconds while two warm heat shapes melt into one, a heartbeat slows and the sender's short lines fade in breath by breath. Then they rub knitted mittens warm to open notes saved for bad days, unzip an oversized hoodie to read the letter on its lining, crawl into a blanket fort of their photos, and hug the sender back. Soft, slow, intimate and present-tense: comfort, warmth, 'I'm here' — never jokes during the hug, never therapy-speak, never health claims. It is usually for a partner who is far away, but can be for anyone who needs a hug — follow the story." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Hug Day",
      letterWhere:
        "It is written on the soft lining of a hoodie they unzip, so it should read like what the sender would say with their arms around them: warm, close and specific, with one honest line about the distance or the hard part if the story has one.",
      letterMax: 3000,
      endLineWhere: "on their hug certificate at the very end.",
      photosWhere: "the photos are sewn as patches into a quilt over a blanket fort, each with a stitched label.",
      notes: true,
      greetingPrinted: "The lining already shows a 'Dear <their name>,' line above it.",
      signaturePrinted: "The lining already signs it with the sender's name underneath.",
    }),
    {
      path: "extras.frostLine",
      label: "Written behind the frost",
      kind: "text",
      max: 50,
      guide:
        "The line they find under their name when they wipe a frosted window clean: a soft, short call to come close, in the sender's voice, in the present tense, with at most one small detail from the story. Under 40 characters, no emoji.",
    },
    {
      path: "extras.hugLines",
      label: "Lines during the hug",
      kind: "list",
      max: 4,
      itemMax: 60,
      guide:
        "Four very short lines that fade in, one every few seconds, while they hold the screen for a twenty-second hug — the things the sender would murmur while holding them. Present tense, calm, simple words, each a different feeling (permission to rest, staying, being safe, being loved); one may carry a tiny real detail from the story. Each under 45 characters, no emoji, no questions." +
        VW_TONE,
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.weatherHugs[${i}].when`,
        label: `Mitten ${i + 1} — the moment`,
        kind: "text" as const,
        max: 28,
        guide: `The label knitted on mitten ${i + 1} of 3, starting with 'For': a specific kind of day this person really has, taken from the story (their exams, a hard shift, missing home, a bad commute). Three different moments across the three. Under 26 characters.`,
      },
      {
        path: `extras.weatherHugs[${i}].note`,
        label: `Mitten ${i + 1} — the note inside`,
        kind: "text" as const,
        max: 120,
        guide: `The note inside mitten ${i + 1}, read on exactly that kind of day: one or two short sentences to them in the sender's voice — practical tenderness (rest, eat, call me) plus one detail only these two share. Under 110 characters.` + VW_TONE,
      },
    ]),
    ...[0, 1].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Hug pass ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide: `Hug pass ${i + 1} of 2 that they can tear off and redeem: one specific hug the sender owes them, named simply (a kind of hug and where or when it happens — only places the story mentions, or 'when we meet'). Two different hugs. Under 26 characters.`,
      },
      {
        path: `extras.coupons[${i}].detail`,
        label: `Hug pass ${i + 1} — fine print`,
        kind: "text" as const,
        max: 80,
        guide: `The fine print of hug pass ${i + 1}: when or how it can be redeemed, warm and a little playful. Tie it to something the story actually says; when the story says little, tie it to the distance between them or the next time they meet instead. Under 70 characters.`,
      },
    ]),
    {
      path: "extras.hoodieTag",
      label: "Label stitched on the hoodie",
      kind: "text",
      max: 24,
      guide: "The little label stitched inside the hoodie's collar, like a clothing tag: two to four words that say the hoodie (and the person) belongs with the sender, with a light touch. Under 22 characters, no emoji.",
    },
    {
      path: "extras.replyLine",
      label: "Their reply",
      kind: "text",
      max: 80,
      guide:
        "The prefilled WhatsApp reply the recipient sends after hugging the sender back, written in the RECIPIENT's voice to the sender (the app adds the sender's name after it, so do not sign it). Soft and sincere, one small detail from the story. Under 75 characters, at most one emoji.",
    },
    // ── Premium-only text leaves ─────────────────────────────────────────────
    {
      path: "premium.voiceCaption",
      label: "Line by your voice note",
      kind: "text",
      max: 90,
      guide:
        "The handwritten line beside the sender's voice note, found in the hoodie's pocket (if no voice note is recorded, this line IS the message). First person, to them, quiet and close, with one small detail from the story. Under 80 characters, same language as the story, no hashtags.",
    },
    {
      path: "premium.psLetter",
      label: "The P.S. in the other pocket",
      kind: "longtext",
      max: 600,
      guide:
        "A P.S. in the hoodie's other pocket. Begin with an 'Open only on…' or 'Open only when…' condition as its own first line, specific to these two (a bad day, a night they can't sleep), then a blank line, then two to four short sentences to them in first person — quieter than the letter, built on one detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 520 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: [...VW_FORBIDDEN, "oxytocin", "scientifically", "jaadu"],
};
