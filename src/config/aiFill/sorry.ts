import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * sorry — "I'm Sorry", an evergreen apology page on the Valentine's-week engine.
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are defined in server/src/config/valentineDays.ts.
 *
 * Every line follows what makes an apology land (Lewicki et al., 2016; Chapman
 * & Thomas): name the specific thing, own it with no "but" or "if you felt",
 * say why it hurt them, offer repair, promise a concrete change — and never
 * pressure for forgiveness. The demo seeds 5 mood lines, 5 reasons and 4
 * coupons, so those indices always exist.
 *
 * Not declared: palette (a visual choice) and answerMode / noTries (whether an
 * honest "I need time" is allowed is the sender's own decision in the form).
 */
const SORRY_TONE =
  " Sincere first, cute second: own it plainly, never blame them, never say 'if you felt' or 'but', never guilt-trip or beg dramatically." + VW_TONE;

export const sorry: AiFillTemplateSchema = {
  slug: "sorry",
  audience: "partner",
  premise:
    "An interactive apology page. The recipient taps a heart seal to open an envelope, slides a meter to show how upset they are (a cartoon bear's face follows, and the sender's line for that level appears), scratches a card to read exactly what the sender did, pops guilt bubbles that each hold one reason the sender is sorry, flips through photos, unfolds the sender's letter, holds a pinky promise until two hands meet, claims one make-it-up coupon, and finally answers a question while the No button runs away. It ends on an 'Officially Forgiven' certificate. Usually for a girlfriend, boyfriend or spouse after a fight, sometimes a crush or a best friend — follow the story. Cute, soft and sincere; the apology is real even when the tone is playful." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "apology",
      letterWhere:
        "It is the sender's real apology, read after the photos and before the promise. Say what happened in the story's own terms (only events the story states), how the sender thinks it made THEM feel, take full responsibility without excuses, say what they love about them, and close with the wish to make it right — not a demand to be forgiven. With a short story, stay in the present: how the sender feels now and what they will do differently.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of their 'Officially Forgiven' certificate, the keepsake at the very end.",
      photosWhere: "the photos are a strip of polaroids they swipe through under 'This is what I don't want to lose'.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with 'Yours, still sorry,' and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "Who you're saying sorry to",
      kind: "enum",
      options: ["partner", "crush", "bestie"],
      guide:
        "Who the apology is for, from the story: 'partner' for a girlfriend, boyfriend, spouse or partner; 'crush' when they are not together yet or it is complicated; 'bestie' for a best friend or friend. When unsure, 'partner'.",
    },
    {
      path: "extras.openingLine",
      label: "On the envelope",
      kind: "text",
      max: 60,
      guide: "A short, soft teaser printed under 'Psst, <their name>…' on the first screen, lowercase-casual, asking them to open it before staying mad. Under 50 characters, at most one emoji.",
      example: "someone is very, very sorry 🥺",
    },
    {
      path: "extras.moodLines",
      label: "How upset are they?",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide:
        "Exactly 5 short lines, in order, that the sender says when the recipient slides the meter to each level: 1 'a tiny bit upset', 2 'pouting', 3 'huffy', 4 'really angry', 5 'absolutely fuming'. Each reacts to THAT level — light and hopeful at 1, fully owning it at 5 — and never argues with how they feel. Each under 65 characters." +
        SORRY_TONE,
      example: "That pout is illegal. I'm sorry, really.",
    },
    {
      path: "extras.confession",
      label: "What I did",
      kind: "longtext",
      max: 160,
      guide:
        "What the sender did wrong, in one or two plain first-person sentences, taken ONLY from the story — the specific act, not a vague 'I hurt you'. No excuse, no 'but', no 'if you felt'. If the story does not say what happened, own the hurt plainly without inventing an event. Under 150 characters.",
      example: "I forgot our plans on Saturday and didn't even call. Then I got defensive instead of just saying sorry.",
    },
    {
      path: "extras.reasons",
      label: "Guilt bubbles",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide:
        "Exactly 5 short lines, one inside each bubble they pop, each a different reason the sender is sorry: how it made them feel, what they deserved instead, what the sender realises now, why they matter more than being right. Use details from the story where it gives them; never invent events. Each under 65 characters." +
        SORRY_TONE,
      example: "I made you feel unheard, and you never deserve that.",
    },
    {
      path: "extras.promise",
      label: "Your pinky promise",
      kind: "text",
      max: 120,
      guide:
        "One concrete, keepable promise about what the sender will do differently, tied to what went wrong in the story (listening before reacting, never cancelling last minute, calling when late). Not 'I'll never hurt you again'. First person, under 110 characters.",
      example: "I'll pause, breathe and listen before I react. And I'll never forget our plans again.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.coupons[${i}].title`,
        label: `Coupon ${i + 1}`,
        kind: "text" as const,
        max: 28,
        guide: `The name of make-it-up coupon ${i + 1}: a small, real treat or gesture the recipient can claim (a food date they love, unlimited hugs, picking the movie, a phone-free evening), using the story's favourites where it names any, each different, with one emoji. Under 26 characters.`,
        example: "Momo date 🥟",
      },
      {
        path: `extras.coupons[${i}].line`,
        label: `Coupon ${i + 1} — small print`,
        kind: "text" as const,
        max: 60,
        guide: `The playful small print for coupon ${i + 1}: what exactly it includes and a cute condition. Under 55 characters.` + VW_TONE,
        example: "Your favourite place. I'm paying, no arguments.",
      },
    ]),
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button runs away. It must match 'Who you're saying sorry to': partner → a 'Will you forgive me?' question; crush → a 'Still friends? Forgive me?' question; bestie → a 'Bestie, forgive me?' question. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you forgive me? 🥺",
    },
    {
      path: "extras.yesLine",
      label: "After they forgive you",
      kind: "text",
      max: 80,
      guide: "What appears the moment they forgive: first person, relieved and joyful, one short sentence, ideally with a hug or a callback to a claimed treat. Under 75 characters." + VW_TONE,
      example: "Best feeling ever. I owe you the biggest hug in the world 🤗",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
