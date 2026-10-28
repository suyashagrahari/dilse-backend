import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * sikh-wedding-invitation — Anand Karaj Wedding Invitation, a wedding design on Royal's limits
 * (the Golden Temple at dawn, marigold garlands and phulkari borders on ivory paper).
 * Same core as floral-wedding-invitation's schema (contacts included), with
 * the second language in Punjabi (Gurmukhi) instead of Hindi.
 * Paths resolve against `ValentineDayData` (client
 * app/(templates)/_valentine/types.ts); extras keys are defined in
 * config/weddingDays/sikh-wedding-invitation.ts.
 *
 * The engine's fields mean: recipientName = the BRIDE, senderName = the GROOM,
 * letter = the English invitation, extras.localMessage = the Punjabi one,
 * endLine = the closing line.
 *
 * The editor opens on a demo wedding with five functions (rows 0–4) and four
 * story chapters, so those indices always exist. The client drops demo rows
 * the model left untouched, so a short description gives a short page.
 *
 * Budget (field cap 40, all used): 2 names, the invitation in English and
 * Punjabi, both families, the grandparents' line, five functions × (name,
 * date, time, venue, dress code), two story chapters × (title, line), the
 * closing line and one contact person (name, relation, phone). Not declared:
 * theme / music / photos (visual choices), the Gurbani verse and its reference
 * (scripture the model must never paraphrase or invent; empty = the template's
 * own line on the Laavan), map links, the live-stream link and the UPI id
 * (URLs and payment ids the model must never invent), dress colours (the
 * client derives a swatch from the dress-code words), good-to-know notes, RSVP
 * settings.
 */

const TONE =
  " Write in the register the description asks for (formal, warm, modern); without a cue, warm and devout, in the voice of a Sikh family inviting its sangat. Never cheesy, no exclamation-mark spam, no emoji. Write in English unless the description is written in Punjabi; never mix scripts inside one field.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `extras.events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by its usual Sikh / Punjabi name: 'Roka & Kurmai', 'Sukhmani Sahib Path', 'Akhand Path', Maiyan, Mehndi, Jaggo, 'Chooda & Kalire', 'Anand Karaj', Doli, Reception… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just 'Anand Karaj' (the four Laavan around Sri Guru Granth Sahib at the Gurdwara) in this row. The ceremony itself is always called 'Anand Karaj'. Under 30 characters."
        : `Function ${i + 1} in date order, by its usual Sikh / Punjabi name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `extras.events[${i}].date`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD. When the description gives only the day ('Maiyan on the 10th') take the month and year from the wedding date it states. Null when the row is empty or the date is unknown.`,
  },
  {
    path: `extras.events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('09:30' for 9:30 am, '19:30' for 7:30 pm). The Anand Karaj is a morning ceremony, but use only a time the description states; otherwise null.`,
    example: "09:30",
  },
  {
    path: `extras.events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city from the description ('Gurdwara Bangla Sahib, New Delhi'; 'Bride's home, Ludhiana'). When a function has no venue of its own, repeat the venue the description gives for the neighbouring functions. Null when the description names no place at all.`,
  },
  {
    path: `extras.events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line for function ${i + 1}, guests read it under the function: the description's own when it gives one, else the custom for that function (Maiyan 'Shades of yellow', Mehndi 'Greens and bright florals', Jaggo 'Bright Punjabi colours', Anand Karaj 'Traditional, heads covered' — heads are covered in the Gurdwara, Reception 'Black tie' / 'Cocktail chic'). Mention a colour when it is customary — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Traditional, heads covered",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `extras.story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting"][i]}), as a short evocative title ('Two strangers at a book fair', 'Chai with both families'). Only from a moment the description tells; a function of the wedding itself (Roka, Kurmai) is NOT a story chapter. With no such moment, return null. No emoji. Under 40 characters.`,
  },
  {
    path: `extras.story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      `One or two sentences for chapter ${i + 1}, told about the couple in the third person ('They met…', 'He asked…'), with one specific detail from the description (the place, the year). Never invent events, places or years, and never restate a function's date. Null when the title is null. Under 200 characters.` + TONE,
  },
]);

const contactFields: AiFillField[] = [
  {
    path: "extras.contacts[0].name",
    label: "Contact person — name",
    kind: "text",
    max: 40,
    guide: "The person guests should call with questions, by the name the description gives (a brother, a chacha, a planner). Only someone the description names together with a phone number; otherwise null.",
  },
  {
    path: "extras.contacts[0].relation",
    label: "Contact person — relation",
    kind: "text",
    max: 40,
    guide: "Who that person is to the couple, in a few words, from the description ('Bride's brother', 'Groom's chacha', 'Wedding planner'). Null when the contact name is null or the description does not say.",
  },
  {
    path: "extras.contacts[0].phone",
    label: "Contact person — phone",
    kind: "text",
    max: 20,
    guide: "That person's phone number exactly as the description writes it, digits and an optional leading +. Null unless the description states a number for them.",
  },
];

export const sikhWeddingInvitation: AiFillTemplateSchema = {
  slug: "sikh-wedding-invitation",
  audience: "friend",
  premise:
    "You are writing a Sikh couple's Anand Karaj wedding invitation website (Anand Karaj Wedding Invitation), the kind of page a family sends to every guest on WhatsApp. Its look: the Golden Temple at dawn, marigold garlands and phulkari borders on ivory paper, with Ik Onkar at the top of the card. It shows the couple's names, the invitation in English and in Punjabi (Gurmukhi script) side by side, both families, a countdown, the couple's story in chapters, every function of the wedding (Roka & Kurmai, Sukhmani Sahib or Akhand Path, Maiyan, Mehndi, Jaggo, Chooda & Kalire, the Anand Karaj itself — the four Laavan around Sri Guru Granth Sahib at the Gurdwara, in the morning, with the Milni first and Langar after — then the Doli and the Reception), each with its date, time, venue, map and dress code, a photo gallery, practical notes for guests, an RSVP and a blessings wall. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests, with the blessings of Waheguru. Use Sikh and Punjabi words for everything on this page; never import customs or words from another faith's wedding." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name as the description spells it (for two grooms or two brides, the first-named partner). Just the first name, without Kaur or a surname, no title, in the same script the description writes it in (a name typed in Latin letters stays in Latin letters).",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name as the description spells it (for two grooms or two brides, the second-named partner). Just the first name, without Singh or a surname, in the same script the description writes it in.",
    },
    {
      path: "letter",
      label: "The invitation (English)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 50–110 words. Paragraph 1 invites the guest, naming both partners and, when the description names them, the families ('With the blessings of Waheguru and our elders, the families of … joyfully invite you to the Anand Karaj of …'). Paragraph 2 says in one or two warm lines what the celebration will be (the Laavan at the Gurdwara, the Langar, the functions) and that the guest's presence and ardaas matter. Never write a date, a day, a time or a venue address in it (the page shows every function's details right below); naming the city or the Gurdwara is fine. No greeting line, no signature. Plain text only: paragraphs separated by one blank line, never HTML tags." +
        TONE,
    },
    {
      path: "extras.localMessage",
      label: "The invitation (Punjabi)",
      kind: "longtext",
      max: 700,
      guide:
        "The same invitation in Punjabi, in Gurmukhi script (never romanised, never any other script), 1–2 short sentences in the traditional style: 'ਵਾਹਿਗੁਰੂ ਜੀ ਦੀ ਅਪਾਰ ਕਿਰਪਾ ਅਤੇ ਵੱਡਿਆਂ ਦੇ ਅਸ਼ੀਰਵਾਦ ਨਾਲ, <bride> ਅਤੇ <groom> ਦੇ ਅਨੰਦ ਕਾਰਜ ਦੇ ਪਾਵਨ ਮੌਕੇ ਤੇ ਆਪ ਜੀ ਨੂੰ ਪਰਿਵਾਰ ਸਮੇਤ ਹਾਰਦਿਕ ਸੱਦਾ ਹੈ।' Write the couple's names in Gurmukhi here. Under 300 characters.",
    },
    {
      path: "extras.brideFamily",
      label: "Bride's family",
      kind: "text",
      max: 120,
      guide: "The bride's parents as a Sikh invitation prints them: 'S. Harjit Singh & Sardarni Manpreet Kaur Gill'. Only names the description gives; with only a family name, 'The Gill family'. Null when it names neither.",
    },
    {
      path: "extras.groomFamily",
      label: "Groom's family",
      kind: "text",
      max: 120,
      guide: "The groom's parents as a Sikh invitation prints them: 'S. Kulwant Singh & Sardarni Jasbir Kaur Sandhu'. Only names the description gives; with only a family name, 'The Sandhu family'. Null when it names neither.",
    },
    {
      path: "extras.blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "Grandparents or elders whose blessings the invitation carries, exactly as named in the description, with Sikh honorifics ('Sardarni Gurdev Kaur & Late S. Bachittar Singh Gill'). Null unless the description names them.",
    },
    ...functionFields,
    ...storyFields,
    ...contactFields,
    {
      path: "endLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line at the very end of the page, signed by the two families by their FAMILY NAMES (Gill, Sandhu, Ahluwalia — not Singh or Kaur), taken from the parents' names in the description: 'Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh — the Gill & Sandhu families'. When that runs past 80 characters, 'With love and gratitude, the Gill & Sandhu families'. With no family names given, 'With love and gratitude, both our families'. Under 80 characters, no emoji.",
    },
  ],
};
