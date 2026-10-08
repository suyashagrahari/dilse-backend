import type { AiFillTemplateSchema } from "./types";
import { VW_FORBIDDEN, VW_LANGUAGE, VW_TONE, valentineCommon } from "./valentineShared";

/** Short English stories full of Indian names were coming back in Hinglish about half the time. */
const LANGUAGE_BY_WORDS = " Judge the language by the sender's own sentences, not by the names in them: 'Her name is Neha. I love her.' is an English story.";

/**
 * happy-teddy-day-premium — "Made With a Heart", the ULTRA-PREMIUM twin of
 * happy-teddy-day (Valentine's week, 10 Feb). Owned by that template's builder.
 *
 * The page: a parcel holds an unfinished teddy. In a toy workshop the recipient
 * stuffs it, holds the sender's little fabric heart (hands, cheek, then ear —
 * where it whispers a line), kisses it, sews it in, and the teddy wakes up and
 * says its first words. Lights out: they read the letter by torchlight in a
 * blanket fort, see photos as moons from a star lamp, play hide-and-seek (the
 * teddy says a line each time it is found), then tuck it in and it whispers
 * goodnight.
 *
 * Paths resolve against `ValentineDayData` (client/app/(templates)/_valentine/types.ts);
 * extras keys are in server/src/config/premiumDays/happy-teddy-day-premium.ts.
 * Not declared: furColor, eyeStyle, accessory, sleepOver (visual choices),
 * pawInitial (the sender's own initial) and every media / timing / switch
 * premium field.
 */
export const teddyDayPremium: AiFillTemplateSchema = {
  slug: "happy-teddy-day-premium",
  audience: "partner",
  premise:
    "A cinematic Teddy Day page. The recipient receives a parcel with an unfinished teddy bear. In a cosy toy workshop they stuff it, hold the sender's little fabric heart in their hands, to their cheek and to their ear (where it whispers one line from the sender), kiss it, sew it inside the teddy, and the teddy wakes up and speaks. Then it is bedtime: they read the sender's letter by torchlight in a blanket fort, see photos as moons projected on the ceiling, play hide-and-seek with the teddy (it says a little line every time it is found), and tuck it in while it whispers goodnight. The teddy is a stand-in for the sender: a piece of them that stays. Soft, cosy, playful, tender." + VW_LANGUAGE + LANGUAGE_BY_WORDS,
  fields: [
    ...valentineCommon({
      dayName: "Teddy Day",
      letterWhere: "They read it by torchlight under a blanket fort, late at night, with the teddy holding the torch — so it can be a little more hushed and intimate than daytime talk.",
      letterMax: 3000,
      signaturePrinted: "The page prints the sender's name under it.",
      endLineWhere: "after the teddy is tucked in, on the last screen.",
      photosWhere: "each photo glows like a small moon projected onto the bedroom ceiling by a star lamp.",
      notes: false,
    }),
    {
      path: "extras.teddyName",
      label: "Teddy's name",
      kind: "text",
      max: 20,
      guide: "A name for the teddy: an inside joke, a food they both love, a nickname from the story turned into a cute toy name. One or two words, under 16 characters, never the recipient's or the sender's own name.",
      example: "Momo",
    },
    {
      path: "extras.parcelNote",
      label: "Tag on the unfinished teddy",
      kind: "text",
      max: 80,
      guide: "The tag pinned to the teddy before it is stuffed and has no heart yet: a sweet line from the sender saying it isn't finished and needs them to finish it. One sentence, under 75 characters." + VW_TONE,
      example: "Half done, like me before you. Finish him?",
    },
    {
      path: "extras.heartWhisper",
      label: "What the heart whispers",
      kind: "text",
      max: 90,
      required: true,
      guide: "The softest line on the page: what the sender's little fabric heart whispers when the recipient holds it to their ear, before it is sewn inside the teddy. First person from the sender to them, quiet and sincere, something about being with them when apart. Under 85 characters." + VW_TONE,
      example: "Every time you squeeze him, that's me squeezing back.",
    },
    {
      path: "extras.firstWords",
      label: "Teddy's first words",
      kind: "text",
      max: 50,
      guide: "The first thing the teddy says when it wakes up in their hands, in a speech bubble: the teddy speaking (first person as the teddy), cheerful, naming who sent it (the sender's first name). Under 45 characters." + VW_TONE,
    },
    {
      path: "extras.squeezeLines",
      label: "What the teddy says",
      kind: "list",
      max: 5,
      itemMax: 70,
      guide: "Exactly 5 short lines the teddy says (as the teddy, first person) each time they find it in hide-and-seek or squish it at bedtime. A mix of cheeky and sweet: reminders in the sender's spirit, little teases from the story, promises to guard their sleep. Each mentions a different detail; under 65 characters each." + VW_TONE,
      example: "Found me! Now go find the one who sent me.",
    },
    {
      path: "extras.bedtimeLine",
      label: "The goodnight whisper",
      kind: "text",
      max: 70,
      guide: "What the teddy whispers as it is tucked in: goodnight to them by name, and that the sender is close (just a dream away, right here in this teddy). Under 65 characters." + VW_TONE,
    },
    {
      path: "premium.voiceCaption",
      label: "Caption under your voice note",
      kind: "text",
      max: 90,
      guide: "A one-line note from the sender shown with their voice message, which plays when the recipient presses the teddy's paw (or, without a recording, as a little note sewn into the paw). First person, addressed to them, one small detail from the story. Under 85 characters, no hashtags." + VW_TONE,
      example: "Headphones on. Yes, that's me laughing at the end.",
    },
    {
      path: "premium.psLetter",
      label: "The sealed P.S.",
      kind: "longtext",
      max: 600,
      guide: "A sealed P.S. pinned under the teddy's pillow at the very end. Begin with an 'open only if…' condition as its own first line, specific to these two (open only on a night you can't sleep / open only if you miss me), then a blank line, then two to four short sentences to them in first person — quieter than the letter, built on one specific detail from the story the letter did not use; when the story has no detail left, make it a small promise or a feeling instead, never an invented memory. No salutation, no sign-off, no sender's name. Under 550 characters." + VW_TONE,
      example: "Open only on a night you can't sleep.\n\nSqueeze him twice. The second one is from me.",
    },
  ],
  forbiddenOutput: VW_FORBIDDEN,
};
