import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * telugu-wedding-invitation — Telugu Pelli Wedding Invitation, a wedding design on Royal's limits
 * (a Golconda Kalamkari, a Telugu textile border on an ivory card).
 * Same core as floral-wedding-invitation's schema (contacts included), with
 * the second language in Telugu (Telugu script) instead of Hindi.
 * Paths resolve against `ValentineDayData` (client
 * app/(templates)/_valentine/types.ts); extras keys are defined in
 * config/weddingDays/telugu-wedding-invitation.ts.
 *
 * The engine's fields mean: recipientName = the BRIDE, senderName = the GROOM,
 * letter = the English invitation, extras.localMessage = the Telugu one,
 * endLine = the closing line.
 *
 * The editor opens on a demo wedding with several functions and four story
 * chapters, so rows 0–4 and chapters 0–1 always exist. The client drops demo
 * rows the model left untouched, so a short description gives a short page.
 *
 * Budget (field cap 40, all used): 2 names, the invitation in English and
 * Telugu, both families, the grandparents' line, five functions × (name,
 * date, time, venue, dress code), two story chapters × (title, line), the
 * closing line and one contact person (name, relation, phone). Not declared:
 * theme / music / photos (visual choices), the Mangalya Dharana mantra and its reference
 * (scripture the model must never paraphrase or invent; empty = the template's
 * own), map links, the live-stream link and the UPI id
 * (URLs and payment ids the model must never invent), dress colours (the
 * client derives a swatch from the dress-code words), good-to-know notes, RSVP
 * settings.
 */

const TONE =
  " Write in the register the description asks for (formal, warm, modern); without a cue, warm and respectful, in the voice of a Telugu family inviting its relatives and friends with family (sakutumba saparivaara sametamga). Never cheesy, no exclamation-mark spam, no emoji. Write in English unless the description is written in Telugu; never mix scripts inside one field.";

const FUNCTION_ROWS = 5;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `extras.events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 40,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order, by its usual Telugu name: Nischitartham, 'Pellikuthuru & Pellikoduku', 'Mehendi & Sangeet', 'Snathakam & Kasi Yatra', Edurukolu, Kalyanam, Appagintalu, Reception, 'Satyanarayana Vratham'… Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just 'Kalyanam' (jeelakarra bellam and the mangalasutram at the subha muhurtham) in this row. The ceremony itself is always called 'Kalyanam'. Under 30 characters."
        : `Function ${i + 1} in date order, by its usual Telugu name (see function 1). Only a function the description mentions. If the wedding has fewer than ${i + 1} functions, return null for this row and every field of it — never invent one. Under 30 characters.`,
  },
  {
    path: `extras.events[${i}].date`,
    label: `Function ${i + 1} — date`,
    kind: "date" as const,
    guide: `The date of function ${i + 1} as YYYY-MM-DD. When the description gives only the day ('Pellikuthuru on the 10th') take the month and year from the wedding date it states. Null when the row is empty or the date is unknown.`,
  },
  {
    path: `extras.events[${i}].time`,
    label: `Function ${i + 1} — start time`,
    kind: "text" as const,
    max: 5,
    guide: `The start time of function ${i + 1} in 24-hour HH:mm ('09:30' for 9:30 am, '19:30' for 7:30 pm). Telugu muhurthams are often late at night, close to midnight, at a precise minute ('23:42' for 11:42 pm); a muhurtham after midnight is written on the later date ('00:15'). Use only a time the description states; otherwise null.`,
    example: "23:42",
  },
  {
    path: `extras.events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city from the description ('Sri Venkateswara Kalyana Mandapam, Vijayawada'; 'N Convention, Hyderabad'; 'Bride's home, Guntur'). When a function has no venue of its own, repeat the venue the description gives for the neighbouring functions. Null when the description names no place at all.`,
  },
  {
    path: `extras.events[${i}].dressCode`,
    label: `Function ${i + 1} — dress code`,
    kind: "text" as const,
    max: 60,
    guide: `A short dress-code line for function ${i + 1}, guests read it under the function: the description's own when it gives one, else the custom for that function (Nischitartham 'Silks in soft pastels', Pellikuthuru 'Turmeric yellows and leaf greens', Mehendi & Sangeet 'Greens and festive pastels', Kalyanam 'Kanchi and Dharmavaram silks, gold zari', Reception 'Black tie or festive silks'). Mention a colour when it is customary — the page draws a swatch from it. Under 40 characters. Null for an empty row.`,
    example: "Kanchi silks, gold zari",
  },
]).flat();

const storyFields: AiFillField[] = [0, 1].flatMap((i) => [
  {
    path: `extras.story[${i}].title`,
    label: `Our story ${i + 1} — title`,
    kind: "text" as const,
    max: 60,
    guide: `Chapter ${i + 1} of the couple's story (${["how they met", "a moment between meeting and the wedding: the proposal, the families meeting"][i]}), as a short evocative title ('Two strangers at a book fair', 'Filter coffee with both families'). Only from a moment the description tells; a function of the wedding itself (Pellichoopulu, Nischitartham) is NOT a story chapter. With no such moment, return null. No emoji. Under 40 characters.`,
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
    guide: "The person guests should call with questions, by the name the description gives (a brother, a menamama, a planner). Only someone the description names together with a phone number; otherwise null.",
  },
  {
    path: "extras.contacts[0].relation",
    label: "Contact person — relation",
    kind: "text",
    max: 40,
    guide: "Who that person is to the couple, in a few words, from the description ('Bride's brother', 'Bride's menamama', 'Wedding planner'). Null when the contact name is null or the description does not say.",
  },
  {
    path: "extras.contacts[0].phone",
    label: "Contact person — phone",
    kind: "text",
    max: 20,
    guide: "That person's phone number exactly as the description writes it, digits and an optional leading +. Null unless the description states a number for them.",
  },
];

export const teluguWeddingInvitation: AiFillTemplateSchema = {
  slug: "telugu-wedding-invitation",
  audience: "friend",
  premise:
    "You are writing a Telugu couple's wedding invitation website (Telugu Pelli Wedding Invitation), the kind of page a family sends to every guest on WhatsApp. Its look: a Golconda Kalamkari behind an ivory card with a Telugu textile border, with Sri and 'Srirastu · Subhamastu · Avighnamastu' at the top of the card. It shows the couple's names, the invitation in English and in Telugu (Telugu script) side by side, both families, a countdown, the couple's story in chapters, every function of the wedding (Nischitartham, Pellikuthuru & Pellikoduku, Mehendi & Sangeet, Snathakam & Kasi Yatra, Edurukolu, the Kalyanam itself — Kanyadanam, jeelakarra bellam placed at the subha muhurtham (often close to midnight), the mangalasutram, talambralu — then Appagintalu, the Reception and the Satyanarayana Vratham), each with its date, time, venue, map and dress code, a photo gallery, practical notes for guests, an RSVP and a blessings wall. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests, with the blessings of the elders. Use Telugu words for everything on this page; never import customs or words from another region's wedding." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name as the description spells it (for two grooms or two brides, the first-named partner). Just the first name, without a surname, initials or a title, in the same script the description writes it in (a name typed in Latin letters stays in Latin letters).",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name as the description spells it (for two grooms or two brides, the second-named partner). Just the first name, without a surname, initials or a title, in the same script the description writes it in.",
    },
    {
      path: "letter",
      label: "The invitation (English)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 50–110 words. Paragraph 1 invites the guest, naming both partners and, when the description names them, the families ('By the grace of Sri Venkateswara Swamy and with the blessings of our elders, the families of … joyfully invite you to the wedding of …' — use the family's own deity when the description names one). Paragraph 2 says in one or two warm lines what the celebration will be (the nadaswaram, jeelakarra bellam at the muhurtham, the talambralu, the feast, the functions) and that the guest's presence and blessings matter. Never write a date, a day, a time or a venue address in it (the page shows every function's details right below); naming the city or the kalyana mandapam is fine. No greeting line, no signature. Plain text only: paragraphs separated by one blank line, never HTML tags." +
        TONE,
    },
    {
      path: "extras.localMessage",
      label: "The invitation (Telugu)",
      kind: "longtext",
      max: 700,
      guide:
        "The same invitation in Telugu, in Telugu script (never romanised, never any other script), 1–2 short sentences in the traditional style: 'శ్రీ వేంకటేశ్వర స్వామి వారి కృపతో, పెద్దల ఆశీస్సులతో చి.ల.సౌ. <bride> మరియు చి. <groom> ల వివాహ మహోత్సవమునకు మీరు సకుటుంబ సపరివార సమేతంగా విచ్చేసి, వధూవరులను ఆశీర్వదించవలసిందిగా కోరుచున్నాము.' Write the couple's names in Telugu script here. Under 300 characters.",
    },
    {
      path: "extras.brideFamily",
      label: "Bride's family",
      kind: "text",
      max: 120,
      guide: "The bride's parents as a Telugu invitation prints them: 'Sri Vemuri Venkata Ramana Rao & Smt. Vemuri Padmavathi' (the family name, the intiperu, comes first). Only names the description gives; with only a family name, 'The Vemuri family'. Null when it names neither.",
    },
    {
      path: "extras.groomFamily",
      label: "Groom's family",
      kind: "text",
      max: 120,
      guide: "The groom's parents as a Telugu invitation prints them: 'Sri Mullapudi Srinivasa Rao & Smt. Mullapudi Annapurna'. Only names the description gives; with only a family name, 'The Mullapudi family'. Null when it names neither.",
    },
    {
      path: "extras.blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "Grandparents or elders whose blessings the invitation carries, exactly as named in the description, with Telugu honorifics ('Sri Vemuri Subba Rao & Smt. Vemuri Seethamma'; 'Late' before an elder who has passed). Null unless the description names them.",
    },
    ...functionFields,
    ...storyFields,
    ...contactFields,
    {
      path: "endLine",
      label: "Closing line",
      kind: "text",
      max: 90,
      guide: "The closing line at the very end of the page, signed by the two families by their FAMILY NAMES (the intiperu: Vemuri, Mullapudi — the name that comes first, never a given name), taken from the parents' names in the description: 'With love and gratitude, the Vemuri & Mullapudi families'. When that runs past 80 characters, 'With love, the Vemuri & Mullapudi families'. With no family names given, 'With love and gratitude, both our families'. Under 80 characters, no emoji.",
    },
  ],
};
