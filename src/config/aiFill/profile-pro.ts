import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * profile-pro ("Endorsements") — a relationship rendered as a professional
 * career profile, cloned down to the seams of the genre.
 *
 * Paths resolve against `ProfileProData` in
 * client/app/(templates)/profile-pro/components/types.ts, held as `mf` in
 * useProfileEditor.ts. 40 fields (the limit): every text leaf the page shows.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 *
 * `recommendations` and every skill's endorsement COUNT are earned: they arrive
 * from real friends through the contributor links and the moderation queue. A
 * model that invented a glowing reference signed "Sneha" would be fabricating a
 * quote from a named person. The sender's own recommendation IS here — it is
 * the main `letter`.
 *
 * Media (photo, banner, memory pictures) is never declared (rule 1).
 *
 * ── LIST FIELDS SPLIT CLIENT-SIDE ─────────────────────────────────────────────
 *
 * `skills`, `certifications` and `languages` are flat string lists (no
 * array-of-objects kind). `applyFilled` in useProfileEditor.ts maps them back:
 * certifications and languages split on the first colon. Experience bullets
 * are a list per chapter.
 */

const CHAPTERS: { job: string; role: string; company: string; duration: string; bullet: string }[] = [
  {
    job: "the CURRENT relationship role (what they are to the sender now)",
    role: "Girlfriend",
    company: "Sharma & Sons",
    duration: "Mar 2023 – Present",
    bullet: "Led cross-functional alignment on where to eat",
  },
  {
    job: "the role BEFORE that (best friend, situationship, the talking stage, colleague…)",
    role: "Best Friend",
    company: "Sharma & Sons",
    duration: "Nov 2021 – Mar 2023",
    bullet: "Maintained plausible deniability for 16 months",
  },
  {
    job: "the very FIRST chapter — how and where they met, before anything happened",
    role: "Girl Who Sat Two Rows Ahead",
    company: "Christ University",
    duration: "Aug 2019 – Nov 2021",
    bullet: "Zero direct communication; 100% brand awareness",
  },
];

const chapterFields: AiFillField[] = CHAPTERS.flatMap((c, i) => [
  {
    path: `experience[${i}].role`,
    label: `Chapter ${i + 1} — job title`,
    kind: "text" as const,
    max: 60,
    required: true,
    guide: `The job title for ${c.job}, written exactly like a job title on a professional profile (title case, 1 to 5 words, no punctuation). The relationship role, taken from the story, stated with a straight face.`,
    example: c.role,
  },
  {
    path: `experience[${i}].company`,
    label: `Chapter ${i + 1} — company`,
    kind: "text" as const,
    max: 60,
    required: true,
    guide: i === 0
      ? `The "company" for the CURRENT chapter: a playful firm name for their life together — built from the sender's or recipient's surname, their home, or a running joke ("Sharma & Sons", "Flat 4B Pvt Ltd", "The Maggi Collective"). 1 to 5 words. Never a real multinational brand, and not the place from an earlier chapter.`
      : `The "company" for chapter ${i + 1}: the place or institution from the story where this chapter happened (a college, an office, a city, a club, a café). Real-sounding and specific to THIS couple, 1 to 5 words. Never a real multinational brand.`,
    example: c.company,
  },
  {
    path: `experience[${i}].duration`,
    label: `Chapter ${i + 1} — dates`,
    kind: "text" as const,
    max: 40,
    required: true,
    guide: `Month-year range for chapter ${i + 1}, ALWAYS formatted with three-letter months, "Mon YYYY – Mon YYYY" (e.g. "Aug 2019 – Nov 2021"; if the story gives only a year, pick a plausible month), or "Mon YYYY – Present" for the current chapter. Never a bare year. Use dates from the story when there are any; otherwise pick plausible ones that run in order (chapter 3 earliest, chapter 1 ending in Present).`,
    example: c.duration,
  },
  {
    path: `experience[${i}].bullets`,
    label: `Chapter ${i + 1} — achievements`,
    kind: "list" as const,
    max: 4,
    itemMax: 110,
    required: true,
    guide: `2 to 4 résumé bullet points for chapter ${i + 1}, each a real moment or habit from the story rewritten as a corporate achievement (action verb first, a metric where it's funny: "by 12% QoQ", "with a 4-minute average response time"). Under 90 characters each, no full stop at the end, no bullet symbol.`,
    example: c.bullet,
  },
]);

const PHOTO_JOBS = [
  "the earliest memory in the story",
  "a date or an outing",
  "a trip, a place or a season",
  "a quiet, ordinary day together, or 'us, now'",
];

const photoFields: AiFillField[] = PHOTO_JOBS.flatMap((job, i) => [
  {
    path: `photos[${i}].caption`,
    label: `Memory ${i + 1} — caption`,
    kind: "text" as const,
    max: 40,
    guide: `Caption for featured memory ${i + 1} (${job}). Lowercase, 2 to 5 words, under 32 characters, no full stop — like a label written under a photo. Different from every other caption and specific (a place, food or moment from the story) — never generic phrases like "ordinary day" or "us together".`,
    example: i === 0 ? "the first sunset" : "date night, round 1",
  },
  {
    path: `photos[${i}].note`,
    label: `Memory ${i + 1} — little note`,
    kind: "text" as const,
    max: 180,
    guide: `The note that opens with featured memory ${i + 1} (${job}). One or two warm sentences to "you", under 150 characters, with one concrete detail from the story. This is the sender speaking sincerely — not the corporate voice.`,
    example: "You said the sky looked like mango lassi. I have not stopped thinking about it.",
  },
]);

export const profilePro: AiFillTemplateSchema = {
  slug: "profile-pro",
  audience: "partner",
  premise:
    "This page is a pixel-perfect parody of a professional-network profile, made as a gift: the recipient's partner rendered as a career. It has a cover photo, a round photo in an '#OPENTOFOREVER' frame, a headline, About, Featured memories, Activity posts, an Experience timeline where each relationship chapter is a job, Education, Licenses & certifications, Skills that friends endorse, Languages — and a main letter that arrives as a message and opens as a formal recommendation letter from the sender. Everything corporate is written in flat, competent, faintly self-promotional business register about domestic life and never winks; the memory notes and the letter are where the sender is sincere.",
  forbiddenOutput: [
    ["Linked", "In"].join(""),
    ["Linked", " In"].join(""),
    ["Micro", "soft"].join(""),
    "Indeed",
    "Naukri",
    "Glassdoor",
    "Upwork",
    "Google",
    "Meta",
    "Facebook",
    "Amazon",
    "Apple",
    "Infosys",
    "TCS",
    "Wipro",
    "Accenture",
    "Deloitte",
    "McKinsey",
  ],
  fields: [
    {
      path: "person.name",
      label: "Their name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The recipient's name as it appears at the top of a profile: first name, plus a surname if the sender gave one. Use exactly the name the sender used for them.",
      example: "Meera Sharma",
    },
    {
      path: "senderName",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The sender's first name, how they sign off. They sign the recommendation letter and appear as the one '1st' connection.",
      example: "Kabir",
    },
    {
      path: "person.headline",
      label: "The headline",
      kind: "text",
      max: 100,
      required: true,
      guide: "The line directly under their name. Two or three roles separated by ' | ', written as job titles, each a real trait from the story. The first sounds like an actual job; the rest land the joke, completely straight. Under 70 characters. Never a pun on their name.",
      example: "Professional Girlfriend | Serial Overthinker | Chai Enthusiast",
    },
    {
      path: "person.location",
      label: "Location",
      kind: "text",
      max: 60,
      guide: "Their city in 'City, State, Country' form, from the story. If the story names no place, use a city implied by it; never leave it generic like 'Earth'.",
      example: "Bengaluru, Karnataka, India",
    },
    {
      path: "person.openTo",
      label: "Open to",
      kind: "text",
      max: 40,
      guide: "Completes the grey box 'Open to …'. One short lowercase phrase, under 28 characters, flatly stated and built from a SPECIFIC habit in the story (a food, a place, a thing they always do) — never the stock phrase 'being right'. Do not repeat the words 'open to'.",
    },
    {
      path: "person.connections",
      label: "Connections line",
      kind: "text",
      max: 36,
      guide: "The connection count under the location, as free text. The joke: exactly one connection matters. '1 connection' followed by a short dry parenthetical in the recipient's voice that nods to the sender (e.g. who he is to her) — under 34 characters.",
    },
    {
      path: "about",
      label: "About",
      kind: "list",
      max: 3,
      itemMax: 400,
      required: true,
      guide: "Two or three paragraphs for the About card, first person as the recipient, in the register people use to describe their career — measured, structured, faintly self-promotional — but entirely about the relationship and their real traits from the story. 2 to 4 sentences each. Do not slip into a love letter.",
      example: "Results-driven partner with 3+ years of experience in a fast-paced household environment. Proven track record of remembering things he was also present for.",
    },
    ...chapterFields,
    {
      path: "education[0].school",
      label: "Education — school",
      kind: "text",
      max: 80,
      required: true,
      guide: "Their real college or school if the story names one; otherwise a deadpan invented institution about how they learned to handle the sender ('The School of Knowing Before He Says It'). Under 60 characters.",
      example: "Christ University",
    },
    {
      path: "education[0].degree",
      label: "Education — degree",
      kind: "text",
      max: 90,
      guide: "The degree line, formatted like a real one, with a straight-faced twist after a middle dot tying it to the sender. Under 70 characters.",
      example: "B.A. Psychology · Applied to one person only",
    },
    {
      path: "education[0].years",
      label: "Education — years",
      kind: "text",
      max: 20,
      guide: "Year range 'YYYY – YYYY' that fits the rest of the timeline.",
      example: "2019 – 2022",
    },
    {
      path: "education[0].note",
      label: "Education — thesis note",
      kind: "text",
      max: 160,
      guide: "One line under the degree: a thesis title or activity, deadpan academic register about a real habit of theirs from the story. Under 120 characters.",
      example: "Thesis: 'He Is Fine, He Is Just Like That' — a longitudinal study, sample size 1.",
    },
    {
      path: "skills",
      label: "Skills",
      kind: "list",
      max: 10,
      itemMax: 40,
      required: true,
      guide: "8 to 10 skill labels, title case noun phrases, no punctuation, no numbers. Mix genuinely admirable traits with deadpan ones from the story in no deliberate order — a real skill and an absurd one in identical rows is the joke. Each under 32 characters.",
      example: "Being Right",
    },
    {
      path: "certifications",
      label: "Licenses & certifications",
      kind: "list",
      max: 3,
      itemMax: 100,
      guide: "2 or 3 items, each EXACTLY 'Credential Name: Issued by Someone' with one colon. A formal credential for something they really do; the issuer is themselves, the sender, a family member or 'Four Years of Fieldwork'. Under 80 characters.",
      example: "Certified in Reading My Mind: Issued by Herself",
    },
    {
      path: "languages",
      label: "Languages",
      kind: "list",
      max: 4,
      itemMax: 70,
      guide: "3 or 4 items, each 'Language: Proficiency'. Start with the real languages they likely speak (from the story's city/names, e.g. Hindi, English, Tamil) with real proficiency levels ('Native or bilingual proficiency', 'Full professional proficiency'), then one or two joke 'languages' from the story ('Sarcasm: Native', 'His Silences: Professional working proficiency').",
      example: "Sarcasm: Native, with regional variations",
    },
    {
      path: "posts[0].text",
      label: "Post 1 — the announcement",
      kind: "longtext",
      max: 600,
      required: true,
      guide: "An Activity post in the recipient's voice, parodying the 'I'm happy to share that I'm starting a new position…' announcement: the new position is their relationship role, with thanks to their 'manager' (the sender) using a real detail from the story. 3 short paragraphs separated by blank lines (\n\n), one or two emoji, ending with 3 lowercase hashtags on their own line. 250 to 450 characters.",
      example: "I'm happy to share that I've been promoted to Girlfriend (Full-time, Permanent)! 🎉",
    },
    {
      path: "posts[1].text",
      label: "Post 2 — the thought-leadership post",
      kind: "longtext",
      max: 600,
      required: true,
      guide: "A second post parodying a 'what this taught me about leadership' post, built on a real running argument or habit from the story, a hook line, then 'What this taught me about leadership:' and a numbered list of 3 lessons on separate lines (\n), then 'Agree? 👇' and 2 hashtags. 250 to 450 characters. Different joke from post 1.",
      example: "After 4 years of rigorous A/B testing I can confirm: fan speed 3 is objectively correct.",
    },
    ...photoFields,
    {
      path: "letter",
      label: "The recommendation (main letter)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The sender's main letter, which opens as a formal recommendation letter signed by them. AT LEAST 700 characters (up to 1100), 5 or 6 short paragraphs separated by blank lines, straight to them ('you'). Open with their name on its own line followed by a comma. First paragraph: frames it as an official recommendation, on the record. Middle paragraphs: formal-recommendation phrasing ('I have worked alongside you for N years across several roles…', 'consistently exceeded expectations') that becomes sincere and tender, with at least four concrete details from the story (places, habits, things they said). A 'Strengths: … Areas for improvement: none I'd want fixed' line is welcome in your own words. End with a plain, specific promise tied to a detail from the story, phrased like the closing line of a recommendation, entirely in your own words. Do not sign it.",
    },
    {
      path: "lockQuestion",
      label: "Message request question",
      kind: "text",
      max: 110,
      guide: "Shown on a 'message request' card before the letter opens (the Ignore button runs away). A playful yes-question in professional-network dialect (connect, accept, endorse, offer letter, interview) that names the sender AND slips in one detail from the story, under 80 characters, ending with '?'. Fresh wording.",
      example: "Accept a permanent full-time offer, reporting to Rohan?",
    },
    {
      path: "lockAnswer",
      label: "Accept button",
      kind: "text",
      max: 24,
      guide: "The accept button label: 1 to 3 words starting with 'Accept', plus one emoji.",
      example: "Accept 💙",
    },
    {
      path: "contributorPrompt",
      label: "The note for their friends",
      kind: "text",
      max: 200,
      guide: "What their friends see when the sender asks them to endorse skills: one or two warm, plain sentences from the sender to those friends (not the corporate voice), naming the recipient, mentioning one detail friends would recognise from the story, and saying it takes one tap. Under 170 characters. Write it fresh.",
    },
  ],
};
