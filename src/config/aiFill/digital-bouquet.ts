import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * digital-bouquet — "Digital Bouquet ✦ Premium" on the Valentine's-week
 * engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * Not declared: palette, the arrangement (stems), greenery, wrap, ribbon, bow,
 * charms and cardHand are visual choices the sender makes by hand in the
 * bouquet studio; flowerNotes belong to whichever flowers they picked, so the
 * studio writes those itself.
 */
export const digitalBouquet: AiFillTemplateSchema = {
  slug: "digital-bouquet",
  audience: "partner",
  premise:
    "A premium interactive digital bouquet. The sender arranges a bouquet of illustrated flowers by hand (roses, tulips, peonies, sunflowers, lilies and more), wraps it and ties a ribbon with a little gift tag. The recipient gets a delivery box at their door with a courier note, pulls the ribbon, and watches the bouquet bloom stem by stem; they tap each flower to read what it means, water it until it glows, find the sender's photos tucked between the stems as polaroids, open the sender's card (the main letter) from its envelope, and answer a soft question with a reaction. Usually for a girlfriend, boyfriend, wife or husband — 'just because', a birthday, an anniversary, a long-distance hello or a sorry; follow the story. Romantic, warm and cute." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "bouquet",
      letterWhere:
        "It is the card that comes with the flowers, opened from an envelope after the recipient has watered the bouquet and seen the photos. Write it like a handwritten flower card that grew into a real letter: why the sender is sending flowers today (from the story), what the recipient means to them, one or two specific memories the story gives, and a warm close. Never list the flowers or their meanings — the page shows those.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of the bouquet keepsake card they can download at the very end.",
      photosWhere: "the photos are tucked between the stems of the bouquet as little polaroids; the recipient taps one to pull it out and read its caption and note.",
      notes: true,
      greetingPrinted: "The card already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The card already signs it with 'With all my love,' and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "How should it feel?",
      kind: "enum",
      options: ["romantic", "sweet", "playful"],
      guide:
        "The voice of the page, from the story: 'romantic' (deep, tender) by default; 'sweet' for a cute, soft, early-days or just-because bouquet; 'playful' only when the story is light and teasing. When unsure, 'romantic'.",
    },
    {
      path: "extras.deliveryLine",
      label: "The courier's note",
      kind: "text",
      max: 70,
      guide: "A short note printed on the delivery box at their door, as if from a cute florist courier: says this is a special delivery for them. You may use their name or pet name. Under 65 characters, at most one emoji." + VW_TONE,
      example: "Special delivery for the prettiest girl in the world 💐",
    },
    {
      path: "extras.giftTag",
      label: "The gift tag",
      kind: "text",
      max: 40,
      guide: "Three to six words on the little tag tied to the ribbon, like 'For my Riya, always' — use their name or pet name if the story gives one. Under 36 characters, no emoji.",
      example: "For my Riya, always",
    },
    {
      path: "extras.question",
      label: "The soft question",
      kind: "text",
      max: 60,
      guide:
        "A small, sweet question after the card, which they answer by choosing a reaction (all of them happy): e.g. 'Do you like your flowers?' or, when the story is about a date or a reunion, 'Coffee with me this weekend?'. Never a proposal unless the story is one. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Do you like your flowers? 🥹",
    },
    {
      path: "extras.yesLine",
      label: "When they react",
      kind: "text",
      max: 80,
      guide: "What appears the moment they react: first person, happy and warm, one short sentence (a hug, a kiss, 'there are more flowers where these came from'). Under 75 characters." + VW_TONE,
      example: "Then I'll keep sending you flowers, forever 💗",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
