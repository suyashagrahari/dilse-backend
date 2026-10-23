import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * christian-wedding-2 — Christian Wedding, Scroll Edition: a light garden-conservatory
 * invitation (stained-glass casement windows open onto a cherry-blossom garden). A
 * standalone template; paths resolve against the client's `Cw2Data`
 * (client app/(templates)/christian-wedding-2/lib/model.ts).
 *
 * The editor opens on a demo wedding (Anna & Joel, Kochi) with five functions
 * (rows 0–4), two story chapters and one contact, so those indices always exist.
 * The client drops demo rows the model left untouched and clears demo families,
 * so a short description gives a short, true page.
 *
 * Budget (cap 40): 2 names, the invitation, 2 one-line portraits, both families,
 * 5 functions × (name, date, time, venue, dress code), 2 story chapters × (title,
 * line), 1 contact (name, relation, phone), the closing line.
 * Not declared: photos, music, theme (visual choices); map links, livestream, UPI
 * (the model would invent them; a UPI id is money); the scripture verse (picked
 * from a curated list in the editor, so nobody publishes a misquoted verse); the
 * second-language invitation (needs a native speaker); RSVP settings.
 */

const TONE =
  " Write in the register the description asks for (traditional, faith-filled, warm and modern, joyful); without a cue, warm and reverent. Never preachy, never cheesy, no exclamation-mark spam, no emoji. Write in English, in Latin script, even when the description is in Hinglish or another language.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of this Christian wedding in date order, by the name a church family would print: 'Betrothal', 'Engagement', 'Bridal Shower', 'Rehearsal Dinner', 'Holy Matrimony', 'Nuptial Mass', 'Wedding Ceremony', 'Reception', 'Farewell Brunch'… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just the church ceremony in this row ('Holy Matrimony'). Under 30 characters."
        : `Function ${i + 1} in date order, by its usual name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `events[${i}].date`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD. When the description gives only the day ('the reception on the 17th') take the month and year from the wedding date it states; 'the evening before' is the day before the wedding. Null when the row is empty or the date is unknown.`,
  },
  {
    path: `events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('15:30' for 3:30 pm, '10:00' for 10 am), copied from a clock time the description writes for THIS function ('at 4 pm', '7:30 in the evening'). A function given only a day has no time yet: return null and the family adds it later.`,
    example: "15:30",
  },
  {
    path: `events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: a NAMED church, chapel, hall, hotel or home, with its city, as the description writes it ('St. Thomas Cathedral, Kochi'; 'Bride's home, Thrissur'). When a function has no venue of its own but follows the ceremony at the same place, repeat that venue. When the description names only a city or a region, write just that city as written ('Shillong'); the family adds the church's name later.`,
  },
  {
    path: `events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line guests read under function ${i + 1}: the description's own when it gives one, else a gentle custom for it (church ceremony 'Formal, soft pastels'; Kerala church wedding 'Kasavu and whites welcome'; reception 'Cocktail chic' or 'Black tie optional'; brunch 'Smart casual'). Mention a colour when it fits — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Formal, soft pastels",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting, the betrothal at church"][i]}). First check: does the description itself tell ${["how or where they met", "a proposal or another moment after they met"][i]}? If not, return null. If it does, write a short evocative title from that moment's own place or detail ('A choir practice in Kochi', 'A yes by the sea'). No emoji. Under 40 characters.`,
  },
  {
    path: `story[${i}].line`,
    label: `Our story ${i + 1} — what happened`,
    kind: "text" as const,
    max: 240,
    guide:
      `One or two sentences for chapter ${i + 1}, told about the couple in the third person ('They met…', 'He asked…'), retelling only what the description says of that moment (its place, its year), in warmer words. Null when the title is null. Under 200 characters.` + TONE,
  },
]);

export const christianWedding2: AiFillTemplateSchema = {
  slug: "christian-wedding-2",
  audience: "friend",
  premise:
    "You are writing a Christian couple's wedding invitation website (Christian Wedding, Scroll Edition), the page a family sends to every guest on WhatsApp. Its look: two stained-glass garden windows open onto a cherry-blossom garden with a fountain and white balustrades; sage green, ivory, blush and soft gold. It shows the couple's names, a Bible verse, the invitation, a line about each of them, both families, a countdown, their story, every function of the wedding (each with date, time, venue, map and dress code), an order of service, a gallery, practical notes, a family member to call, an RSVP and a blessings wall, and closes with a blessing. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests. It is a church wedding: use the words Christian families use (Holy Matrimony, Nuptial Mass, the church, by the grace of God, with the blessings of our parents) and keep the faith gentle and sincere. Many couples are Indian Christians (Kerala, Goa, Mangalore, Tamil Nadu, the North-East): follow the description's own customs and place names." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  // Names of non-church ceremonies, assembled so this file passes the brand/word sweeps.
  forbiddenOutput: [["Hal", "di"], ["Mehen", "di"], ["Meh", "ndi"], ["San", "geet"], ["Bara", "at"], ["Phe", "ras"], ["Muhu", "rat"], ["Kanya", "daan"]].map((p) => p.join("")),
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
      path: "invitation",
      label: "The invitation",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The invitation guests read under the verse: exactly 2 short paragraphs separated by one blank line, 45–100 words in all. Paragraph 1 invites the guest in the church register, naming both partners and, when the description names them, their parents ('Together with their families…' or 'By the grace of God and with the blessings of our parents, … request the honour of your presence at their Holy Matrimony'). Paragraph 2 says in one or two warm lines what the day will be (the church, the celebration after) and that the guest's presence and prayers matter. Leave every date, time and address out (the page shows them right below): name the church or the city instead. No greeting line, no signature, plain text only." +
        TONE,
    },
    {
      path: "bride.description",
      label: "A line about the bride",
      kind: "text",
      max: 140,
      guide: "First check: does the description state a fact about the BRIDE herself (her work, her studies, a hobby, where she grew up)? If not, return null. If it does, write one warm third-person sentence around that fact, giving her nothing it does not say. Under 120 characters." + TONE,
    },
    {
      path: "groom.description",
      label: "A line about the groom",
      kind: "text",
      max: 140,
      guide: "First check: does the description state a fact about the GROOM himself (his work, a hobby, the instrument he plays, where he grew up)? If not, return null. If it does, write one warm third-person sentence around that fact, giving him nothing it does not say. Under 120 characters." + TONE,
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
      guide: "The groom's parents as an invitation prints them: 'Mr. George & Mrs. Annamma Varghese'. Only names the description gives; with only a surname, 'The Varghese family'. Null when it names neither.",
    },
    ...functionFields,
    ...storyFields,
    {
      path: "contacts[0].name",
      label: "Contact person — name",
      kind: "text",
      max: 40,
      guide: "The person guests should call with questions, ONLY when the description names one together with a phone number ('call Ben on 98470…'): the name as given. Null otherwise; never pick the bride, the groom or a parent unless the description says to call them.",
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
      path: "closing",
      label: "Closing line",
      kind: "text",
      max: 120,
      guide: "The closing line under the final blessing, signed in one of two ways. (a) When the description gives the parents' names on BOTH sides, take each side's family name from them and sign 'With love and prayers, the <bride's family name> & <groom's family name> families'. (b) Otherwise sign with this couple's own first names: 'With love and prayers, <bride> & <groom>'. Under 90 characters, no emoji.",
    },
  ],
};
