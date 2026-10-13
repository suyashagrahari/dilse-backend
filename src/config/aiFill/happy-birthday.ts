import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-birthday — "Happy Birthday", an evergreen birthday surprise on the
 * Valentine's-week engine. Paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts); extras keys are defined in
 * server/src/config/valentineDays.ts.
 *
 * What makes these pages land (the "I made you a website" birthday gifts):
 * real, specific memories and small quirks over generic praise, a wish for
 * THEIR year, playful coupons that fit their life. The demo seeds 5 reasons
 * and 4 coupons, so those indices always exist.
 *
 * Not declared: palette (a visual choice) and askWhen (whether to ask "when?"
 * after yes is the sender's own decision in the form).
 */
const HB_TONE = " Celebrate them, not the sender: specific, warm and a little funny; a real detail from the story beats any compliment." + VW_TONE;

export const birthday: AiFillTemplateSchema = {
  slug: "happy-birthday",
  audience: "partner",
  premise:
    "An interactive birthday surprise page. The birthday person tugs a bow to untie a wrapped gift, lights five candles on a cake with their name piped on it, makes a wish and blows them out (a line from the sender appears), swipes to cut the cake (the first slice comes with another short line), pops five balloons that each hold one thing the sender loves about them, swipes through photos on a string of fairy lights, opens the sender's birthday card, unwraps birthday coupons and claims one, then answers a question while the No button runs away. It ends on a crown certificate. Usually for a girlfriend, boyfriend or spouse, sometimes a crush or a best friend — follow the story. Cute, romantic and celebratory." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "birthday",
      letterWhere:
        "It is the sender's birthday letter, read after the photos, inside a card that says Happy Birthday. Recall one or two real moments from the story, say what the sender loves about who they are, and wish them something specific for the year ahead. Only events the story states. With a short story, write only feelings and wishes — how the sender feels about them today and what they hope this year brings them — with no remembered scenes and no habits of theirs at all; every sentence must be true of anyone the sender loves this much.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their crown certificate, the keepsake at the very end — a short toast to them.",
      photosWhere: "the photos are polaroids pegged to a string of fairy lights they swipe through under 'Our favourite memories'.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with a sign-off line and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the birthday person), taken from the story — never a nickname the birthday person uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "Whose birthday it is",
      kind: "enum",
      options: ["partner", "crush", "bestie"],
      guide:
        "Who the birthday person is to the sender, from the story: 'partner' for a girlfriend, boyfriend, spouse or partner; 'crush' when they are not together yet or it is complicated; 'bestie' for a best friend or friend. When unsure, 'partner'.",
    },
    {
      path: "extras.crown",
      label: "Crown them",
      kind: "enum",
      options: ["queen", "king", "star"],
      guide: "The title on their crown certificate: 'queen' when the story makes clear the birthday person is a woman or girl, 'king' when it makes clear he is a man or boy, 'star' when it does not say.",
    },
    {
      path: "extras.age",
      label: "The number on the cake",
      kind: "text",
      max: 3,
      guide: "The age they are turning, as digits only, ONLY when the story states it outright. Otherwise leave it empty — the cake then gets a heart topper.",
      example: "24",
    },
    {
      path: "extras.openingLine",
      label: "On the gift tag",
      kind: "text",
      max: 60,
      guide: "A short, playful teaser printed under 'Psst, <their name>…' on the first screen, inviting them to untie the ribbon. Lowercase-casual, under 50 characters, at most one emoji.",
      example: "someone wrapped up a little surprise 🎀",
    },
    {
      path: "extras.wishLine",
      label: "After they blow the candles",
      kind: "text",
      max: 100,
      guide:
        "What appears right after they make a wish and blow out the candles: one or two short first-person sentences about their wish coming true, tied to something they want or dream of in the story where it says so. Under 95 characters." +
        HB_TONE,
      example: "I hope this is the year the café dream finally gets its first customer. Me, obviously ☕",
    },
    {
      path: "extras.cakeLine",
      label: "With the first slice",
      kind: "text",
      max: 90,
      guide: "A short, sweet line that comes with the first slice of cake after they cut it — playful, about cake and them, using a food or treat they love from the story where it names one. Under 85 characters." + HB_TONE,
      example: "First slice is yours. The last one too. Okay fine, the whole cake 🍰",
    },
    {
      path: "extras.reasons",
      label: "Balloons: what I love about you",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide:
        "Exactly 5 short lines, one inside each balloon they pop, each a different specific thing the sender loves about them: a habit, a quirk, a way they make the sender feel, something they did. Pull details from the story; never invent events. When the story gives few details, write about who they are and how they make the sender feel — qualities, not habits or scenes. Each under 65 characters." +
        HB_TONE,
      example: "How you narrate your day like a podcast. I'd subscribe forever.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Coupon ${i + 1}`,
        kind: "text" as const,
        max: 28,
        guide: `The name of birthday coupon ${i + 1}: a small, real treat or gesture they can claim (a food date they love, breakfast in bed, a day where the sender says yes to everything, a trip they keep mentioning), using the story's favourites where it names any, each different, with one emoji. Under 26 characters.`,
        example: "Breakfast in bed 🥞",
      },
      {
        path: `extras.coupons[${i}].line`,
        label: `Coupon ${i + 1} — small print`,
        kind: "text" as const,
        max: 60,
        guide: `The playful small print for coupon ${i + 1}: what exactly it includes and a cute condition. Under 55 characters.` + VW_TONE,
        example: "Pancakes, coffee, zero dishes for you.",
      },
    ]),
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button runs away. It must match 'Whose birthday it is': partner → a birthday-date question; crush → asking to take them out for their birthday; bestie → a birthday plan for the two of them. You may use their pet name or a plan from the story. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Birthday date with me? 🥂",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide: "What appears the moment they say yes: first person, excited and sweet, one short sentence, ideally a hint at the plan from the story. Under 75 characters." + VW_TONE,
      example: "Best birthday gift? You saying yes. Wear something cute 💗",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
