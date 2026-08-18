import type { AiFillTemplateSchema } from "./types";

/**
 * profile-pro — a relationship rendered as a professional career profile.
 *
 * Paths resolve against `ProfileProData` in
 * client/app/(templates)/profile-pro/components/types.ts, held as `mf` in
 * useProfileEditor.ts.
 *
 * ── WHAT IS DELIBERATELY NOT HERE, AND WHY ───────────────────────────────────
 *
 * `recommendations` and every skill's `endorsements` count are EARNED, not
 * written. They arrive from real friends through the contributor links and the
 * moderation queue. A model that invented a glowing reference from "Sneha" would
 * be fabricating a quote and attributing it to a named person the sender knows —
 * that is a different thing from writing a joke, and it is not ours to generate.
 * The counts are likewise the honest output of people tapping a button; a
 * generated 47 would make the one number on the page that means something mean
 * nothing.
 *
 * `experience` and `education` stay in the form because they are the profile's
 * STRUCTURE — role, company, dates and the separator rhythm are what make the
 * thing read as a real profile, and they are also the most personal jokes, which
 * land better when the sender writes them.
 *
 * `photoUrl` and `bannerUrl` are media and could not be declared here even if we
 * wanted them: `FieldKind` has no member for media and the validator rejects any
 * path that looks like one.
 *
 * ── REGISTER ─────────────────────────────────────────────────────────────────
 *
 * Corporate-bland, and never winking. This template is funny because the format
 * is relentlessly serious and the copy states absurd things in the flattest
 * possible business register. A headline that tries to be a joke is far less
 * funny than one that describes a real person in performance-review language.
 *
 * ── TWO FIELDS ARE SPLIT CLIENT-SIDE ─────────────────────────────────────────
 *
 * `skills` and `certifications` are declared as flat string lists because
 * `FieldKind` has no array-of-objects member. `onFilled` in useProfileEditor.ts
 * maps them back onto the real shapes — and for skills it PRESERVES the existing
 * endorsement counts and ids rather than resetting them, so running the fill a
 * second time never wipes what friends already contributed.
 */
export const profilePro: AiFillTemplateSchema = {
  slug: "profile-pro",
  audience: "partner",
  premise:
    "A parody professional-network profile where somebody's partner is rendered as a career. It looks exactly like a serious professional profile: an off-white page, bordered white cards with no shadows, a banner, a large round avatar, a headline, an About section, an Experience list with bulleted achievements, and a Skills section where each skill carries an endorsement count. Their friends then endorse the skills with one tap and write references. The comedy is entirely in the copy and it only works because the design never breaks character — so write like a competent HR document that happens to be about somebody's girlfriend, and never wink at the reader.",
  forbiddenOutput: [
    "Aditi",
    "LinkedIn",
    "Linked In",
    "Microsoft",
    "InMail",
    "Indeed",
    "Naukri",
    "Glassdoor",
    "Monster",
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
    "Goldman Sachs",
  ],
  fields: [
    {
      path: "person.headline",
      label: "The headline",
      kind: "text",
      max: 100,
      required: true,
      guide:
        "The line directly under their name — the single most-read line on the page. Two or three roles separated by a pipe, written as if they were job titles, each one a real trait pulled from the sender's story. The first should sound like an actual job; the ones after it are where the joke lands, delivered completely straight. Never sentimental, never a pun on their name. Under 70 characters reads best.",
      example: "Professional Girlfriend | Serial Overthinker | Chai Enthusiast",
    },
    {
      path: "person.openTo",
      label: "Open to",
      kind: "text",
      max: 80,
      guide:
        "The contents of the small highlighted 'Open to' box under the headline. On a real profile this says something like 'Open to work'. Here it is one short phrase, stated flatly, that is funny because it is true about them. Keep it under 30 characters — it sits in a tinted box and long text wraps badly.",
      example: "being right",
    },
    {
      path: "person.connections",
      label: "Connections",
      kind: "text",
      max: 30,
      guide:
        "The connection count beside their location. This is FREE TEXT and it is never a real number — the joke is that there is exactly one connection that matters. Write it as a count followed by an optional dry parenthetical.",
      example: "1 connection",
    },
    {
      path: "about",
      label: "The About section",
      kind: "list",
      max: 3,
      itemMax: 400,
      required: true,
      guide:
        "Two or three paragraphs in the About card, written in the first person as the person themselves, in the exact register somebody uses when describing their career on a professional profile — measured, faintly self-promotional, structured. The content is entirely about the relationship and their real traits, drawn from the sender's story. The comedy comes from that register applied to domestic life; do not let it slip into a love letter. Each paragraph 2 to 4 sentences.",
      example:
        "Results-driven partner with 3+ years of experience in a fast-paced household environment. Proven track record of remembering things he was also present for.",
    },
    {
      path: "skills",
      label: "The skills",
      kind: "list",
      max: 12,
      itemMax: 40,
      required: true,
      guide:
        "The skill labels, one per item, written exactly as a professional profile lists skills — short noun phrases in title case, no punctuation, no explanation. 8 to 12 of them. Mix genuinely admirable traits with deadpan ones drawn from the sender's story, in no deliberate order: the humour comes from a real skill and an absurd one sitting in identical rows. Never write the endorsement count or any number here; the counts come from their friends. Each label under 30 characters.",
      example: "Being Right",
    },
    {
      path: "certifications",
      label: "Certifications",
      kind: "list",
      max: 4,
      itemMax: 120,
      guide:
        "The certifications card. Each item MUST be written as 'Name: Issuer' with a single colon, because the renderer splits on it. The name is a formal-sounding credential for something they actually do; the issuer is usually themselves or the sender, stated without comment. Keep the whole line under 80 characters.",
      example: "Certified in Reading My Mind: Issued by Herself",
    },
    {
      path: "contributorPrompt",
      label: "The prompt for their friends",
      kind: "text",
      max: 160,
      guide:
        "The line their friends see when they open the endorsement link, before they start tapping skills. One sentence, warm and plain rather than corporate — this is the sender speaking to their friends, not the parody speaking. Say who is collecting and for whom, and make it obvious it takes one tap.",
      example: "Karan is collecting endorsements for Meera. Tap the ones that apply.",
    },
  ],
};
