import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time (v2, tested). */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names or places in them: 'Her name is Neha. I love her. We met in Pune.' is an English story.";

/** Thin stories: v2's live runs invented trips and habits; every field that could do it carries this. */
const TRUE_ONLY =
  " Use only what the story says: when the story is short, write about who they are, what they love and the sender missing them right now, never a past trip, date or 'first time' the story does not mention.";

/**
 * happy-teddy-day-premium — "The Teddy House", the ULTRA-PREMIUM twin of happy-teddy-day (Valentine's week,
 * 10 Feb). Owned by that template's builder.
 *
 * The page: a bright honey-and-pink dollhouse her teddy moves into, one room per scene. A delivery box on the
 * doorstep (its label line), a sleepy teddy who wakes when she tucks a heart into his chest (his first words; she
 * names him, the sender's pick first), a wardrobe whose pieces each pop the sender's note, a sofa where every
 * squeeze makes him say the next paragraph of the letter in a speech bubble, his photo album (captions + notes),
 * a kitchen where catching treats unlocks his house rules on the fridge, a toy phone ringing with the sender's
 * voice, bedtime with a note under his pillow (the P.S.), then "Will you keep him forever?" on the song's drop, and
 * an Adoption Certificate (born in, temperament) she saves.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts); extras keys are in
 * ../premiumDays/happy-teddy-day-premium.ts. The demo seeds 4 photos, 3 outfit pieces and 5 house rules, so those
 * indices always exist while the sender builds. Not declared: every media / timing / switch premium field.
 */
export const teddyDayPremium: AiFillTemplateSchema = {
  slug: "happy-teddy-day-premium",
  audience: "partner",
  premise:
    "A premium Teddy Day page, 'The Teddy House': a bright, cute dollhouse where a teddy bear the sender is giving them moves in, one cosy room at a time. A delivery box arrives on the doorstep with a handwritten label; a sleepy teddy pops out and wakes up when the recipient tucks a little heart into his chest, then says his first words and gets his name; they dress him up, and each accessory carries a note from the sender; every time they squeeze him he says the next bit of the sender's letter in a speech bubble; he shows them the couple's photos in his album; they feed him treats to unlock his house rules on the fridge; his toy phone rings with the sender's voice; they tuck him into bed and find a note under his pillow; the next morning he asks 'Will you keep him forever?' as their song drops; and they get an Adoption Certificate to save. The teddy is a soft stand-in for the sender: a hug they can keep. Do not assume the couple lives apart unless the story says so. Cute, playful and tender, never cringe." +
    VW_LANGUAGE +
    LANGUAGE_BY_WORDS +
    TRUE_ONLY,
  fields: [
    ...valentineCommon({
      dayName: "Teddy Day",
      letterWhere:
        "The teddy says it out loud, one paragraph per squeeze, each in its own speech bubble, so every paragraph must stand on its own and stay short (one to three sentences, under 190 characters). It is still the sender speaking in first person; it can mention the teddy (by his name) as the little piece of the sender they get to keep. Only recall a moment the story actually tells; when the story tells none, tease them about what it does say and talk about now instead of remembering anything.",
      letterMax: 3000,
      greetingPrinted: "The page already prints a 'Dear <their name>,' salutation above it.",
      signaturePrinted: "The page prints the sign-off field under it.",
      endLineWhere: "printed big above the Adoption Certificate they save at the end.",
      photosWhere:
        "the teddy holds the photos up one by one in his photo album, each as a taped polaroid with the caption handwritten under it; keep it a short label for the moment (a place, an occasion), not a sentence.",
      captionMax: 30,
      photoCount: 4,
      notes: true,
    }),
    {
      path: "extras.teddyName",
      label: "Teddy's name",
      kind: "text",
      max: 20,
      guide:
        "A name for the teddy: an inside joke, a food they both love, or a nickname from the story turned into a cute toy name. One or two words, under 16 characters, never the recipient's or the sender's own name, and never a pet's real name from the story.",
      example: "Momo",
    },
    {
      path: "extras.parcelNote",
      label: "On the delivery box",
      kind: "text",
      max: 60,
      guide:
        "The one line handwritten on the delivery box's label, under a printed line that already says what is inside and who it is for, so this line only says how to handle it or what it really contains (a hug, a stand-in for the sender, something to hold at night), like a playful shipping instruction from the sender. One sentence, under 50 characters, ends with a full stop." +
        VW_TONE,
    },
    {
      path: "extras.firstWords",
      label: "His first words",
      kind: "text",
      max: 50,
      guide:
        "The first thing the teddy says in a speech bubble, the moment he wakes up with his new heart: the teddy speaking in first person, cheerful, greeting the recipient by name (or pet name) and saying who sent him (the sender's first name). One short sentence or two tiny ones, under 40 characters in all." +
        VW_TONE,
    },
    ...[0, 1, 2].flatMap((i) => [
      {
        path: `extras.outfit[${i}].item`,
        label: `Accessory ${i + 1}`,
        kind: "enum" as const,
        options: ["bow", "sweater", "crown", "glasses", "scarf", "flower", "cap", "bowtie"],
        guide:
          "An accessory the recipient puts on the teddy: bow, sweater (a heart sweater), crown, glasses (heart-shaped glasses), scarf, flower, cap or bowtie. Pick the one that fits the note you write for it; three different accessories.",
      },
      {
        path: `extras.outfit[${i}].note`,
        label: `Note with accessory ${i + 1}`,
        kind: "text" as const,
        max: 60,
        guide:
          "The note that pops up when they put that accessory on the teddy: a sweet or teasing compliment to the recipient that plays on the accessory, starting with 'Because you…' (a crown → 'Because you rule my heart (and the remote).'). Built on one thing the story says about them. One sentence, under 55 characters, ends with a full stop. Three notes, three different details." +
          VW_TONE,
      },
    ]),
    {
      path: "extras.careLines",
      label: "House rules",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide:
        "Exactly 5 house rules for the teddy, stuck on the fridge with magnets: love notes from the sender disguised as rules in the imperative ('Hug daily. Twice on Mondays.', 'Responds to forehead kisses.', 'Not to be left alone on …'). Each uses a different real detail or habit from the story (a pet name, a ritual, a fear, a food, missing each other); when the story is thin, keep them about hugs, sleep and missing each other rather than inventing facts. All five in the same language as the story. Under 60 characters each, each ends with a full stop." +
        VW_TONE,
    },
    {
      path: "extras.birthPlace",
      label: "Place of birth",
      kind: "text",
      max: 40,
      guide:
        "A field on the Adoption Certificate, 'Born in': a cute, specific place from the story where the teddy was 'born', as if it were official (the sender's hoodie pocket in their city, the café where they met). A short noun phrase, no full stop, under 36 characters. Use only places or things the story mentions; with none, write a hoodie pocket, adding whose it is only when the story gives the sender's first name. Same language as the story.",
    },
    {
      path: "extras.temperament",
      label: "Temperament",
      kind: "text",
      max: 40,
      guide:
        "A field on the Adoption Certificate, 'Temperament': two very short deadpan phrases describing the teddy's personality, each starting with a capital letter and ending with a full stop, which secretly describe how the sender loves them, drawn from the story. Same language as the story. Under 36 characters.",
      example: "Clingy. Extremely huggable.",
    },
    {
      path: "extras.signOff",
      label: "Sign-off",
      kind: "text",
      max: 40,
      guide:
        "How the sender signs the letter: a two-to-four-word sign-off phrase, a comma, then the sender's first name. Printed under the last speech bubble. Same language as the story; match the sender's gender in Hindi. Under 34 characters.",
      example: "Always yours, Aryan",
    },
    {
      path: "extras.question",
      label: "The question",
      kind: "text",
      max: 60,
      guide:
        "The big question on the last morning, from the sender, while the teddy holds up their photo. It asks them to keep the teddy forever, naming him (the teddy's name you chose, or 'him'), then adds a short wink in brackets that the sender comes with him: in English, 'Will you keep <teddy's name> forever? (Me too?)' style in your own words; a Hinglish story asks the same thing in Hinglish. Under 55 characters, ends with a question mark or a closing bracket after one, no emoji.",
      example: "Will you keep him forever? (Me too?)",
    },
    {
      path: "extras.yesLine",
      label: "After they say yes",
      kind: "text",
      max: 80,
      guide:
        "What appears after they say yes, while teddies pile into a heart around their photo: the sender's reply in first person, joyful, one short sentence with a playful callback to the story or the teddy. Under 70 characters." +
        VW_TONE,
    },
    // ── Premium-only text leaves (the `premium` sub-document) ───────────────
    // Never declared: premium.voiceNote (media), songDropAt, unlockAt, unlockTz, allowReply, voicePeaks.
    {
      path: "premium.voiceCaption",
      label: "On the toy phone",
      kind: "text",
      max: 90,
      guide:
        "The teddy's toy phone rings and it's the sender: this line captions the sender's recorded voice note or, if there is none, it IS what the sender says on the call. First person, addressed to them as if on the phone right now while they hold the teddy, one small detail from the story. Under 85 characters, same language as the story, no hashtags." +
        VW_TONE,
    },
    {
      path: "premium.psLetter",
      label: "The note under his pillow",
      kind: "longtext",
      max: 600,
      guide:
        "A little note they find under the teddy's pillow at bedtime, after they tuck him in. Begin with 'P.S. ', then two to four short sentences to them in first person, quieter and more intimate than the letter, about tonight or sleep or the teddy keeping them company, built on one detail the story states that the letter did not use; when no detail is left, make it a small promise for tonight, never an invented memory. No salutation, no sign-off, no sender's name. Under 420 characters." +
        VW_TONE,
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
