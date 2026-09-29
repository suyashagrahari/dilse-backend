// ─── AI fill — loveflix ──────────────────────────────────────────────────────
//
// Paths address `mf: LoveflixData` in
// client/app/(templates)/loveflix/hooks/useLoveflixEditor.ts, declared in
// client/app/(templates)/loveflix/components/types.ts.
//
// EVERY text leaf of the page is declared here — names, the show's billing,
// the six episodes (title, synopsis, subtitles), the Top 10, the inside-joke
// rail, the coming-soon plans, the finale and the letter with its lock. The
// only things left out are media (`*PhotoUrl`, `heroImageUrl`,
// `episodes[n].imageUrl`) and their crops, which are numbers the sender sets by
// dragging a photo. (Rule 1.)
//
//   episodes: Episode[]   — array of OBJECTS, addressed `episodes[2].subtitle`.
//   genres / reasons / insideJokes / plans — string[], declared as `list`.
//
// BRAND SAFETY: this template borrows the LAYOUT of a streaming service and no
// one's identity. The incumbent's name appears nowhere and `forbiddenOutput`
// drops any field that names a real service.

import type { AiFillField, AiFillTemplateSchema } from "./types";

/** Episode titles sit on one line in the rails and the episode list. */
const EP_TITLE = 34;
/** Synopses clamp to three lines in the episode list. */
const EP_SYNOPSIS = 150;
/** Subtitles: two or three short lines, each a caption on screen. */
const EP_SUBTITLE = 170;

/**
 * The six episodes, each pinned to a different beat of a relationship so the
 * season reads as a season and not six versions of the same date.
 */
const BEATS: { beat: string; titleEx: string; synEx: string; subEx: string }[] = [
  {
    beat: "how it started — the first meeting, the first date, or the moment one of them first noticed the other",
    titleEx: "The Airport",
    synEx: "She's late, he's early, and a departures board accidentally starts something neither of them planned.",
    subEx: "You ran the last fifty metres.\nI pretended I hadn't been waiting.\nI've never recovered.",
  },
  {
    beat: "a long night or a first real conversation — the evening they stopped being polite and started actually talking",
    titleEx: "The Power Cut",
    synEx: "Four hours, no phones, one candle and the longest conversation of the season.",
    subEx: "The fan stopped and you started talking.\nBy the time the lights came back\nI knew your whole childhood.",
  },
  {
    beat: "a small domestic ritual they repeat — a food, a drink, a routine, a shared habit — the unglamorous thing that became their favourite",
    titleEx: "2 AM Maggi",
    synEx: "A half-cooked midnight snack on the kitchen floor becomes the most rewatched episode on the service.",
    subEx: "Half-cooked. On the floor.\nYou stole the last bite and called it sharing.",
  },
  {
    beat: "an outing, a trip or an adventure — a place they went together, ideally with weather or a mishap involved",
    titleEx: "Monsoon Special",
    synEx: "One umbrella, two people, and a strongly held opinion about who should carry it.",
    subEx: "You refused the umbrella on principle.\nThen complained for an hour.",
  },
  {
    beat: "a hard stretch they got through — distance, exams, a bad week, a fight they came back from, a hospital visit — told gently",
    titleEx: "Missing You, Live",
    synEx: "A long-distance week told entirely through voice notes, bad video calls and one very dramatic sigh.",
    subEx: "Eleven-minute voice notes.\nNo summary. No regrets.",
  },
  {
    beat: "the running joke or unresolved argument they still have today — the season finale that is really about now",
    titleEx: "The Argument About The Film",
    synEx: "The long-running feud reaches its season finale. Neither side has conceded. Neither side ever will.",
    subEx: "You're wrong about the ending.\nI'll keep saying it\nfor the rest of our lives.",
  },
];

const episodeFields = (): AiFillField[] =>
  BEATS.flatMap(({ beat, titleEx, synEx, subEx }, i): AiFillField[] => [
    {
      path: `episodes[${i}].title`,
      label: `Episode ${i + 1} — title`,
      kind: "text",
      max: EP_TITLE,
      required: i < 3,
      guide: `The title of EPISODE ${i + 1} of their show, about ${beat}. Name it like a real prestige-TV episode: two to five words, Title Case, a concrete noun from their story (a place, an object, a time of night) rather than a feeling. Under ${EP_TITLE} characters. It must be clearly different from every other episode title.`,
      example: titleEx,
    },
    {
      path: `episodes[${i}].synopsis`,
      label: `Episode ${i + 1} — synopsis`,
      kind: "text",
      max: EP_SYNOPSIS,
      required: i < 3,
      guide: `The one-sentence episode synopsis shown in the episode list for episode ${i + 1}, written in the flat third-person voice of a streaming catalogue ("she", "he", "they" — or their names), describing the specific event from their story. Dry and a little funny, one real detail, under ${EP_SYNOPSIS} characters. No second person here.`,
      example: synEx,
    },
    {
      path: `episodes[${i}].subtitle`,
      label: `Episode ${i + 1} — subtitles`,
      kind: "text",
      max: EP_SUBTITLE,
      required: i < 3,
      guide: `What appears as SUBTITLES when episode ${i + 1} plays: the sender speaking directly to them ("you", "I") about that same moment. Two or three short lines, EACH ON ITS OWN LINE — separate them with a newline character (\\n), never with just a full stop — each under 45 characters, so each reads as one caption. Tender and specific, a small confession rather than a summary. Under ${EP_SUBTITLE} characters in total.`,
      example: subEx,
    },
  ]);

export const loveflix: AiFillTemplateSchema = {
  slug: "loveflix",
  premise:
    "This page is a parody streaming service whose entire catalogue is one couple's relationship: a 'Who's watching?' profile picker, a hero billboard for their show, a season of six episodes that are really their own moments, a Top 10 of reasons the sender loves them, a rail of inside jokes, a 'Coming Soon' rail of plans, a finale and a private letter. You write every line of it — titles, synopses, the subtitles that play over each episode, the ratings joke — as if their relationship had been commissioned, rated and put on a home screen. Catalogue voice for the billing, the sender's own tender voice for subtitles, finale and letter. Never name a real streaming service, film, series or platform.",
  audience: "partner",
  forbiddenOutput: [
    ["Net", "flix"].join(""),
    ["Pri", "me Video"].join(""),
    ["Hot", "star"].join(""),
    ["Dis", "ney"].join(""),
    ["H", "BO"].join(""),
    ["Hu", "lu"].join(""),
  ],
  fields: [
    {
      path: "recipientName",
      label: "Their name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The name of the person this service was made for — it is the profile tile they tap on 'Who's watching?' and appears as 'For <name>' across the app. First name or the pet name the sender actually uses, exactly as in the story.",
      example: "Aditi",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The sender's own first name — the second profile tile, credited as the show's creator and director. First name only, as in the story.",
      example: "Rohan",
    },
    {
      path: "thirdProfile",
      label: "The third profile",
      kind: "text",
      max: 18,
      guide:
        "A third, locked profile tile on the picker, as a joke — a pet they have or want, a future plan, or a recurring character from their story (the dog, 'our future cat', 'Mom's spy'). Two or three words, under 18 characters, lowercase or Title Case.",
      example: "Our future cat",
    },
    {
      path: "showTitle",
      label: "The show's title",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The title of the series their relationship is released under, set in huge letters on the billboard. One to three words, prestige-drama brevity, built from something only they would recognise — a place, a food, an object or a running joke from the story, or a nickname for the two of them. Generic one-word titles that could belong to any couple are wrong. It must not echo the name of any actual show or platform.",
      example: "Monsoon & Maggi",
    },
    {
      path: "tagline",
      label: "The billboard synopsis",
      kind: "text",
      max: 190,
      required: true,
      guide:
        "The show's synopsis on the billboard and in the details page, in the flat third-person voice of a streaming catalogue that has been slightly betrayed by whoever wrote it. Two or three clipped sentences, under 190 characters. Describe the two of them as characters, name one specific unresolved thing between them, and land it dry rather than sweet.",
      example:
        "Two people who are extremely bad at admitting things. Three seasons, one shared hoodie and an argument about a film that is still ongoing.",
    },
    {
      path: "rating",
      label: "Maturity rating",
      kind: "text",
      max: 8,
      required: true,
      guide:
        "The short maturity badge in the corner of the billboard, formatted like a real age classification — '18+', '16+', 'U/A 13+', 'A'. Under 8 characters. Pick the one that is funniest for how clingy or dramatic they are.",
      example: "18+",
    },
    {
      path: "ratingReason",
      label: "Content warnings",
      kind: "text",
      max: 80,
      required: true,
      guide:
        "The content descriptors shown with the maturity badge when an episode starts, in the deadpan comma-separated style of real content warnings — but every item is a cute, specific habit of theirs. Three or four items, lowercase, under 80 characters.",
      example: "forehead kisses, 2 AM calls, excessive clinginess",
    },
    {
      path: "seasons",
      label: "Season count",
      kind: "text",
      max: 20,
      required: true,
      guide:
        "How long they have been together, as a season count in the metadata row. One year is one season; round to whole seasons. Two or three words. If they are only months in, say 'Limited Series' or 'Season 1'.",
      example: "3 Seasons",
    },
    {
      path: "metYear",
      label: "Release year",
      kind: "text",
      max: 4,
      guide:
        "The year they met, as a four-digit number and nothing else. It sits where a release year would be. Leave it empty if the story never says or implies when they met.",
      example: "2023",
    },
    {
      path: "matchPercent",
      label: "Match percentage",
      kind: "number",
      guide:
        "The '% Match' score shown in green next to the show — an integer from 90 to 100. Use 99 unless the story makes a funnier number obvious (e.g. 98 because of the snoring).",
      example: "99",
    },
    {
      path: "genres",
      label: "Genres",
      kind: "list",
      max: 3,
      itemMax: 20,
      required: true,
      guide:
        "Three genre tags shown as 'Romantic • Slow-burn • Chaotic' under the title — each one or two words, Title Case, describing the vibe of their relationship like a catalogue would. At least one should be a little funny.",
      example: "Romantic",
    },
    ...episodeFields(),
    {
      path: "reasons",
      label: "Top 10 reasons",
      kind: "list",
      max: 10,
      itemMax: 60,
      required: true,
      guide:
        "The 'Top 10 Reasons I Love You Today' rail. Return EXACTLY TEN items — ten separate reasons, never fewer — each printed as a poster title next to a giant numeral, number 1 first. Each reason is written to them in the second person, under 60 characters, no emoji, and is built around one concrete thing: an object, a place, a food, a time of day, a gesture or a habit. At least seven of the ten must use a detail that actually appears in the story; the rest may be small invented details that fit these two people, equally concrete. A reason that would be true of any partner is wrong — compliments about looks, smiles or 'making me happy' do not count. Good reasons read like: 'You save me the last slice of Farmhouse', 'You still have the ticket from our first film', 'You text me the train number every Friday'. Number 1 is the most sincere; the rest mix tender and funny.",
      example: "You always hand me the left earbud",
    },
    {
      path: "insideJokes",
      label: "Inside jokes rail",
      kind: "list",
      max: 6,
      itemMax: 50,
      required: true,
      guide:
        "The 'Critically Acclaimed Inside Jokes' rail — six fake movie or spin-off titles, each one an inside joke, running bit or petty feud from their story, named like a real film, sequel or true-crime docuseries — use the grammar of real titles: a subtitle after a colon, '(Director's Cut)', 'Part II', 'The Musical', 'A Custody Battle'. Title Case, under 50 characters each, no emoji, and no two built the same way.",
      example: "Who Finished The Nutella?",
    },
    {
      path: "plans",
      label: "Coming Soon",
      kind: "list",
      max: 5,
      itemMax: 50,
      required: true,
      guide:
        "The 'Coming Soon' rail — five things they plan or dream of doing together, each a short upcoming-title line: a trip, a pet, a home, a skill, growing old. Use plans named in the story first, then plausible ones that fit them. Sentence case, under 50 characters each, no emoji.",
      example: "Goa, finally, no phones",
    },
    {
      path: "finaleText",
      label: "The finale",
      kind: "longtext",
      max: 520,
      required: true,
      guide:
        "The text that plays over black at the end of the last episode, revealed a line at a time before the credits roll. Three short paragraphs separated by blank lines, under 520 characters. Drop the catalogue voice entirely and speak plainly, first person to them: every version of their story ends in the same place, and that is the point. Nothing that obliges a reply.",
      example:
        "Six episodes in and I still get nervous before you reply.\n\nEvery version of this story ends up in the same place — with you.\n\nThat's not a plot hole. That's the whole show.",
    },
    {
      path: "finaleQuestion",
      label: "The button after the finale",
      kind: "text",
      max: 32,
      required: true,
      guide:
        "The label of the single button that appears when the finale settles, before the credits. Two to five words, lowercase, a soft question about continuing the show (renewing, the next season, another episode) that only has one answer. It must be worded differently from the letter's question below.",
      example: "renew for another season?",
    },
    {
      path: "letter",
      label: "The letter",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The private love letter that waits in an envelope in the corner of the app — the most important text on the page. The envelope already prints 'Dear <their name>,' above it and signs it with the sender's name below, so do NOT open with a greeting or their name and do NOT sign off — start straight with the first sentence and end on the last one. Four paragraphs separated by blank lines, each paragraph two or three full sentences — at least 650 characters in total and no more than 1000. Paragraph one: a single light wink at the streaming conceit, in your own words. Paragraph two: one concrete shared memory from the story, told with a sensory detail (what it looked, sounded or tasted like). Paragraph three: something the sender has never quite said out loud. Paragraph four: a quiet promise about the future, tied to one of their plans. First person, simple warm English, no lists, no emoji, no rhymes, nothing that demands a reply.",
    },
    {
      path: "lockQuestion",
      label: "The question before the letter",
      kind: "text",
      max: 60,
      required: true,
      guide:
        "A playful one-line yes/no question they must answer before the letter opens, phrased in streaming-app language and aimed at the sender — something only a yes makes sense for. Build it from one of these ideas, whichever suits their story best: still watching, a rewatch, the next season, never skipping the intro, keeping them on their list, a sequel, the remote. Mention one detail from their story if it fits. Under 60 characters, ending in a question mark, no emoji.",
    },
    {
      path: "lockAnswer",
      label: "The yes button",
      kind: "text",
      max: 24,
      required: true,
      guide:
        "The label of the only button that answers the question above and opens the letter — a short, eager yes that answers that exact question in its own words (not a generic 'yes'). Two to five words, under 24 characters, lowercase, may end with one emoji.",
    },
  ],
};
