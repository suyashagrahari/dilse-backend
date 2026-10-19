import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * wedding-invitation-premium — "Wedding Invitation ✦ Premium" on the
 * Valentine engine (client app/(templates)/wedding-invitation-premium). Paths
 * resolve against `ValentineDayData`; extras keys are defined in
 * server/src/config/valentineDays.ts. recipientName = the bride, senderName =
 * the groom, letter = the invitation message, endLine = the closing thank-you.
 *
 * The editor's "Describe your wedding" box sends the sender's few lines here.
 * Before it does, it blanks every function / story row that still holds the
 * demo, so a wedding with three functions ends with three (empty rows are
 * dropped after the fill). Dress codes and function descriptions are filled
 * on the client from the function's name when the model leaves them out —
 * which keeps this schema under the 40-field ceiling.
 *
 * Not declared: theme, order, map links, photos, RSVP settings — choices, not words.
 */

const TIME_GUIDE =
  " 24-hour \"HH:mm\" (\"19:30\"), only when the description gives a time or the custom is unmistakable (a haldi is a morning function); otherwise leave it empty.";

const EVENT_FIELDS: AiFillField[] = [0, 1, 2, 3, 4].flatMap((i): AiFillField[] => {
  const n = i + 1;
  const first = i === 0;
  return [
    {
      path: `extras.events[${i}].title`,
      label: `Function ${n} — name`,
      kind: "text",
      max: 30,
      required: first,
      guide:
        `The name of function ${n} in date order, exactly as the family would print it: Haldi, Mehendi, Sangeet, Wedding (or Pheras / Anand Karaj / Nikah / Church Ceremony / Muhurtham), Reception, Engagement, Cocktail, Tilak, Baraat. ` +
        "Use only functions the description mentions or clearly implies; a Christian or court wedding usually has just a ceremony and a reception. " +
        (first ? "Always fill this one (the wedding itself when nothing else is named)." : "LEAVE EMPTY when the wedding has fewer functions — never invent one to fill the slot."),
      example: first ? "Haldi" : undefined,
    },
    {
      path: `extras.events[${i}].date`,
      label: `Function ${n} — date`,
      kind: "date",
      guide: `The date of function ${n}, from the description. Empty when that function is empty or the date is not given.`,
    },
    {
      path: `extras.events[${i}].time`,
      label: `Function ${n} — time`,
      kind: "text",
      max: 5,
      guide: `When function ${n} starts:` + TIME_GUIDE,
    },
    {
      path: `extras.events[${i}].venue`,
      label: `Function ${n} — venue`,
      kind: "text",
      max: 80,
      guide:
        `Where function ${n} happens: the venue name and city as the description gives it ("The Leela Palace, Udaipur", "St. Mary's Church, Kochi", "Sharma Niwas lawns"). Never invent a venue; when the description names only a city for the whole wedding, write that city. Empty when that function is empty.`,
    },
  ];
});

export const weddingInvitationPremium: AiFillTemplateSchema = {
  slug: "wedding-invitation-premium",
  audience: "partner",
  premise:
    "A premium wedding invitation website that a couple (or their family) sends to guests on WhatsApp. It opens on a sealed envelope and a gold monogram, then shows the couple's names, the date with a countdown, the invitation message, a short 'our story' timeline, both families, a card for every wedding function (Haldi, Mehendi, Sangeet, the wedding, the reception… each with date, time and venue), a photo gallery and an RSVP. You are filling it from the few lines the couple wrote about their wedding. Indian weddings are the norm (Hindu, Sikh, Muslim, South Indian), but follow the description: a Christian church wedding or a court marriage gets its own words and functions. Elegant, warm and gracious — never cute or jokey — and every fact (names, dates, venues, cities) comes from the description, never invented. Write in the language and script of the couple's own sentences: English stays English, Hinglish stays Hinglish in Latin letters, Devanagari stays Devanagari.",
  fields: [
    {
      path: "recipientName",
      label: "Bride's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The bride's first name as it should be printed (\"Ananya\"). From the description; never a surname alone, never a nickname unless that is all it gives. For two grooms or two brides, the first-named partner.",
      example: "Ananya",
    },
    {
      path: "senderName",
      label: "Groom's name",
      kind: "text",
      max: 30,
      required: true,
      guide: "The groom's first name as it should be printed (\"Arjun\"). From the description. For two brides or two grooms, the second-named partner.",
      example: "Arjun",
    },
    {
      path: "extras.date",
      label: "The wedding date",
      kind: "date",
      required: true,
      guide: "The date of the wedding itself (the pheras / ceremony — not the haldi or the reception), from the description. It drives the countdown.",
    },
    {
      path: "extras.time",
      label: "The wedding time",
      kind: "text",
      max: 5,
      guide: "When the wedding ceremony itself begins (the muhurat / pheras / church service):" + TIME_GUIDE,
    },
    {
      path: "extras.city",
      label: "The city",
      kind: "text",
      max: 40,
      guide: "The wedding's city (\"Udaipur\", \"Kochi\", \"New Delhi\"), printed under the names. Only from the description; empty if none is given.",
      example: "Udaipur",
    },
    {
      path: "extras.hashtag",
      label: "Wedding hashtag",
      kind: "text",
      max: 40,
      guide: "A wedding hashtag only when the description gives one, or a simple one built from both first names (\"#AnanyaWedsArjun\"). No spaces, starts with #, under 32 characters.",
      example: "#AnanyaWedsArjun",
    },
    {
      path: "extras.brideParents",
      label: "Bride's parents",
      kind: "text",
      max: 90,
      guide: "The bride's parents as an invitation prints them: \"Mrs. Kavita & Mr. Rajesh Sharma\". Only names the description gives; when it gives just the surname, write \"The Sharma family\". Empty when the description says nothing about her family.",
      example: "Mrs. Kavita & Mr. Rajesh Sharma",
    },
    {
      path: "extras.groomParents",
      label: "Groom's parents",
      kind: "text",
      max: 90,
      guide: "The groom's parents, printed the same way (\"Mrs. Sunita & Mr. Anil Mehta\", or \"The Mehta family\"). Only from the description; empty when it says nothing.",
      example: "The Mehta family",
    },
    {
      path: "extras.motif",
      label: "Blessing ornament",
      kind: "enum",
      options: ["ganesha", "lotus", "rings", "none"],
      guide: "The small ornament above the invitation: 'ganesha' for a Hindu wedding (the default for an Indian wedding when the faith is not said), 'lotus' for a Sikh, Jain or Buddhist wedding or when the couple wants something non-religious but Indian, 'rings' for a Christian, court or civil wedding, 'none' for a Muslim wedding or when they ask for no religious symbols.",
    },
    {
      path: "letter",
      label: "Your invitation",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "The invitation message guests read first, under the couple's names: 3 to 5 sentences in exactly two short paragraphs separated by a blank line, in the couple's own voice and the tone they ask for (formal and royal, or warm and modern; formal when they say nothing). The first paragraph invites the guest to the wedding of the bride and groom by first name, with the blessings of their families, and names the wedding date as \"6 December 2026\" (digits for the day and year, and never a weekday — the page prints that itself) and the city. The second paragraph says in a fresh, specific way what the guest's presence means to them — draw on a detail from the description when there is one. Write it in the language the description is written in — an English description gets an English message, whatever the couple's region. Never list the functions (the page shows each one), no emoji, no hashtags, and do not open with the stock phrase most invitations use; write it the way this couple would.",
    },
    ...EVENT_FIELDS,
    {
      path: "extras.story[0].when",
      label: "Our story 1 — when",
      kind: "text",
      max: 30,
      guide: "When the couple first met, as a short label (\"2018\", \"College, Pune\", \"Summer 2019\"). From the description; empty if it does not say how they met.",
      example: "2018",
    },
    {
      path: "extras.story[0].title",
      label: "Our story 1 — title",
      kind: "text",
      max: 50,
      guide: "Two to five words naming how they met (\"Where it began\", \"A college library\", \"A wrong number\"). Empty when the description says nothing about how they met.",
      example: "Where it began",
    },
    {
      path: "extras.story[0].text",
      label: "Our story 1 — the moment",
      kind: "longtext",
      max: 320,
      guide: "One or two warm sentences about how they met, in the couple's voice ('we'), using ONLY what the description says — never add feelings, places or details it does not give. Empty when it says nothing.",
    },
    {
      path: "extras.story[1].title",
      label: "Our story 2 — title",
      kind: "text",
      max: 50,
      guide: "A second moment the description mentions (the proposal, the roka, moving cities, meeting the families), in two to five words. Empty when there is no second moment in the description — never invent one.",
      example: "The proposal",
    },
    {
      path: "extras.story[1].text",
      label: "Our story 2 — the moment",
      kind: "longtext",
      max: 320,
      guide: "One or two sentences about that second moment in the couple's voice ('we'), only from the description — no invented details. Empty when story 2's title is empty.",
    },
    {
      path: "extras.story[2].title",
      label: "Our story 3 — title",
      kind: "text",
      max: 50,
      guide: "The last moment of the story, which is always the wedding itself coming up (\"Forever begins\", \"Saat phere\", \"I do\"). Fill it whenever story 1 is filled.",
      example: "Forever begins",
    },
    {
      path: "extras.story[2].text",
      label: "Our story 3 — the moment",
      kind: "longtext",
      max: 320,
      guide: "One gracious sentence in the couple's voice inviting the guest into this last chapter — the wedding itself, its city or date if given. Write it fresh for this couple. Fill it whenever story 3's title is filled.",
    },
    {
      path: "endLine",
      label: "The closing line",
      kind: "text",
      max: 90,
      guide: "The thank-you at the very end of the page, beneath a photo of the couple: one short line, under 80 characters, in the invitation's language and tone, written for this couple (it may name their city or the season). No emoji, no hashtags.",
    },
  ],
};
