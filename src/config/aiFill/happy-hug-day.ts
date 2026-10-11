import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-hug-day — "Jaadu Ki Jhappi Café" (Valentine's week, 12 Feb).
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts. The demo seeds
 * four menu items and three coupons, so those indices always exist; rows 5–6
 * are the sender's to add by hand. Photo notes are not declared to stay under
 * the 40-field ceiling. Not declared: characters (a visual choice).
 */
export const hugDay: AiFillTemplateSchema = {
  slug: "happy-hug-day",
  audience: "partner",
  premise:
    "A Hug Day page set in a cosy café, the 'Jaadu Ki Jhappi Café': the recipient squishes two chubby characters into a hug, orders from a Hug Menu where each hug is a little gesture, collects stamps in a Jhappi Passport, and tears off Hug Coupons to redeem later. Soft, warm, knitted-sweater mood." + VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Hug Day",
      letterWhere: "It is a card tucked in a hoodie pocket, opened after the first hug. It can talk about hugging them for real soon.",
      letterMax: 1500,
      endLineWhere: "on the final screen with the hug coupons.",
      photosWhere: "the photos are patches on a cosy memory quilt.",
      signaturePrinted: "The card already prints the sender's signature under it, in script.",
    }),
    {
      path: "extras.cafeSign",
      label: "Café sign",
      kind: "text",
      max: 40,
      guide: "The hand-painted sign over the café door, made for them (their name, pet name or a detail from the story). Under 38 characters, same language as the story.",
      example: "Jhappi Café · open only for you",
    },
    {
      path: "extras.squishPrompt",
      label: "Squish prompt",
      kind: "text",
      max: 40,
      guide: "The tiny instruction asking them to push the two characters together into a hug. Cute and a little dramatic, under 36 characters, in the story's language, one emoji allowed.",
    },
    {
      path: "extras.tagMe",
      label: "Name tag — sender's character",
      kind: "text",
      max: 12,
      guide: "The name tag on the character that stands for the sender: the sender's first name, or the nickname the story gives the sender. Never a pronoun. Under 12 characters.",
    },
    {
      path: "extras.tagYou",
      label: "Name tag — their character",
      kind: "text",
      max: 12,
      guide: "The name tag on the character that stands for the recipient: their pet name from the story if there is one, otherwise their first name. Never a pronoun. Under 12 characters.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.menu[${i}].name`,
        label: `Hug ${i + 1} — name`,
        kind: "text" as const,
        max: 24,
        guide: `The name of hug ${i + 1} on the café's Hug Menu (a kind of hug: bear hug, back hug, sleepy hug, airport hug…), each different. Under 22 characters.`,
        example: "Bear Hug",
      },
      {
        path: `extras.menu[${i}].line`,
        label: `Hug ${i + 1} — description`,
        kind: "text" as const,
        max: 70,
        guide: `The menu description for hug ${i + 1}: when to order it — a specific situation from their life in the story — and what it does, like a café menu would describe a drink. Under 65 characters. Simple, correct words; if the Hinglish phrasing is not natural, write it in English.` + VW_TONE,
        example: "For exam nights. Comes with one head pat and zero lectures.",
      },
      {
        path: `extras.menu[${i}].price`,
        label: `Hug ${i + 1} — price`,
        kind: "text" as const,
        max: 20,
        guide: `A silly 'price' for hug ${i + 1} paid in affection (a smile, two kisses, free forever). Under 18 characters.`,
        example: "1 smile",
      },
    ]),
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Coupon ${i + 1}`,
        kind: "text" as const,
        max: 30,
        guide: `The headline of tear-off Hug Coupon ${i + 1} — one specific hug they can redeem later, tied to a situation from the story (the three coupons are three different kinds of hug, worded differently). Under 28 characters, same language as the story.`,
      },
      {
        path: `extras.coupons[${i}].detail`,
        label: `Coupon ${i + 1} — fine print`,
        kind: "text" as const,
        max: 80,
        guide: `The playful fine print on coupon ${i + 1}, like real terms and conditions: when it can be used, a silly condition or an expiry, with a nod to the story. Under 75 characters.`,
        example: "Valid on bad hair days. Not valid on the remote.",
      },
    ]),
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
