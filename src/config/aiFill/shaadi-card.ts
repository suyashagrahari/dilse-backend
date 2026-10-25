import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * shaadi-card — Animated Shaadi Card, the standalone wedding invitation at
 * /shaadi-card (a painted village khidki under a marigold toran opens onto a
 * haldi-yellow mandap). Paths resolve against the client's `ShaadiCardData`
 * (client app/(templates)/shaadi-card/components/model.ts), which extends the
 * stored ShaadiData shape:
 *
 *   brideName / groomName        the couple's first names (big script)
 *   weddingDay                   the wedding day, YYYY-MM-DD (the client keeps the time)
 *   venue                        the city under the names
 *   invitation / hindiMessage    the invitation, English + Hindi
 *   brideFamily.parents …        the families
 *   events[i].*                  the functions (name, isoDate, startTime, venue)
 *   story[i].*                   two story chapters
 *   contacts[0].*                one family member to call
 *
 * Before a fill the editor empties every value that is still the demo's and
 * makes sure five function rows, two story rows and one contact row exist, so
 * every declared index exists. Afterwards it drops the rows the model left
 * empty, and it derives each function's Hindi name, icon and dress code from
 * the function's name, so they are not declared here.
 *
 * The guided flow (the editor's own wedding questions) sends the answers as a
 * plain-English story with exact names, ISO dates and 24-hour times, plus a
 * tone hint and language "en"; a free-text description works the same way.
 *
 * Budget (cap 40, 37 used): 2 names, date, city, the invitation in English and
 * Hindi, both families, five functions × (name, date, time, venue), two story
 * chapters × (title, line), one contact (name, relation, phone), good-to-know
 * and the closing line. The muhurat is not declared: the model kept reporting
 * the ceremony's start time as one; the guided questions ask for it. Not declared: photos, music, map
 * links, livestream, UPI (the model would invent them; a UPI id is money),
 * dress colours, RSVP settings, and a line about each partner (measured
 * against the live model, 2026-10-23: with nothing in the story it wrote
 * generic praise; the sender writes those lines in the form).
 *
 * Tuned against the live model with rich, Hinglish, thin and guided inputs.
 * Measured defects fixed: an example surname in the invitation guide came back
 * as the families' name on thin stories; "next March" became a past date; a
 * venue landed in the city field; a dateless function was put on the day before the wedding; a
 * function was written up as a story chapter; "Wedding" and "Pheras" became two
 * rows of one ceremony.
 */

const TONE =
  " Follow the tone the sender chose; without one, warm, respectful and joyful, like a well-written Indian wedding card. Never cheesy, no exclamation-mark spam, no emoji. Never mix scripts inside one field.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `events[${i}].name`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 30,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by its usual name in English letters: Roka, Sagai, Tilak, Haldi, Mehendi, Sangeet, Baraat, Wedding, Vidaai, Reception… One function per row, rows in date order. The pheras are the wedding ceremony itself: one row named 'Wedding' covers them, so the same ceremony never takes two rows. List ONLY functions the story mentions; when it mentions none, write just 'Wedding' in this row. Under 20 characters."
        : `Function ${i + 1} in date order, by its usual name in English letters (see function 1). Only a function the story mentions, and never a second row for a ceremony already listed. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one.`,
  },
  {
    path: `events[${i}].isoDate`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD, only when the story states a date for this very function (a day alone, 'on the 18th', takes the month and year of the wedding date). A function listed without its own date gets null: the family fills it in later, so do not place it on a nearby day.`,
  },
  {
    path: `events[${i}].startTime`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm (half past seven in the evening is 19:30, seven in the morning is 07:00). Only a time the story states for this function; otherwise null.`,
  },
  {
    path: `events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city as the story gives them, in English words and Latin script even when the story is in Hindi or Hinglish (a family home becomes 'Family home, Lucknow'). When a function has no venue of its own, repeat the main venue the story gives. Null when the story names no place at all.`,
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 50,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting, the roka"][i]}), as a short title in English. Only from something the story says happened between the two of them BEFORE the wedding: meeting, dating, the proposal, the families meeting. The wedding's own functions are never a chapter. When the story tells no such moment, return null. No emoji. Under 40 characters.`,
  },
  {
    path: `story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      `One or two sentences for chapter ${i + 1}, in English, told about the couple in the third person ('They met…', 'He asked…'), with one specific detail from the story (the place, the year). Never invent events, places or years. Null when the title is null. Under 200 characters.` +
      TONE,
  },
]);

export const shaadiCard: AiFillTemplateSchema = {
  slug: "shaadi-card",
  audience: "friend",
  premise:
    "You are writing a Hindu North-Indian wedding invitation website (Animated Shaadi Card), the kind of page a family sends to every guest on WhatsApp instead of a printed card. Its look: a painted village window opens under a marigold toran onto a haldi-yellow mandap; the page then shows the couple's names, the invitation in English and Hindi, both families, a countdown, the couple's story, every function of the wedding with date, time and venue, a photo album, a family member to call, an RSVP and a blessings wall. The person describing it is the bride, the groom or a family member; the page speaks for both families to their guests. Use the customs and function names the story uses. Everything is written in English in Latin letters, names included, except the Hindi invitation, which is in Devanagari." +
    " Use only facts the story states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "brideName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name exactly as the story spells it, in Latin letters. Just the first name, no surname, no title.",
    },
    {
      path: "groomName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name exactly as the story spells it, in Latin letters. Just the first name.",
    },
    {
      path: "weddingDay",
      label: "Wedding date",
      kind: "date",
      required: true,
      guide: "The date of the wedding ceremony itself (the main day), YYYY-MM-DD, only when the story gives a full date with the day of the month. A month alone ('next March', 'in winter') is null.",
    },
    {
      path: "venue",
      label: "City",
      kind: "text",
      max: 40,
      guide: "Only the name of the city or town where the wedding takes place ('Jaipur'), in English letters, even when the story names a palace or hotel together with the city. Null when the story names no city.",
    },
    {
      path: "invitation",
      label: "The invitation (English)",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs separated by one blank line, 45–100 words. Paragraph 1 invites the guest to the wedding of the two partners, naming both. Name the families only by surnames that appear in the parents' names the story gives; when it gives none, say 'our families' and never supply a surname of your own. Paragraph 2 says in one or two warm lines what the celebration will be (the city, the functions) and that the guest's presence and blessings matter. Leave every date, day, time and address out of it (the page shows them right below). No greeting line, no signature, plain text only. Write it in English, in Latin script, even when the story is in Hindi or Hinglish." +
        TONE,
    },
    {
      path: "hindiMessage",
      label: "The invitation (Hindi)",
      kind: "longtext",
      max: 600,
      guide:
        "The same invitation in Hindi, in Devanagari script (never romanised), 1–2 short sentences in the traditional nimantran style: 'ईश्वर की असीम कृपा और बड़ों के आशीर्वाद से, <bride> और <groom> के शुभ विवाह के पावन अवसर पर आप सपरिवार सादर आमंत्रित हैं।' Always write this field: it needs only the two names. Write the names in Devanagari syllable by syllable as they are said; a name that ends in a long -a sound keeps the ा sign at its end (Priya → प्रिया, Ananya → अनन्या). Under 260 characters.",
    },
    {
      path: "brideFamily.parents",
      label: "Bride's parents",
      kind: "text",
      max: 120,
      guide: "The bride's parents as a card prints them, mother first: 'Smt. <mother> & Shri <father> <surname>'. Only names the story gives; with only a surname, 'The <surname> family'. Null when it names neither.",
    },
    {
      path: "groomFamily.parents",
      label: "Groom's parents",
      kind: "text",
      max: 120,
      guide: "The groom's parents as a card prints them, mother first: 'Smt. <mother> & Shri <father> <surname>'. Only names the story gives; with only a surname, 'The <surname> family'. Null when it names neither.",
    },
    ...functionFields,
    ...storyFields,
    {
      path: "contacts[0].name",
      label: "Contact person — name",
      kind: "text",
      max: 40,
      guide: "The person guests should call with questions, ONLY when the story names one together with a phone number: first name and surname as given, in Latin letters. Null otherwise; never pick the bride, the groom or a parent unless the story says to call them.",
    },
    {
      path: "contacts[0].relation",
      label: "Contact person — relation",
      kind: "text",
      max: 40,
      guide: "How the contact person is related to the couple, in a few English words ('<bride>'s brother', 'Wedding planner'), only when the story states the relation. Null when the name is null or no relation is given.",
    },
    {
      path: "contacts[0].phone",
      label: "Contact person — phone",
      kind: "text",
      max: 16,
      guide: "The contact person's phone number exactly as the story writes it, digits with an optional +91. Never invent, complete or change a number. Null when the story gives none.",
    },
    {
      path: "things",
      label: "Good to know",
      kind: "list",
      max: 5,
      itemMax: 180,
      guide:
        "Practical notes for guests, but ONLY lines you could back with a quote from the story: rooms it says are held, a shuttle it mentions, children welcome or not. Each line starts with a short heading and a colon ('Stay: …'). Most stories contain none of this; an empty list is the normal answer. Never put a phone number here, and never add a line about hotels, traffic, weather, gifts or dress codes.",
    },
    {
      path: "closingLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line at the very end of the page, in English, in one of exactly two forms. Form A, only when the story gives both families' surnames in the parents' names: 'With love, the <bride's surname> & <groom's surname> families'. Form B, in every other case: 'With love, <bride's first name> & <groom's first name>', ending with the groom's name. Under 80 characters, no emoji.",
    },
  ],
};
