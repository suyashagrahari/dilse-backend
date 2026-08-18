import type { AiFillTemplateSchema } from "./types";

/**
 * Kundli Milan — AI form-fill schema.
 *
 * `mf` is `KundliData` (client `app/(templates)/kundli-milan/components/types.ts`).
 *
 * The report itself is COMPUTED, deterministically, from the two birth dates:
 * the 36-guna score, the eight koota results, the animals, the charts and the
 * conclusion are all produced by `computeKundliReport()` and are always warm —
 * the total floors at 28/36 and Mangal Dosha always resolves to "mutually
 * cancelled". The model writes none of that. It writes the one-liner printed
 * under each koota row, the remedies, and the astrologer's invented name.
 *
 * Deliberately NOT declared, and why:
 *  - `groom.dob` / `bride.dob` / `groom.tob` / `bride.tob` — these are the seed
 *    for the entire report. A model-invented birth date would silently rewrite
 *    every number on the page, and they are also the two things the sender is
 *    guaranteed to know.
 *  - `groom.name` / `bride.name` — names the sender types in the composer.
 *  - Everything on `KundliReport` — derived, never stored on `mf`.
 */
export const kundliMilan: AiFillTemplateSchema = {
  slug: "kundli-milan",
  premise:
    "The sender has run a mock Vedic horoscope-matching report (Kundli Milan) on the two of them: a printed astrologer's sheet with the eight kootas scored out of 36 gunas, two birth charts, a stamp and a list of remedies. The vocabulary is entirely real and the comedy comes from an astrologer solemnly reporting on which of them can pick a restaurant — the score is generated high and the verdict always favourable, so nothing you write may read as a real reading, a warning, or a judgement on either person.",
  audience: "partner",
  fields: [
    // ── The eight koota one-liners ───────────────────────────────────────────
    {
      path: "customReadings.varna",
      label: "Varna reading",
      kind: "text",
      max: 110,
      guide:
        "One line printed under the Varna row, which officially governs spiritual compatibility and is worth 1 guna. Write it as a deadpan astrologer's observation that turns out to be about something ordinary and domestic in their life — the register is 'the stars have looked into your grocery habits'. Under 110 characters, one sentence or two very short ones. It always lands warm: never write that the two of them are mismatched, incompatible, or that anything is a problem. Every row on this report passes.",
      example: "Spiritually aligned. Neither of you has been inside a temple in two years, together.",
    },
    {
      path: "customReadings.vashya",
      label: "Vashya reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Vashya row, which governs mutual influence — who has the upper hand. The answer is always 'neither of them, adorably'. Aim it at some small standoff from their story: who picks the restaurant, who gives in first, who drives. Under 110 characters, deadpan, and balanced — do not decide that one of them is in charge.",
    },
    {
      path: "customReadings.tara",
      label: "Tara reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Tara row, which governs health and wellbeing. Point it at sleep, food and the 2 AM habit they share — the things that are funny about being tired, not the things that are worrying. Under 110 characters. Never make any claim about either person's actual health, body, or future, and never imply the stars have found something wrong.",
    },
    {
      path: "customReadings.yoni",
      label: "Yoni reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Yoni row, which is the funniest row on the sheet: the engine pairs each of them with an animal (Horse, Monkey, Cow, Serpent, Mongoose…) and they will not match. Write one line about two different creatures sharing one sofa and being entirely fine about it. Under 110 characters. Keep it completely clean — treat this row as being about temperament, never about sex — and do not name specific animals, because you do not know which two the engine drew.",
      example: "You are not the same species. It shows. The Court of Stars permits it anyway.",
    },
    {
      path: "customReadings.grahaMaitri",
      label: "Graha Maitri reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Graha Maitri row, which governs mental compatibility and carries 5 gunas. The joke to reach for is that being perfectly in sync mostly means being wrong at the same time. Under 110 characters, dry rather than sweet.",
    },
    {
      path: "customReadings.gana",
      label: "Gana reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Gana row, which governs temperament — the calm one and the loud one. The safest and funniest version is that one of them is calm and the report declines to say which. Under 110 characters. Do not label either of them as the difficult one; the whole point is that the astrologer refuses to take sides.",
    },
    {
      path: "customReadings.bhakoot",
      label: "Bhakoot reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Bhakoot row, which governs family welfare and carries 7 gunas. Aim it at weddings in general — guest lists, venues, relatives with opinions, the aunt who has already booked a hall. Under 110 characters. Never say anything sharp about either family or about any real relative; the target is the institution, not anyone's mother.",
    },
    {
      path: "customReadings.nadi",
      label: "Nadi reading",
      kind: "text",
      max: 110,
      guide:
        "The line under the Nadi row, the heaviest koota at 8 gunas. Two good options: a line about it doing all the work while the smaller kootas coast, or a hypothetical about what a household of theirs would inherit — the good hair and the bad jokes. Under 110 characters. Keep any mention of children hypothetical and light, and never imply that either of them should have any.",
    },

    // ── The upaya list ───────────────────────────────────────────────────────
    {
      path: "remedies",
      label: "Remedies / upaya",
      kind: "list",
      max: 4,
      itemMax: 110,
      required: true,
      guide:
        "The upaya list at the foot of the report: two to four mock remedies, and half the joke of the page. Write each as a solemn instruction a pandit would hand down, in the third-person imperative — 'He shall bring chai without being asked. Sundays.' — but about something tiny and domestic taken from their story. Under 110 characters each. Every one must be something a person could actually do tomorrow and would smile at. Nothing that reads as a demand, a rule, a punishment, or a complaint dressed as a remedy; if it would sting to be handed this on paper, it is the wrong line.",
    },

    // ── The signature line ───────────────────────────────────────────────────
    {
      path: "astrologerName",
      label: "Astrologer",
      kind: "text",
      max: 60,
      guide:
        "The name signed at the foot of the report as the astrologer who prepared it. Invent one — an absurdly over-titled pandit with too many surnames and an honorific or two is exactly the register, and it should sound plausible enough to be printed on a real letterhead. Under 60 characters. Never use the name of a real, living astrologer or public figure, and never use either of the couple's own names.",
      example: "Pt. Chandrakant Vyas-Sharma, Jyotish Ratna",
    },

    // ── Header particulars ───────────────────────────────────────────────────
    {
      path: "issuedOn",
      label: "Report dated",
      kind: "date",
      guide:
        "The date printed in the report header, as YYYY-MM-DD. Use a date that already means something to the two of them if the story names one — an anniversary, the day they met, the day one of them finally asked. Leave it empty if no date appears in the story; the header has its own fallback and a guessed date is just wrong.",
    },
    {
      path: "groom.pob",
      label: "First person — place of birth",
      kind: "text",
      max: 60,
      guide:
        "Place of birth printed in the first person's chart particulars, in the form 'City, State'. It is decorative — it does not touch the score. Fill it only when the sender's story actually says where he is from; a hometown invented for a document with his name on it is a small lie printed in serif type. Under 60 characters, otherwise leave it empty.",
    },
    {
      path: "bride.pob",
      label: "Second person — place of birth",
      kind: "text",
      max: 60,
      guide:
        "Place of birth printed in the second person's chart particulars, same form and same rule: 'City, State', under 60 characters, and only when the story states it. If the story makes a point of the two of them being from different places, this is a nice quiet place for that to show up.",
    },
  ],
};
