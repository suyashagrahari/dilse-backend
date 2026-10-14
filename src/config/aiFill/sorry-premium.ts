import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * sorry-premium — "I'm Sorry ✦ Premium" ("After the Rain"), Sorry's premium
 * edition on the Valentine's-week engine. Paths resolve against
 * `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys
 * are defined in server/src/config/valentineDays.ts.
 *
 * The scenes follow what makes an apology land (Lewicki et al., 2016; Chapman
 * & Thomas): own the specific thing (the flower), show you understand how it
 * felt for THEM (the plasters), say what you learnt (the fortune cookies),
 * commit to a concrete repair plan (the contract) — and never pressure for
 * forgiveness. The demo seeds 3 feelings, 3 lessons, 6 stars and 4 promises,
 * so those indices always exist.
 *
 * Not declared: palette (a visual choice), togetherSince (a real date the
 * sender types; never guessed) and answerMode (whether "I need a little time"
 * is offered is the sender's own decision in the form).
 */
const SP_TONE =
  " Sincere first, cute second: own it plainly, never blame them, never say 'if you felt' or 'but', never guilt-trip or beg dramatically." + VW_TONE;

export const sorryPremium: AiFillTemplateSchema = {
  slug: "sorry-premium",
  audience: "partner",
  premise:
    "A premium interactive apology page where the sky starts as a soft drizzle and clears a little with every scene. A little bear with an umbrella knocks at the recipient's door with a knock-knock joke; they water a wilted flower until it blooms with what the sender did; stick plasters on a cracked heart, each showing how the sender understands it felt for them; crack three fortune cookies holding what the sender learnt; shake a jar of paper stars, each one thing the sender loves about them; see photos on a washing line; sail the sender's letter across a puddle as a paper boat; and sign a 'peace contract' of the sender's promises with their finger. Then they answer a question (Yes, or an honest 'I need a little time'), push the last clouds away to reveal a rainbow, and keep a 'Peace Treaty'. Usually for a girlfriend, boyfriend or spouse after a fight — follow the story. Soft, warm and sincere; the apology is real even when the tone is playful." +
    VW_LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "apology",
      letterWhere:
        "It is the sender's real apology, folded into a paper boat they sail across a puddle, read after the photos and before the peace contract. Say what happened in the story's own terms (only events the story states), how the sender thinks it made THEM feel, take full responsibility without excuses, say what they love about them, and close with the wish to make it right and to talk when they're ready — not a demand to be forgiven. With a short story, stay in the present: how the sender feels now and what they will do differently.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of the 'Peace Treaty' keepsake at the very end, after the rainbow.",
      photosWhere: "the photos hang on a washing line under 'This is what I don't want to lose'; they tap one to unpeg it.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with 'Yours, in every weather,' and the sender's name underneath.",
    }).map((f) =>
      f.path === "petName"
        ? { ...f, guide: "The pet name or nickname the SENDER uses for THEM (the recipient), taken from the story — never a nickname the recipient uses for the sender. Leave empty if the story has none rather than inventing one." }
        : f,
    ),
    {
      path: "extras.tone",
      label: "How do you want to sound?",
      kind: "enum",
      options: ["sweet", "heartfelt", "silly"],
      guide:
        "The voice of the page, from the story: 'sweet' (cute and soft) by default; 'heartfelt' when the hurt was serious or the story is emotional; 'silly' only when the story is light (a small, forgivable mistake) and the sender wants to make them laugh. When unsure, 'sweet'.",
    },
    {
      path: "extras.knockLine",
      label: "At the door",
      kind: "text",
      max: 70,
      guide: "What the little bear says the moment they open the door: a short first-person line that says sorry and gently asks to come in. Under 65 characters, at most one emoji." + SP_TONE,
      example: "I hurt you, and I'm so sorry. Can I come in?",
    },
    {
      path: "extras.confession",
      label: "What I did (it blooms on the flower)",
      kind: "longtext",
      max: 160,
      guide:
        "What the sender did wrong, in one or two plain first-person sentences, taken ONLY from the story — the specific act, not a vague 'I hurt you'. No excuse, no 'but', no 'if you felt'. If the story does not say what happened, own the hurt plainly without inventing an event. Under 150 characters.",
      example: "I forgot our plans on Saturday and didn't even call. Then I got defensive instead of just saying sorry.",
    },
    {
      path: "extras.feelings",
      label: "How it made them feel (one per plaster)",
      kind: "list",
      max: 3,
      itemMax: 80,
      guide:
        "Exactly 3 short lines, one per plaster on the cracked heart, each naming a different way the sender understands it felt for THEM (unheard, unimportant, alone, let down…), written as the sender's understanding ('Like you…'), never as an excuse and never about the sender's own feelings. Use the story's details; never invent events. Each under 75 characters." +
        SP_TONE,
      example: "Like you weren't being heard, when all you wanted was me to listen.",
    },
    {
      path: "extras.lessons",
      label: "What I learnt (fortune cookies)",
      kind: "list",
      max: 3,
      itemMax: 80,
      guide:
        "Exactly 3 short first-person lessons, one inside each fortune cookie: what the sender has learnt from this, each different and tied to what went wrong in the story (listening first, small promises matter, being right isn't worth it). Not promises (those come later) and not apologies. Each under 75 characters." +
        SP_TONE,
      example: "Being right is never worth more than you feeling safe with me.",
    },
    {
      path: "extras.stars",
      label: "Jar of paper stars",
      kind: "list",
      max: 6,
      itemMax: 70,
      guide:
        "Exactly 6 short lines, one inside each paper star: specific things the sender loves about them — habits, little gestures, the way they laugh — from the story where it gives details, otherwise warm and concrete but never invented events or names. Each different, under 65 characters, no apologies here." + VW_TONE,
      example: "How you always save me the last bite.",
    },
    {
      path: "extras.promises",
      label: "The peace contract",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide:
        "Exactly 4 short, concrete, keepable promises — the sender's repair plan, each a clause of the contract they sign — tied to what went wrong in the story (listen first, no last-minute cancelling, say sorry the same day, a weekly phone-free evening). Never 'I'll never hurt you again'. First person, each under 65 characters.",
      example: "I'll listen first, and talk second.",
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer with Yes or 'I need a little time'. It must match the tone: sweet → a soft 'Will you forgive me?' question; heartfelt → a sincere one ('Can we start again, softer this time?'); silly → a playful one. You may use their pet name. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you forgive me? 🥺",
    },
    {
      path: "extras.yesLine",
      label: "When they forgive you",
      kind: "text",
      max: 80,
      guide: "What appears under the rainbow the moment they forgive: first person, relieved and joyful, one short sentence, ideally with a hug or the rain clearing. Under 75 characters." + VW_TONE,
      example: "The rain's gone. I owe you the biggest hug in the world 🤗",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
