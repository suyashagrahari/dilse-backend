import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * christian-wedding — Christian Wedding Invitation ("Join Us at the Altar"), a
 * standalone page: tall wooden church doors under a stained-glass rose window
 * swing open onto a flower-strewn aisle, then the couple's names, scripture,
 * the order of service, every function, the story, RSVP and blessings.
 *
 * Paths resolve against the editor's form `CwData` (client
 * app/(templates)/christian-wedding/chapel/model.ts), not the stored model:
 * the editor converts on save. The demo wedding has four functions (rows 0–3)
 * and two story chapters, so those indices always exist; the client drops demo
 * rows the model left untouched, so a short description gives a short page.
 *
 * The scripture is chosen, never written: `scripture.ref` is an enum of the
 * eight verses the page carries, and the client sets the verse text from its
 * own list, so a misquoted Bible verse can never be published.
 *
 * Budget (cap 40, used 38): names, the date and ceremony time, the church and
 * the city, the invitation, the verse, both parents, four functions × (name,
 * date, time, venue, dress code), two story chapters × (title, line), one
 * contact (name, relation, phone) and the closing line. Not declared: photos,
 * music, map links, livestream, UPI, theme (the model would invent them, or
 * they are the sender's choices), and the second-language invitation — run
 * against the live model its Malayalam garbled the names and the grammar, so
 * the editor offers a short reviewed line per language instead.
 */

const TONE =
  " Write in the register the description asks for (traditional and reverent, warm and modern, faith-filled, light and joyful); without a cue, warm, gracious and quietly reverent. Never cheesy, no exclamation-mark spam, no emoji.";

export const CW_VERSES = [
  "1 Corinthians 13:4-7",
  "1 Corinthians 13:13",
  "Ecclesiastes 4:9-12",
  "Genesis 2:24",
  "Song of Solomon 8:7",
  "Ruth 1:16",
  "Colossians 3:14",
  "1 John 4:12",
] as const;

const FUNCTION_ROWS = 4;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `events[${i}].name`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by the name the description uses: Betrothal, Engagement, Manasammatham, Bridal Shower, Rehearsal Dinner, Holy Matrimony, Nuptial Mass, Wedding Ceremony, Reception, Brunch… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write the church ceremony itself in this row ('Holy Matrimony'). Under 30 characters."
        : `Function ${i + 1} in date order, by its usual name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `events[${i}].isoDate`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD, only when the description pins the day down: a full date, or a day relative to a full date it states ('the reception the same evening', 'brunch the next morning', 'betrothal on the 7th' when the wedding's month and year are given). A month or a season alone is not a date. Null when the row is empty or the day is not stated.`,
  },
  {
    path: `events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('15:30' for 3:30 pm, '10:00' for 10 am). Only a time the description states; otherwise null.`,
    example: "15:30",
  },
  {
    path: `events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the church, hall or home and the city from the description ('St. Mary's Basilica, Kochi'; 'Bride's home, Kottayam'). Repeat another function's place only when the description says this one happens there too ('at the same church'). A reception or dinner is not at the church unless the description says so. Null when the description gives this function no place.`,
  },
  {
    path: `events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line guests read under function ${i + 1}: the description's own words when it gives one, else what is usual (the church ceremony 'Formal, soft pastels', a reception 'Black tie optional' or 'Cocktail attire', a brunch 'Smart casual', a betrothal 'Festive formal'). Mention a colour when it is customary — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Formal, soft pastels",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting"][i]}), as a short evocative title of three to six words made from that moment's own place or detail (never a generic 'How we met'). Only from something that already HAPPENED to the two of them, told in the description. The wedding, its plans, its place or its functions are never a chapter: a description that only announces the wedding has no story, and the answer is null. No emoji. Under 40 characters.`,
  },
  {
    path: `story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      `One or two sentences for chapter ${i + 1}, told about the couple in the third person ('They met…', 'He asked…'), with one specific detail from the description (the place, the season). Never invent events, places or years. Null when the title is null. Under 200 characters.` +
      TONE,
  },
]);

export const christianWedding: AiFillTemplateSchema = {
  slug: "christian-wedding",
  audience: "friend",
  premise:
    "You are writing a couple's Christian wedding invitation website, the kind of page a family sends to every guest on WhatsApp. Its look: tall wooden church doors under a stained-glass rose window swing open onto a flower-strewn aisle; ivory paper, dusty rose, sage and soft gold. It shows the couple's names, the invitation, a Bible verse, both families, the order of service, every function of the wedding (each with its date, time, venue, map and dress code), the couple's story in chapters, a photo gallery, a family member to call, an RSVP and a blessings wall. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests." +
    " This is a church wedding: use the description's own words for its functions and customs (Holy Matrimony, Nuptial Mass, Betrothal, Manasammatham, Reception), keep a reverent, joyful Christian register, and never bring in rituals or words from another faith's ceremony." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  forbiddenOutput: ["haldi", "mehendi", "mehndi", "sangeet", "baraat", "pheras", "mandap", "muhurat", "nikah", "ganesh", "ganesha"],
  fields: [
    {
      path: "brideName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name as the description spells it (for two brides or two grooms, the first-named partner). Just the first name, no surname, no title.",
    },
    {
      path: "groomName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name as the description spells it (for two brides or two grooms, the second-named partner). Just the first name.",
    },
    {
      path: "weddingDay",
      label: "Wedding date",
      kind: "date",
      required: true,
      guide: "The date of the church ceremony as YYYY-MM-DD, only when the description states the day, the month and the year (a weekday and month with the year implied by 'next year' is not enough). A month or a season alone ('in January', 'this winter') is not a date: return null and the sender picks it.",
    },
    {
      path: "weddingTime",
      label: "Ceremony time",
      kind: "text",
      max: 5,
      guide: "The start time of the church ceremony in 24-hour HH:mm ('15:30' for 3:30 pm). Only a time the description states; otherwise null.",
      example: "15:30",
    },
    {
      path: "churchName",
      label: "Church",
      kind: "text",
      max: 90,
      guide: "The name of the church where the ceremony happens, as the description gives it ('St. Mary's Basilica', 'CSI Christ Church'). Never the city alone. Null when it names no church.",
    },
    {
      path: "venue",
      label: "City / address",
      kind: "text",
      max: 120,
      guide: "The town or the address of the church, as the description gives it ('Ernakulam, Kochi'; 'MG Road, Bengaluru'). Null when it names no place.",
    },
    {
      path: "invitation",
      label: "The invitation",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 45–100 words. Paragraph 1 invites the guest in the traditional church register, naming both partners and, when the description names them, their parents ('Together with their families, Anna and Joel request the honour of your presence as they are united in Holy Matrimony'). Paragraph 2 says in one or two warm lines that the celebration continues with the families and that the guest's presence and prayers mean a great deal. Leave every date, day, time and address out of it (the page shows them right below): name the church or the city instead. No greeting line, no signature. Plain text only, paragraphs separated by one blank line." +
        TONE,
    },
    {
      path: "scripture.ref",
      label: "Bible verse",
      kind: "enum",
      options: CW_VERSES,
      guide:
        "The verse printed under the couple's names. When the description names one of these passages, pick it; otherwise pick the one that fits its tone best (love described: 1 Corinthians 13:4-7; two becoming one: Genesis 2:24; a cord of three strands, faith at the centre: Ecclesiastes 4:9-12; loyalty and family: Ruth 1:16).",
    },
    {
      path: "brideFamily.parents",
      label: "Bride's parents",
      kind: "text",
      max: 120,
      guide: "The bride's parents as an invitation prints them: 'Mr. Thomas & Mrs. Mary Kurian'. Only names the description gives; with only a surname, 'The Kurian family'. Null when it names neither.",
    },
    {
      path: "groomFamily.parents",
      label: "Groom's parents",
      kind: "text",
      max: 120,
      guide: "The groom's parents as an invitation prints them: 'Mr. George & Mrs. Annie Mathew'. Only names the description gives; with only a surname, 'The Mathew family'. Null when it names neither.",
    },
    ...functionFields,
    ...storyFields,
    {
      path: "contacts[0].name",
      label: "Contact person — name",
      kind: "text",
      max: 40,
      guide: "The person guests should call with questions, ONLY when the description names one together with a phone number: first name and surname as given. Null otherwise; never pick the bride, the groom or a parent unless the description says to call them.",
    },
    {
      path: "contacts[0].relation",
      label: "Contact person — relation",
      kind: "text",
      max: 40,
      guide: "How the contact person is related to the couple, in a few words ('Anna's brother', 'Wedding coordinator'), only when the description states it. Null when the name is null.",
    },
    {
      path: "contacts[0].phone",
      label: "Contact person — phone",
      kind: "text",
      max: 16,
      guide: "The contact person's phone number exactly as the description writes it, digits with an optional +91. Never invent, complete or reformat a number into a different one. Null when the description gives none.",
      example: "+91 98470 11223",
    },
    {
      path: "closingLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line at the very end of the page. When the description gives both sets of parents with their family names, sign with those two family names ('With love and prayers, the Kurian & Mathew families'). In every other case sign with the bride's and the groom's first names exactly as given ('With love and prayers, Anna & Joel'). Under 80 characters, no emoji.",
    },
  ],
};
