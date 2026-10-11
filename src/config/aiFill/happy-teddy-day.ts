import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-teddy-day — "Teddy Catcher" (Valentine's week, 10 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts. The demo seeds
 * two outfit rows and three squeeze lines.
 * Not declared: furColor, nearMiss, outfit[].item (visual choices).
 */
export const teddyDay: AiFillTemplateSchema = {
  slug: "happy-teddy-day",
  audience: "partner",
  premise:
    "A Teddy Day page: in a cosy pastel arcade the recipient plays a coin-in claw machine that is rigged to win THEIR named teddy, then dresses the teddy, and the teddy carries the sender's letter in its paws. Squeezing the teddy shows little lines. Cute, cosy and funny." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Teddy Day",
      letterWhere: "The teddy carries it in its paws after it is won. It can mention the teddy as a stand-in for the sender's hugs when they are apart.",
      letterMax: 1500,
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
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
