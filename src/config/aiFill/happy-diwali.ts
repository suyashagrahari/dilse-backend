import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-diwali — "A Diya at Your Door". Runs on the Valentine's-week engine
 * like happy-halloween, so paths resolve against `ValentineDayData`
 * (client/app/(templates)/_valentine/types.ts) and the extras keys are defined
 * in server/src/config/valentineDays.ts.
 *
 * The demo seeds 4 photos and 5 wishes, so photos[0..3] and wishes[0..4]
 * always exist while the sender builds. `initials` is never declared: the
 * model put the sender's initial first about one time in four, and the client
 * already derives "<recipient>+<sender>" when the field is empty. `tone` is an enum on purpose: who the
 * page is for (partner / family / friend) is something a story DOES say, and
 * it changes the default blessing and the reply. `mithai` is declared too — a
 * story often names the sweet they fight over. Music and GIFs never are.
 *
 * Not forbidden: the words the page prints itself ("Happy Diwali", "Shubh
 * Deepavali", "diya"). Only brand names are swept (VW_FORBIDDEN).
 */
const LANGUAGE =
  " Write in the language and script of the sender's story — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. Warm, festive and family-safe. When the story names a product brand, write what the thing is instead.";

export const diwali: AiFillTemplateSchema = {
  slug: "happy-diwali",
  audience: "partner",
  premise:
    "A Happy Diwali page the recipient walks through on Diwali night, one small scene at a time: a diya waiting at their door with a little tag tied to it, which they light; a row of clay diyas they light one by one, each revealing one wish; a rangoli they colour in until short initials glow at its centre; a sparkler that writes one word in light; their photos hanging inside paper sky lanterns; fireworks they launch, with the sender's letter appearing in the glow; and a box of sweets that opens onto a 'Shubh Deepavali' blessing card signed by the sender. It is usually for a partner, but can be for family or a friend — follow the story. Every memory, habit and joke must come from the story itself: when the story is short, stay warm and general and wish them well rather than describing things the two of them did." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Diwali",
      letterWhere:
        "It appears in the glow of fireworks the recipient has just launched over a night sky, so it should feel like the warm, quiet thing you say once the noise settles: what this person brings into the sender's life, one or two real Diwali-season memories from the story (cleaning the house together, the first diya, sweets, family, a long-distance call) — only the ones the story gives you. Tender and specific, never a list of festival clichés. Build it only from what the story says. With a short story, look ahead instead of back: write about the year to come, what you hope it brings them, and why they matter to you.",
      letterMax: 1500,
      endLineWhere: "printed at the bottom of the Shubh Deepavali blessing card at the very end, above the sender's name.",
      photosWhere: "each photo hangs inside a glowing paper sky lantern that lights up when tapped.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with the sender's name underneath.",
    }),
    {
      path: "extras.tone",
      label: "Who it's for",
      kind: "enum",
      options: ["romantic", "family", "friends"],
      guide:
        "Who the page is for, from the story: 'romantic' for a partner, spouse, fiancé(e) or crush; 'family' for a parent, sibling, grandparent, cousin or other relative; 'friends' for a friend or best friend. When unsure, 'romantic'.",
    },
    {
      path: "extras.doorNote",
      label: "The tag on the diya",
      kind: "text",
      max: 60,
      guide:
        "The tiny handwritten tag tied to the diya left at their door, read before they light it: who it is for, said with one real detail from the story ('for the one who lights up my Diwali every year', 'for the girl who steals all the kaju katli'). Starts with 'for', lowercase is fine. Under 55 characters." +
        VW_TONE,
      example: "for the brightest light in my year",
    },
    ...[0, 1, 2, 3, 4].map((i) => ({
      path: `extras.wishes[${i}]`,
      label: `Diya ${i + 1} — the wish`,
      kind: "text" as const,
      max: 70,
      guide: `The wish that glows above clay diya ${i + 1} of 5 when they light it. Each of the five wishes is a different thing the sender wishes for them this year, grounded in the story (a hope for their new job, their health, the trip they keep planning, more of a habit the sender loves) and written as a full wish that starts with 'May' and speaks to them ('May your…', 'May you…'). ${i === 0 ? "This first one is the softest and most general." : i === 4 ? "This last one is the most personal: a wish for the two of them." : "Pick a different detail from the other wishes."} One sentence, under 65 characters, no emoji.`,
    })),
    {
      path: "extras.sparkleWord",
      label: "Written with the sparkler",
      kind: "text",
      max: 12,
      guide:
        "One short word they write in the air with a sparkler: the nickname or pet name the story itself uses for them; when the story uses none, exactly the name you wrote in 'Their name'. One word, 2–10 letters, no spaces, no emoji.",
    },
    {
      path: "extras.mithai",
      label: "The sweet in the box",
      kind: "enum",
      options: ["laddoo", "kaju-katli", "jalebi", "gulab-jamun", "barfi"],
      guide:
        "The sweet inside the mithai box at the end: the one the story says they love or fight over. When the story names none, 'laddoo'.",
    },
    {
      path: "extras.mithaiNote",
      label: "Note in the mithai box",
      kind: "text",
      max: 80,
      guide:
        "The little note under the lid of the sweet box: playful, first person, about the sweet and them, with one real habit from the story (they steal the last piece, they count calories then eat three); when the story names no such habit, make it a playful offer of the whole box instead. One sentence, under 75 characters." +
        VW_TONE,
      example: "Every piece is yours. Yes, even the one you'll pretend you didn't take.",
    },
    {
      path: "extras.blessing",
      label: "The Diwali blessing",
      kind: "text",
      max: 120,
      guide:
        "The blessing printed big on the 'Shubh Deepavali' card at the end: what the sender wishes their year to be filled with, warm and a little poetic, with one detail that is theirs (their home, their work, their family, the two of them). One or two short sentences, under 110 characters, no emoji.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
