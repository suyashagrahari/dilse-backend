import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * wedding-invitation-premium — "Wedding Invitation ✦ Premium", rebuilt in
 * 2026-10 as "The Lake Terrace" (client app/(templates)/wedding-invitation-premium):
 * gold French doors open onto a watercolour lake terrace. Paths resolve
 * against `ValentineDayData`; extras keys are defined in
 * server/src/config/valentineDays.ts. recipientName = the BRIDE, senderName =
 * the GROOM, letter = the English invitation, endLine = the closing line.
 *
 * Two ways in: the studio's guided questions (names, date, city, functions,
 * families, how they met, tone, language, a contact) composed into one plain
 * description, or the sender's own few lines. The client then drops demo rows
 * the model left untouched, clears the demo's words from rows it did touch,
 * fills dress codes / colours / notes from a function's name when the model
 * left them out, and writes the facts typed into the questions (names, date,
 * time, city, families, the contact) straight into the form.
 *
 * Budget (field cap 40): 2 names, the invitation in English + Hindi, both
 * parents + the grandparents' line, the main date / time / city / muhurat /
 * blessing ornament, five functions × (name, date, time, venue) with a dress
 * code on the first two, two story moments and the closing line.
 * Not declared: theme / music / photos, map links (the model would invent
 * them), dress colours (derived from the dress-code words), RSVP settings,
 * contacts, shagun, the livestream and the hashtag (the client builds one
 * from the names).
 */

const TONE =
  " Write in the register the description asks for (traditional, royal, warm and modern, faith-filled, fun); without a cue, warm and gracious. Never cheesy, no exclamation-mark spam, no emoji. Write in English unless the description is written in Hindi or Hinglish; never mix scripts inside one field.";

const FUNCTION_ROWS = 5;
const DRESS_ROWS = 2;

const functionFields: AiFillField[] = Array.from({ length: FUNCTION_ROWS }, (_, i) => [
  {
    path: `extras.events[${i}].title`,
    label: `Function ${i + 1} — name`,
    kind: "text" as const,
    max: 30,
    guide:
      i === 0
        ? "The FIRST function of the wedding in date order. Use the description's own word for each function (a description that says 'muhurtham' gets 'Muhurtham', 'nikah' gets 'Nikah'); otherwise its usual name: Roka, Tilak, Haldi, Mehendi, Sangeet, Baraat, 'Wedding (Pheras)', Nikah, 'Anand Karaj', Muhurtham, 'Holy Matrimony', 'Registry Wedding', Cocktail, Reception… The ceremony row takes the faith's own name: 'Anand Karaj' for a Sikh wedding (gurudwara), 'Nikah' for a Muslim wedding, 'Holy Matrimony' for a church wedding, 'Muhurtham' for a Tamil wedding, 'Wedding (Pheras)' for a Hindu North Indian wedding. Rows run in date order, one function per row. List ONLY functions the description mentions; when it mentions none, write just the wedding ceremony itself in this row. Under 30 characters."
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
  },
  {
    path: `extras.events[${i}].venue`,
    label: `Function ${i + 1} — venue`,
    kind: "text" as const,
    max: 80,
    guide: `Where function ${i + 1} happens: the venue name and city from the description, always in English letters ('The Leela Palace, Udaipur'; 'Bride's home, Kanpur' for 'ghar pe'). When a function has no venue of its own, repeat the venue the description gives for the neighbouring functions. Null when the description names no place at all.`,
  },
  ...(i >= DRESS_ROWS
    ? []
    : [
        {
          path: `extras.events[${i}].dressCode`,
          label: `Function ${i + 1} — dress code`,
          kind: "text" as const,
          max: 50,
          guide: `A short dress-code line for function ${i + 1}, naming clothes or colours only: the description's own when it gives one, else the custom for that function (Haldi 'Shades of yellow', Mehendi 'Greens and bright florals', Sangeet 'Indo-western glam', Hindu wedding 'Traditional festive', church wedding 'Formal, pastels', Reception or Cocktail 'Black tie' / 'Cocktail chic'). Mention a colour when it is customary. Under 40 characters. Null for an empty row.`,
        },
      ]),
]).flat();

export const weddingInvitationPremium: AiFillTemplateSchema = {
  slug: "wedding-invitation-premium",
  audience: "friend",
  premise:
    "You are writing a couple's wedding invitation website (Wedding Invitation Premium, 'The Lake Terrace'), the kind of page a family sends to every guest on WhatsApp. Its look: tall gold French doors open onto a sunlit watercolour terrace over a lake, with flamingos, a pink gazebo, a peacock and lanterns, in powder blue, ivory and champagne gold. It shows the couple's names, the invitation in English and Hindi, both families, a countdown, the couple's story in short moments, every function of the wedding (each with its date, time, venue, map and dress code), a photo gallery, notes for guests, an RSVP and a blessings wall. The person describing the wedding is the bride, the groom or a family member; the page speaks for both families to their guests. It may be a Hindu, Sikh, Muslim, Christian, South Indian or court/registry wedding: follow the description's customs and words, never assume a Hindu ceremony when it says otherwise." +
    " Use only facts the description states (names, dates, times, places, people). Where it is silent, leave the field null rather than invent." +
    " The Hindi invitation is the one field that is always in Devanagari; it says nothing about the description's language. A description whose sentences are English is an English description: every other field, the names included, stays in English letters.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The BRIDE's first name exactly as the description spells it, in the same letters (a name the description writes in English letters stays in English letters, whatever the region). For two grooms or two brides, the first-named partner. Just the first name, no surname, no title.",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The GROOM's first name exactly as the description spells it, in the same letters (English letters stay English letters). For two grooms or two brides, the second-named partner. Just the first name.",
    },
    {
      path: "letter",
      label: "The invitation (English)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The invitation guests read first, in English, 2 short paragraphs (blank line between), 50–110 words. Paragraph 1 invites the guest, naming both partners and, when the description names them, the families ('Together with their families…', or for a royal register 'By the grace of the Almighty and with the blessings of our elders…'; for a church wedding 'request the honour of your presence', for a court marriage keep it simple and modern). Paragraph 2 says in one or two warm lines what the celebration will be (the place, the functions) and that the guest's presence matters. Never write a date, a day, a time or a venue address in it (the page shows every function's details right below); naming the city is fine. No greeting line, no signature. Plain text only: paragraphs separated by one blank line, never HTML tags." +
        TONE,
    },
    {
      path: "extras.hindiMessage",
      label: "The invitation (Hindi)",
      kind: "longtext",
      max: 700,
      guide:
        "Always write this field, whatever language the rest of the page is in. Copy this Hindi sentence letter for letter and change only the two names: 'ईश्वर की असीम कृपा और बड़ों के आशीर्वाद से, <bride> और <groom> के शुभ विवाह के पावन अवसर पर आप सपरिवार सादर आमंत्रित हैं।' For a church, nikah or court wedding copy this one instead: '<bride> और <groom> के विवाह समारोह में आप सपरिवार सादर आमंत्रित हैं।' Write the two names in Devanagari (Ishaan → ईशान, Tara → तारा, Harsh → हर्ष); not one Latin letter may remain in this field.",
    },
    {
      path: "extras.brideParents",
      label: "Bride's parents",
      kind: "text",
      max: 90,
      guide: "The bride's parents as an invitation prints them: 'Mrs. Meera & Mr. Rajesh Sharma'. Only names the description gives; with only a surname, 'The Sharma family'. Null when it names neither.",
    },
    {
      path: "extras.groomParents",
      label: "Groom's parents",
      kind: "text",
      max: 90,
      guide: "The groom's parents, printed the same way ('Mrs. Sunita & Mr. Anil Mehta', or 'The Mehta family'). Only from the description; null when it names neither.",
    },
    {
      path: "extras.blessingsOf",
      label: "With the blessings of",
      kind: "text",
      max: 160,
      guide: "The elders whose blessings the invitation carries (grandparents, usually), as the description names them: 'Smt. Kamla Devi & Late Shri Ram Prasad Sharma'. Null when the description names no grandparents or elders.",
    },
    {
      path: "extras.date",
      label: "The wedding date",
      kind: "date",
      required: true,
      guide: "The date of the wedding ceremony itself (the pheras / muhurtham / nikah / church service, not the haldi or the reception), as YYYY-MM-DD, from the description. It drives the countdown.",
    },
    {
      path: "extras.time",
      label: "The wedding time",
      kind: "text",
      max: 5,
      guide: "When the wedding ceremony itself begins, in 24-hour HH:mm ('20:40' for 8:40 pm). Only a time the description states; otherwise null.",
    },
    {
      path: "extras.city",
      label: "The city",
      kind: "text",
      max: 40,
      guide: "The wedding's city, printed under the names ('Udaipur', 'Kochi', 'New Delhi'). Only a city the description names; null otherwise.",
    },
    {
      path: "extras.muhurat",
      label: "Muhurat",
      kind: "text",
      max: 60,
      guide: "A short muhurat line when the description gives an auspicious time for the ceremony ('Shubh muhurat 8:40 pm', 'Muhurtham 9:05 to 10:15 am'). Null when it gives none or for a church, nikah or court wedding.",
    },
    {
      path: "extras.motif",
      label: "Blessing ornament",
      kind: "enum",
      options: ["ganesha", "lotus", "rings", "none"],
      required: true,
      guide: "The small blessing on the doors: 'ganesha' for a Hindu wedding (the default for an Indian wedding when the faith is not said), 'lotus' for a Sikh, Jain or Buddhist wedding, 'rings' for a Christian, court or civil wedding, 'none' for a Muslim wedding or when they ask for no religious symbols.",
    },
    ...functionFields,
    {
      path: "extras.story[0].when",
      label: "Our story 1 — when",
      kind: "text",
      max: 30,
      guide: "When and where the couple first met, as a short label ('2017 · Bengaluru', 'College, Pune'), only when the description tells how they met. Most descriptions don't: then this and the next two fields are null and the page simply leaves the story out.",
    },
    {
      path: "extras.story[0].title",
      label: "Our story 1 — title",
      kind: "text",
      max: 50,
      guide: "How the couple first met, as a short evocative title ('Two strangers at a bus stop', 'A college library'), only when the description tells that meeting. A description that only announces the wedding has no story yet: null. No emoji. Under 40 characters.",
    },
    {
      path: "extras.story[0].text",
      label: "Our story 1 — what happened",
      kind: "longtext",
      max: 320,
      guide: "One or two sentences about how they met, told about the couple in the third person ('They met…', 'She…'), built only from the words of the description: its place, its year, its detail, and nothing added about what they felt, said or shared. Null when the title is null. Under 220 characters." + TONE,
    },
    {
      path: "extras.story[1].title",
      label: "Our story 2 — title",
      kind: "text",
      max: 50,
      guide: "A second moment between meeting and the wedding that the description tells (the proposal, the roka, the families meeting), as a short title ('A ring by the lake'). A function of the wedding itself is NOT a story moment. Null when the description tells no such moment.",
    },
    {
      path: "extras.story[1].text",
      label: "Our story 2 — what happened",
      kind: "longtext",
      max: 320,
      guide: "One or two sentences for that moment, in the third person, built only from the description's own details, with nothing added about feelings. Null when story 2's title is null. Under 220 characters." + TONE,
    },
    {
      path: "endLine",
      label: "The closing line",
      kind: "text",
      max: 90,
      guide: "The thank-you at the very end of the page, one short line under 80 characters, signed by the families when the description names them ('With love, the Sharma & Mehta families'), otherwise a warm line written for this couple. No emoji, no hashtags.",
    },
  ],
};
