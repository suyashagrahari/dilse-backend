import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * reception — Reception Night, the light champagne-and-gold ballroom
 * invitation (standalone, /reception-pages). Paths resolve against the client's
 * `ReceptionData` (app/(templates)/reception/components/types.ts).
 *
 * The editor opens on a demo reception with three parts of the evening (rows
 * 0–2), two story chapters and one contact, so those indices always exist. The
 * client drops demo rows the model left untouched, mirrors brideName/groomName
 * into bride.name/groom.name and copies events[0] into the legacy
 * receptionDate / venue / venueAddress / venueTimings fields.
 *
 * Budget (field cap 40): 2 names, the tagline, the invitation in English and
 * Hindi, both families and the blessings line, two short portraits, three
 * parts of the evening × (name, date, time, venue, dress code), two story
 * chapters × (title, line), one contact (name, relation, phone), good to know
 * and the closing line. Never declared: good-to-know notes (stored as heading/text pairs; rarely in a description), photos, music, theme, map links,
 * livestream, film, UPI (the model would invent them; a UPI id is money),
 * dress colours (derived from the dress-code words), RSVP settings.
 */

const TONE =
  " Write in the register the description asks for (elegant, warm, glamorous, fun); without a cue, warm and a little glamorous, like a ballroom evening. Never cheesy, no exclamation-mark spam, no emoji.";

/** Everything but the Hindi invitation is Latin script: the page is English with its own Hindi field. */
const LATIN =
  " Write it in English in Latin letters; for a description written in Hinglish, plain English or light Hinglish in Latin letters is fine. Devanagari belongs only in the Hindi invitation field.";

const ROWS = 3;

const eveningFields: AiFillField[] = Array.from({ length: ROWS }, (_, i) => [
  {
    path: `events[${i}].title`,
    label: `Part ${i + 1} of the evening — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST part of the evening in time order, by its usual name: the reception itself ('Wedding Reception', 'Reception & Dinner', 'Walima') or, when something comes before it, that part ('Cocktails'). Rows run strictly in time order, one part per row, and the reception itself is one of them. When the description names no parts at all, write 'Wedding Reception'. Under 30 characters."
        : `Part ${i + 1} of the same celebration in time order, by its usual name ('Wedding Reception', 'Dinner', 'After-party', 'Bride & Groom Entry', 'Sangeet Night', 'Brunch'), only a part the description mentions. If it mentions fewer than ${i + 1} parts, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `events[${i}].date`,
    label: `Part ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of part ${i + 1} as YYYY-MM-DD. A part on the same night as the reception takes the reception's date. Only a date the description states (a weekday plus a day-of-month is enough when the month and year are given elsewhere). Null for an empty row or an unknown date.`,
  },
  {
    path: `events[${i}].time`,
    label: `Part ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of part ${i + 1} in 24-hour HH:mm ('19:30' for 7:30 pm, '21:00' for 9 pm). Only a time the description states; otherwise null.`,
    example: "19:30",
  },
  {
    path: `events[${i}].venue`,
    label: `Part ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where part ${i + 1} happens: the venue name and city as the description gives them ('The Grand Ballroom, ITC Maratha, Mumbai'; 'Rooftop lounge, The Lalit, Delhi'), in English words and Latin script even when the description is in Hindi or Hinglish. When a part has no venue of its own, repeat the reception's venue. Null when the description names no place at all.`,
  },
  {
    path: `events[${i}].dressCode`,
    label: `Part ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line guests read under part ${i + 1}: the description's own when it gives one, else what is customary for that part (a reception 'Black tie & evening gowns' or 'Indo-western glam', cocktails 'Cocktail chic', an after-party 'Dance-floor ready'). Mention a colour when the description names one; the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Black tie & evening gowns",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting, the wedding itself"][i]}), as a short evocative title ('A wrong turn in Jodhpur', 'Yes, under the fairy lights'). Only from a moment the description tells. With no such moment, return null. No emoji. Under 40 characters.` + LATIN,
  },
  {
    path: `story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      `One or two sentences for chapter ${i + 1}, told about the couple in the third person ('They met…', 'He asked…'), with one specific detail from the description (the place, the year). Never invent events, places or years. Null when the title is null. Under 200 characters.` + TONE + LATIN,
  },
]);

export const reception: AiFillTemplateSchema = {
  slug: "reception",
  audience: "friend",
  premise:
    "You are writing a couple's wedding RECEPTION invitation website (Reception Night), the page a family sends to every guest on WhatsApp after or around the wedding. Its look: white-and-gold ballroom doors swing open onto a champagne ballroom with a crystal chandelier and string lights. It shows the couple's names, a one-line tagline, the invitation in English and Hindi, both families, a short portrait of the bride and of the groom, a countdown, the couple's story in chapters, the parts of the evening (each with date, time, venue, map and dress code), a photo gallery, practical notes, a family member to call, an RSVP and a blessings wall, and closes with a short line from the families. The person describing it is the bride, the groom or a family member; the page speaks for both families to their guests. It may follow any tradition (Hindu, Sikh, Muslim walima, Christian, inter-faith, court marriage): follow the description's own words and customs." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "brideName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name in Latin letters as the description spells it (a name written in Devanagari is transliterated: मीरा → Meera). For two grooms or two brides, the first-named partner. Just the first name, no surname, no title.",
    },
    {
      path: "groomName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name in Latin letters as the description spells it (देव → Dev). For two grooms or two brides, the second-named partner. Just the first name.",
    },
    {
      path: "tagline",
      label: "Tagline",
      kind: "text",
      max: 80,
      guide: "One short line printed under the names in the hero, inviting the guest to the evening ('request the pleasure of your company at their reception', 'invite you to an evening of love, laughter and dancing'). Lower-case start, no names, no date, under 70 characters." + TONE + LATIN,
      example: "request the pleasure of your company",
    },
    {
      path: "invitation",
      label: "The invitation (English)",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs separated by a blank line (two newline characters), 45–100 words. Paragraph 1 invites the guest to celebrate the newly-weds, naming both partners and, when the description names them, the families ('Together with their families, Priya and Arjun invite you…'). Paragraph 2 says in one or two warm lines what the evening will be (dinner, music, dancing, the city or venue) and that the guest's presence matters. Leave every date, time and address out of it (the page shows them right below). No greeting line, no signature, plain text only. Write it in English, in Latin script, even when the description is in Hindi or Hinglish." +
        TONE,
    },
    {
      path: "hindiMessage",
      label: "The invitation (Hindi)",
      kind: "longtext",
      max: 600,
      guide:
        "The same invitation in Hindi, in Devanagari script (never romanised), 1–2 short sentences in the traditional style: '<bride> और <groom> के विवाह के उपलक्ष्य में आयोजित स्वागत समारोह में आप सपरिवार सादर आमंत्रित हैं। आपकी उपस्थिति हमारे लिए सौभाग्य होगी।' Always write this field: it needs only the two names. Write the names in Devanagari syllable by syllable as they are said; a name that ends in a long -a sound keeps the ा sign at its end (Priya → प्रिया, Ananya → अनन्या). Under 280 characters.",
    },
    {
      path: "families.bride",
      label: "Bride's family",
      kind: "text",
      max: 120,
      guide: "The bride's parents as an invitation prints them: 'Mrs. Sunita & Mr. Rajesh Sharma'. Only names the description gives; with only a surname, 'The Sharma family'. Null when it names neither.",
    },
    {
      path: "families.groom",
      label: "Groom's family",
      kind: "text",
      max: 120,
      guide: "The groom's parents as an invitation prints them: 'Mrs. Meena & Mr. Vikram Verma'. Only names the description gives; with only a surname, 'The Verma family'. Null when it names neither.",
    },
    {
      path: "blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "Grandparents or elders whose blessings the families invoke, as the description names them ('Smt. Kamla Devi & Late Shri Ram Prasad Sharma'). Null unless the description names such elders.",
    },
    {
      path: "bride.description",
      label: "About the bride",
      kind: "text",
      max: 200,
      guide: "One warm sentence about the bride for her portrait card, in the third person, from what the description says about her (her work, her city, what she loves). Never invent a profession, a degree or a city. When the description says nothing about her, one gentle line about her joy on this day. Under 160 characters." + TONE + LATIN,
    },
    {
      path: "groom.description",
      label: "About the groom",
      kind: "text",
      max: 200,
      guide: "One warm sentence about the groom for his portrait card, in the third person, from what the description says about him. Never invent a profession, a degree or a city. When the description says nothing about him, one gentle line about his joy on this day. Under 160 characters." + TONE + LATIN,
    },
    ...eveningFields,
    ...storyFields,
    {
      path: "contacts[0].name",
      label: "Contact person — name",
      kind: "text",
      max: 40,
      guide: "The person guests should call with questions, ONLY when the description names one together with a phone number ('call Rohit on 98290…'): first name and surname as given. Null otherwise.",
    },
    {
      path: "contacts[0].relation",
      label: "Contact person — relation",
      kind: "text",
      max: 40,
      guide: "How the contact person is related to the couple, in a few words, copied from the description ('Priya's brother', 'Event coordinator'). When the description gives only a name and a number, write 'Family contact'. Null when the name is null.",
    },
    {
      path: "contacts[0].phone",
      label: "Contact person — phone",
      kind: "text",
      max: 16,
      guide: "The contact person's phone number exactly as the description writes it, digits with an optional +91. Never invent, complete or reformat a number into a different one. Null when the description gives none.",
      example: "+91 98290 11223",
    },
    {
      path: "closingLine",
      label: "Closing line",
      kind: "text",
      max: 100,
      guide: "The short closing line at the very end of the page, signed by the two families by their SURNAMES taken from the parents' names in the description (parents Sunita and Rajesh Sharma + Meena and Vikram Verma → 'With love, the Sharma & Verma families'). Under 80 characters, no emoji, English and Latin script. When the description names no parents, sign it from the couple's first names ('With love, Priya & Arjun').",
    },
  ],
};
