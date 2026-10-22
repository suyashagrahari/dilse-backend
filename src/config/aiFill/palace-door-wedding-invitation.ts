import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * palace-door-wedding-invitation — Palace Door Wedding Invitation, a wedding design on Royal's limits
 * (carved Rajasthani doors swing open, a floral mandap with lanterns, an illustrated couple for every function).
 * Started as a copy of royal-wedding-invitation's schema (same extras).
 * Paths resolve against `ValentineDayData` (client
 * app/(templates)/_valentine/types.ts); extras keys are defined in
 * config/weddingDays/palace-door-wedding-invitation.ts.
 *
 * The engine's fields mean: recipientName = the BRIDE, senderName = the GROOM,
 * letter = the English invitation, endLine = the closing line.
 *
 * The editor opens on a demo wedding with five functions (rows 0–4) and four
 * story chapters, so those indices always exist. The client drops demo rows
 * the model left untouched, so a short description gives a short page.
 *
 * Budget (field cap 40): 2 names, the invitation in English and Hindi, both
 * families, the grandparents' line, five functions × (name, date, time,
 * venue, dress code), three story chapters × (title, line), good to know and
 * the closing line. Not declared: theme / music / photos (visual choices),
 * map links (the model would invent them), dress colours (the client derives a
 * swatch from the dress-code words), RSVP settings (the sender's decisions).
 */

const TONE =
  " Write in the register the description asks for (formal, warm, royal, modern); without a cue, warm and a little regal. Never cheesy, no exclamation-mark spam, no emoji. Write in English unless the description is written in Hindi or Hinglish; never mix scripts inside one field.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `extras.events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by its usual name: Roka, Tilak, Haldi, Mehendi, Sangeet, Baraat, 'Wedding (Pheras)', Nikah, Anand Karaj, Muhurtham, 'Church Wedding', 'Registry Wedding', Cocktail, Reception… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just the wedding ceremony itself in this row ('Wedding (Pheras)' for a Hindu North Indian wedding, 'Muhurtham' for a Tamil wedding, 'Wedding Ceremony' for a church wedding, 'Registry Wedding' for a court marriage). Under 30 characters."
        : `Function ${i + 1} in date order, by its usual name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `extras.events[${i}].date`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD. When the description gives only the day ('Haldi on the 10th') take the month and year from the wedding date it states. Null when the row is empty or the date is unknown.`,
  },
  {
    path: `extras.events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('19:30' for 7:30 pm, '07:00' for 7 am). Only a time the description states; otherwise null.`,
    example: "19:30",
  },
  {
    path: `extras.events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city from the description ('The Leela Palace, Udaipur'; 'Bride's home, Kanpur'). When a function has no venue of its own, repeat the venue the description gives for the neighbouring functions. Null when the description names no place at all.`,
  },
  {
    path: `extras.events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line for function ${i + 1}, guests read it under the function: the description's own when it gives one, else the custom for that function (Haldi 'Shades of yellow', Mehendi 'Greens and bright florals', Sangeet 'Indo-western glam', Hindu wedding 'Traditional festive', church wedding 'Formal, pastels', Reception or Cocktail 'Black tie' / 'Cocktail chic'). Mention a colour when it is customary — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Shades of yellow",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1, 2].flatMap((i) => [
  {
    path: `extras.story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide:
      i === 2
        ? "Chapter 3's title: always 'Forever begins' (or the description's own words for it). No emoji."
        : `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the roka, the families meeting"][i]}), as a short evocative title ('Two strangers at a book fair', 'A ring by the lake'). Only from a moment the description tells; a function of the wedding itself (engagement ceremony, registration) is NOT a story chapter. With no such moment, return null. No emoji. Under 40 characters.`,
  },
  {
    path: `extras.story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      (i === 2
        ? "One warm sentence for the last chapter, the wedding itself, about families becoming one and the guest being part of it. No date, no venue, no time. Under 140 characters."
        : `One or two sentences for chapter ${i + 1}, told about the couple in the third person ('They met…', 'He asked…'), with one specific detail from the description (the place, the year). Never invent events, places or years, and never restate a function's date. Null when the title is null. Under 200 characters.`) + TONE,
  },
]);

export const palaceDoorWeddingInvitation: AiFillTemplateSchema = {
  slug: "palace-door-wedding-invitation",
  audience: "friend",
  premise:
    "You are writing a couple's wedding invitation website (Palace Door Wedding Invitation), the kind of page a family sends to every guest on WhatsApp. Its look: carved Rajasthani doors swing open, a floral mandap with lanterns, an illustrated couple for every function. It shows the couple's names, the invitation in English and Hindi side by side, both families, a countdown, the couple's story in chapters, every function of the wedding (each with its date, time, venue, map and dress code), a photo gallery, practical notes for guests, an RSVP and a blessings wall, and closes with a 'Shubh Vivah' blessing. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests. It may be a Hindu, Sikh, Muslim, Christian, South Indian or court/registry wedding: follow the description's customs and words, never assume a Hindu ceremony when it says otherwise." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name as the description spells it (for two grooms or two brides, the first-named partner). Just the first name, no surname, no title.",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name as the description spells it (for two grooms or two brides, the second-named partner). Just the first name.",
    },
    {
      path: "letter",
      label: "The invitation (English)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 50–110 words. Paragraph 1 invites the guest, naming both partners and, when the description names them, the families ('Together with their families…', or for a royal register 'By the grace of the Almighty and with the blessings of our elders…'; for a church wedding 'request the honour of your presence', for a court marriage keep it simple and modern). Paragraph 2 says in one or two warm lines what the celebration will be (the place, the functions) and that the guest's presence matters. Never write a date, a day, a time or a venue address in it (the page shows every function's details right below); naming the city or palace is fine. No greeting line, no signature. Plain text only: paragraphs separated by one blank line, never HTML tags." +
        TONE,
    },
    {
      path: "extras.hindiMessage",
      label: "The invitation (Hindi)",
      kind: "longtext",
      max: 700,
      guide:
        "The same invitation in Hindi, in Devanagari script (never romanised), 1–2 short sentences in the traditional nimantran style: 'सर्वशक्तिमान की कृपा और बड़ों के आशीर्वाद से, <bride> और <groom> के शुभ विवाह के पावन अवसर पर आप सपरिवार सादर आमंत्रित हैं।' Write the couple's names in Devanagari here. For a church or court wedding keep it simple ('… के विवाह समारोह में आप सादर आमंत्रित हैं।'). Under 300 characters.",
    },
    {
      path: "extras.brideFamily",
      label: "Bride's family",
      kind: "text",
      max: 120,
      guide: "The bride's parents as an invitation prints them: 'Mrs. Meera & Mr. Rajesh Sharma'. Only names the description gives; with only a surname, 'The Sharma family'. Null when it names neither.",
    },
    {
      path: "extras.groomFamily",
      label: "Groom's family",
      kind: "text",
      max: 120,
      guide: "The groom's parents as an invitation prints them: 'Mrs. Nandini & Mr. Arvind Mehta'. Only names the description gives; with only a surname, 'The Mehta family'. Null when it names neither.",
    },
    {
      path: "extras.blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "Grandparents or elders whose blessings the invitation carries, exactly as named in the description, with honorifics ('Smt. Kamla Devi & Late Shri Ram Prasad Sharma'). Null unless the description names them.",
    },
    ...functionFields,
    ...storyFields,
    {
      path: "extras.things",
      label: "Good to know",
      kind: "list",
      max: 6,
      itemMax: 180,
      guide:
        "Practical notes for guests, but ONLY lines you could back with a quote from the description: rooms it says are held, a shuttle it mentions, a contact person and phone number it gives. Each line starts with a short heading and a colon ('Contact: …'). Most descriptions contain none of this, and an empty list is the normal answer. Never add a line about hotels nearby, traffic, routes, weather, gifts or the dress code (the functions already show dress codes).",
      example: "Stay: Rooms are held at the hotel for out-of-town guests.",
    },
    {
      path: "endLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line under the 'Shubh Vivah' seal at the very end, signed by the two families by their SURNAMES, taken from the parents' names in the description (parents Sunita and Ramesh Agarwal + Pooja and Vikram Khanna → 'With love and gratitude, the Agarwal & Khanna families'). Under 80 characters, no emoji.",
    },
  ],
};
