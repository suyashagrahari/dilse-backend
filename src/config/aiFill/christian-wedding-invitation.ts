import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * christian-wedding-invitation — Holy Matrimony Wedding Invitation, a wedding design on Royal's limits
 * (a lily chapel in sage and ivory, white lilies, doves and stained-glass light).
 * Same core as floral-wedding-invitation's schema (contacts included), in
 * English only: there is no second-language invitation.
 * Paths resolve against `ValentineDayData` (client
 * app/(templates)/_valentine/types.ts); extras keys are defined in
 * config/weddingDays/christian-wedding-invitation.ts.
 *
 * The engine's fields mean: recipientName = the BRIDE, senderName = the GROOM,
 * letter = the invitation, endLine = the closing line.
 *
 * The editor opens on a demo wedding with five functions (rows 0–4) and four
 * story chapters, so those indices always exist. The client drops demo rows
 * the model left untouched, so a short description gives a short page.
 *
 * Budget (field cap 40; 39 used, floral's second-language slot has no
 * counterpart here): 2 names, the English invitation, both families, the
 * grandparents' line, five functions × (name, date, time, venue, dress code),
 * two story chapters × (title, line), the closing line and one contact person
 * (name, relation, phone). Not declared: theme / music / photos (visual
 * choices), the Bible verse and its reference (scripture the model must never
 * paraphrase or invent; empty = the template's own verse), map links, the
 * live-stream link and the UPI id (URLs and payment ids the model must never
 * invent), dress colours (the client derives a swatch from the dress-code
 * words), good-to-know notes, RSVP settings.
 */

const TONE =
  " Write in the register the description asks for (formal, warm, modern); without a cue, warm and gracious, in the voice of a Christian family inviting its guests. Never cheesy, no exclamation-mark spam, no emoji. Always write in English, whatever language the description is written in.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `extras.events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by its usual name: 'Ring Ceremony' (or Engagement), Roce, 'Bridal Shower', 'Rehearsal Dinner', 'Holy Matrimony', Reception… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just 'Holy Matrimony' in this row. The church ceremony is called 'Holy Matrimony' (or 'Nuptial Mass' when the description says Mass). Under 30 characters."
        : `Function ${i + 1} in date order, by its usual name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `extras.events[${i}].date`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD. When the description gives only the day ('the Roce on the 10th') take the month and year from the wedding date it states. Null when the row is empty or the date is unknown.`,
  },
  {
    path: `extras.events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('16:00' for 4 pm, '19:30' for 7:30 pm). Only a time the description states; otherwise null.`,
    example: "16:00",
  },
  {
    path: `extras.events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city from the description ('St. Francis Xavier Church, Goa'; 'Bride's home, Mangaluru'). When a function has no venue of its own, repeat the venue the description gives for the neighbouring functions. Null when the description names no place at all.`,
  },
  {
    path: `extras.events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line for function ${i + 1}, guests read it under the function: the description's own when it gives one, else the custom for that function (Roce 'Old whites, it gets messy', Bridal Shower 'Pastel florals', Holy Matrimony 'Formal, pastels', Reception 'Black tie' / 'Cocktail chic'). Mention a colour when it is customary — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Formal, pastels",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `extras.story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting"][i]}), as a short evocative title ('Two strangers at a book fair', 'A ring by the sea'). Only from a moment the description tells; a function of the wedding itself (ring ceremony, Roce) is NOT a story chapter. With no such moment, return null. No emoji. Under 40 characters.`,
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
    guide: "The person guests should call with questions, by the name the description gives (a brother, an uncle, the best man, a planner). Only someone the description names together with a phone number; otherwise null.",
  },
  {
    path: "extras.contacts[0].relation",
    label: "Contact person — relation",
    kind: "text",
    max: 40,
    guide: "Who that person is to the couple, in a few words, from the description ('Bride's brother', 'Best man', 'Wedding planner'). Null when the contact name is null or the description does not say.",
  },
  {
    path: "extras.contacts[0].phone",
    label: "Contact person — phone",
    kind: "text",
    max: 20,
    guide: "That person's phone number exactly as the description writes it, digits and an optional leading +. Null unless the description states a number for them.",
  },
];

export const christianWeddingInvitation: AiFillTemplateSchema = {
  slug: "christian-wedding-invitation",
  audience: "friend",
  premise:
    "You are writing a Christian couple's church wedding invitation website (Holy Matrimony Wedding Invitation), the kind of page a family sends to every guest on WhatsApp. Its look: a lily chapel in sage and ivory, white lilies, doves and stained-glass light, with a cross and a line of scripture on the card. It shows the couple's names, the invitation in English, both families, a countdown, the couple's story in chapters, every function of the wedding (the Ring Ceremony, an optional Roce for a Mangalorean or Goan family, the Bridal Shower, the Rehearsal Dinner, the Holy Matrimony itself — the church ceremony or Nuptial Mass — and the Reception with dinner, toasts and the first dance), each with its date, time, venue, map and dress code, a photo gallery, practical notes for guests, an RSVP and a blessings wall. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests, by the grace of God. The whole page is in English. Use Christian words for everything on this page; never import customs or words from another faith's wedding." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name as the description spells it (for two grooms or two brides, the first-named partner). Just the first name, no surname, no title, in Latin letters.",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name as the description spells it (for two grooms or two brides, the second-named partner). Just the first name, in Latin letters.",
    },
    {
      path: "letter",
      label: "The invitation",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 50–110 words. Paragraph 1 invites the guest, naming both partners and, when the description names them, the families ('By the grace of God, Mr. & Mrs. … request the honour of your presence at the Holy Matrimony of their daughter … with …'). Paragraph 2 says in one or two warm lines what the celebration will be (the church, the reception) and that the guest's presence and prayers matter. Never write a date, a day, a time or a venue address in it (the page shows every function's details right below); naming the city or the church is fine. No greeting line, no signature. Plain text only: paragraphs separated by one blank line, never HTML tags." +
        TONE,
    },
    {
      path: "extras.brideFamily",
      label: "Bride's family",
      kind: "text",
      max: 120,
      guide: "The bride's parents as an invitation prints them: 'Mr. Anthony & Mrs. Maria D'Souza'. Only names the description gives; with only a surname, 'The D'Souza family'. Null when it names neither.",
    },
    {
      path: "extras.groomFamily",
      label: "Groom's family",
      kind: "text",
      max: 120,
      guide: "The groom's parents as an invitation prints them: 'Mr. Joseph & Mrs. Elizabeth Fernandes'. Only names the description gives; with only a surname, 'The Fernandes family'. Null when it names neither.",
    },
    {
      path: "extras.blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "Grandparents or elders whose blessings the invitation carries, exactly as named in the description ('Mrs. Agnes Pereira & the late Mr. Francis Pereira'). Null unless the description names them.",
    },
    ...functionFields,
    ...storyFields,
    ...contactFields,
    {
      path: "endLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line at the very end of the page, signed by the two families by their SURNAMES, taken from the parents' names in the description (parents Maria and Anthony D'Souza + Elizabeth and Joseph Fernandes → 'With love and gratitude, the D'Souza & Fernandes families'). Under 80 characters, no emoji.",
    },
  ],
};
