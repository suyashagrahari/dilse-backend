import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_TONE, valentineCommon } from "./valentineShared";

/**
 * happy-halloween-premium — "The Midnight Manor", the ULTRA-PREMIUM twin of happy-halloween. Owned by
 * that template's builder: started as a copy of ./happy-halloween.ts (premise, fields
 * and guides still describe the $2 page — rewrite them for the premium design),
 * with letterMax 3000 and two premium text leaves at the end.
 *
 * Base notes (from ./happy-halloween.ts):
 * happy-halloween — "The Little Haunted House" (31 Oct). Runs on the
 * Valentine's-week engine as a ninth template, so paths resolve against
 * `ValentineDayData` (client/app/(templates)/_valentine/types.ts) and the
 * extras keys are defined in server/src/config/valentineDays.ts.
 *
 * The demo seeds 4 photos and 4 ingredients, so photos[0..3] and
 * ingredients[0..3] always exist while the sender builds. `tone` and `costume`
 * are declared as enums on purpose: who the page is for (partner / bestie /
 * family / a kid) and which costume suits them are things a story DOES say,
 * and the tone changes the question and the ending. Music and GIFs are never
 * declared.
 *
 * Not forbidden: the words the page prints itself ("Happy Halloween", "boo").
 * The end line is SUPPOSED to wish them a happy Halloween and the question is
 * supposed to say boo; only brand names are swept (VW_FORBIDDEN).
 */
const LANGUAGE =
  " Write in the language and script of the sender's story — an English story gets English, a Hinglish story gets Hinglish in Latin letters — and keep every field in that one choice. Cute-spooky, never scary or gory: no blood, no death, no real ghosts or curses. When the story names a product brand, write what the thing is instead.";

export const halloweenPremium: AiFillTemplateSchema = {
  slug: "happy-halloween-premium",
  audience: "partner",
  premise:
    "A Happy Halloween page built as a tiny haunted house the recipient walks through, room by room: they knock on the door (the gate has a funny sign), choose trick or treat (a cute ghost shouts BOO and reads the sender's 'trick'), carve a pumpkin whose back glows with a short word, wipe fog off portraits to find their photos, read a letter by flashlight in a dark attic, pour labelled bottles of memories into a love potion, and finally answer a question while the No button turns into a ghost and vanishes. It ends on a 'Boo License' keepsake with their costume. It is usually for a partner or crush, but can be for a best friend, family, or a child — follow the story." +
    LANGUAGE,
  fields: [
    ...valentineCommon({
      dayName: "Halloween",
      letterWhere:
        "It hangs in a pitch-dark attic and they read it by moving a flashlight over it, line by line, so it should feel like a secret said quietly in the dark: intimate, warm, with a light Halloween wink (a costume, a scary movie, candy, a pumpkin, the dark) only where the story gives you one — never horror. If the page is for a child or family, keep it gentle and sweet.",
      letterMax: 3000,
      endLineWhere: "printed under their Boo License, the keepsake card at the very end.",
      photosWhere: "the photos hang as crooked portraits in a haunted hallway, behind fogged glass they wipe clean.",
      notes: true,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page already signs it with the sender's name underneath.",
    }),
    {
      path: "extras.tone",
      label: "Who it's for",
      kind: "enum",
      options: ["romantic", "friends", "family", "kids"],
      guide:
        "Who the page is for, from the story: 'romantic' for a partner, spouse or crush; 'friends' for a best friend or friend; 'family' for a parent, sibling, cousin or other grown-up relative; 'kids' only when the recipient is clearly a child. When unsure, 'romantic'.",
    },
    {
      path: "extras.houseName",
      label: "Sign on the gate",
      kind: "text",
      max: 40,
      guide:
        "The name painted on the haunted house's gate sign, the first thing they see. A short, punny house name built from one detail of the story (their nickname, a running joke, a place they love) — a 'Villa Boo-tiful' style pun, not a generic one. Under 36 characters.",
      example: "The Haunted Hideout",
    },
    {
      path: "extras.trickLine",
      label: "Your “trick”",
      kind: "text",
      max: 80,
      guide:
        "What a cute ghost announces if they pick TRICK, starting with 'Trick!': a playful IOU, dare or fake threat taken from the story (they owe the sender something, a chore, a stolen hoodie, the last snack). Teasing, never mean. Under 75 characters." +
        VW_TONE,
      example: "Trick! You owe me three hugs and the last slice.",
    },
    {
      path: "extras.carveWord",
      label: "Carved on the pumpkin",
      kind: "text",
      max: 10,
      guide:
        "One short word carved through the back of a glowing pumpkin: the recipient's nickname or pet name from the story, or a two-to-six letter word that means something to them. A single word, 2–10 letters, no spaces, no emoji, no punctuation.",
    },
    {
      path: "extras.costume",
      label: "Their costume",
      kind: "enum",
      options: ["ghost", "witch", "vampire", "pumpkin", "black-cat", "skeleton", "mummy", "bat"],
      guide:
        "The Halloween costume printed on their Boo License — the one that fits them best from the story (a night owl → bat or vampire, a cat lover or a napper → black-cat, someone who 'ghosts' chats → ghost, a sweet round cheerful person → pumpkin). When nothing fits, 'ghost'.",
    },
    {
      path: "extras.costumeWhy",
      label: "Why that costume",
      kind: "text",
      max: 70,
      guide:
        "One funny, affectionate line on the Boo License explaining why that costume suits them, starting with 'Because', taken from a real habit in the story. Under 65 characters." + VW_TONE,
      example: "Because you nap all day and still judge me.",
    },
    ...[0, 1, 2, 3].flatMap((i) => [
      {
        path: `extras.ingredients[${i}].name`,
        label: `Potion bottle ${i + 1} — label`,
        kind: "text" as const,
        max: 30,
        guide: `The label on potion bottle ${i + 1} of 4 that they pour into a love potion: a real memory or quality from the story written like a recipe ingredient — a measure plus one thing ('A pinch of your laugh', 'One stolen fry', 'Rain from our first walk'). Four different details across the four bottles. It is printed on a tiny label, so keep it to 2–4 short words and at most 22 characters; never cut a word off — pick a shorter phrase instead.`,
      },
      {
        path: `extras.ingredients[${i}].line`,
        label: `Potion bottle ${i + 1} — what it really is`,
        kind: "text" as const,
        max: 70,
        guide: `The little line that bubbles up when bottle ${i + 1} is poured in: what that ingredient really is, said to them ('you'), specific and smiling — the moment behind the label. Under 65 characters, lowercase-casual is fine.`,
        example: "the one at 2 a.m. when you snort",
      },
    ]),
    {
      path: "extras.potionSpell",
      label: "The potion's spell",
      kind: "text",
      max: 90,
      guide:
        "What the finished potion's spell does, revealed on a scroll: a small real plan, promise or dare for the two of them, from the story ('Whoever drinks this has to watch our favourite scary movie with me on Friday'). One sentence, under 85 characters." +
        VW_TONE,
    },
    {
      path: "extras.question",
      label: "The big question",
      kind: "text",
      max: 60,
      guide:
        "The question they answer while the No button ghosts them. It must match the 'Who it's for' field you chose: romantic → a 'Will you be my boo?' question; friends → a 'Will you be my boo-st friend forever?' question; family → a 'Will you be my favourite little pumpkin?' question; kids → a 'Ready for a spooky-sweet adventure?' question. The adventure wording is ONLY for a child — never for a friend or a partner. You may work in one detail from the story. Under 55 characters, ends with a question mark and at most one emoji.",
      example: "Will you be my boo? 👻",
    },
    {
      path: "extras.yesLine",
      label: "After they say YES",
      kind: "text",
      max: 80,
      guide:
        "What appears the moment they say yes, as the moon turns into a heart: first person, joyful, one short sentence with a playful Halloween callback to the story. Under 75 characters." + VW_TONE,
      example: "Booked. Booed. Yours. Every Halloween from now on.",
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
