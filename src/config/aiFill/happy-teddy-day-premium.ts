import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-teddy-day-premium — "Made With a Heart", the ULTRA-PREMIUM twin of happy-teddy-day. Owned by
 * that template's builder: started as a copy of ./happy-teddy-day.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-teddy-day.ts):
 * happy-teddy-day — "Teddy Catcher" (Valentine's week, 10 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts. The demo seeds
 * two outfit rows and three squeeze lines.
 * Not declared: furColor, nearMiss, outfit[].item (visual choices).
 */
export const teddyDayPremium: AiFillTemplateSchema = {
  slug: "happy-teddy-day-premium",
  audience: "partner",
  premise:
    "A Teddy Day page: in a cosy pastel arcade the recipient plays a coin-in claw machine that is rigged to win THEIR named teddy, then dresses the teddy, and the teddy carries the sender's letter in its paws. Squeezing the teddy shows little lines. Cute, cosy and funny." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Teddy Day",
      letterWhere: "The teddy carries it in its paws after it is won. It can mention the teddy as a stand-in for the sender's hugs when they are apart.",
      letterMax: 3000,
      endLineWhere: "on the final 'keep me close' screen with the sleeping teddy.",
      photosWhere: "the photos are pinned as polaroids on a cork board.",
      notes: true,
    }),
    {
      path: "extras.teddyName",
      label: "Teddy's name",
      kind: "text",
      max: 20,
      guide: "A cute name for the teddy, which stands in for the SENDER while they are apart. Build it from an inside joke or a food/thing from the story (a teddy called after their shared snack is perfect); otherwise a sweet one-word teddy name. It must not be the recipient's own name or their pet name. One or two words, under 16 characters.",
      example: "Golu",
    },
    {
      path: "extras.marquee",
      label: "Claw machine sign",
      kind: "text",
      max: 40,
      guide: "The glowing marquee on top of the claw machine, arcade style, made for them (their name or a detail from the story). Under 38 characters, same language as the story.",
      example: "1 free play for my favourite person",
    },
    {
      path: "extras.winLine",
      label: "When they win",
      kind: "text",
      max: 60,
      guide: "The line when the teddy drops into the prize chute: a playful twist that the real prize is the sender, in your own words with a nod to the story. Under 55 characters, one emoji allowed.",
    },
    {
      path: "extras.outfit[0].note",
      label: "Outfit note 1",
      kind: "text",
      max: 60,
      guide: "A speech-bubble note that pops when the teddy wears its first accessory. The sender picks the accessory, so the note must work on any of them (bow, crown, cap, scarf…): start with 'Because' and make it about the recipient, with a joke from the story. Under 55 characters." + VW_TONE,
      example: "Because you rule my heart (and the remote).",
    },
    {
      path: "extras.outfit[1].note",
      label: "Outfit note 2",
      kind: "text",
      max: 60,
      guide: "The speech-bubble note for the teddy's second accessory — same rules as note 1 (works on any accessory, starts with 'Because', about the recipient), a different story detail and a different joke. Under 55 characters." + VW_TONE,
    },
    {
      path: "extras.squeezeLines",
      label: "Squeeze lines",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide: "3 to 5 tiny lines that pop up each time they squeeze the teddy, in the teddy's voice (the teddy is reporting for the sender), cute and funny, each a callback to a different detail from the story. Each under 65 characters." + VW_TONE,
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt,
    // unlockTz, allowReply, voicePeaks — none of them is something a story says.
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "The one handwritten line printed under the sender's voice note, read just before they press play (or, if no voice note is recorded, shown as a short typed 'transmission' from the sender). First person, addressed to them, one small detail or inside joke from the story. Under 85 characters, same language as the story, no hashtags.",
      example: "Play this with headphones. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. envelope at the very end of the page, labelled 'open only if…'. Begin with that condition as its own first line, specific to these two (open only if you miss me tonight / open only if you ever doubt this), then a blank line, then two to four short sentences to them in first person — quieter and more intimate than the main letter, built on one specific detail from the story the letter did not use. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only if you can't sleep.\n\nI still have the ticket from that first film. You talked through the whole thing and I've never loved a movie more.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
