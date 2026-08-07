import type { AiFillTemplateSchema } from "./types";

/**
 * darling — "My Darling".
 *
 * Paths resolve against `ContentData` in
 * client/app/(templates)/darling/components/types.ts, held as `mf` in
 * useDarlingEditor.ts (line 70).
 *
 * Same data shape as love-gf but a darker, velvet-and-candlelight room rather
 * than a paper scrapbook, so the guides ask for a lower, more intimate register.
 *
 * Deliberately excluded: galleryPhotos[].letter (galleryPhotos is empty in
 * DEMO_CONTENT — writing a letter would create a photo card with no image),
 * quizQuestions / truthDareQuestions / spinItems (interlocking or non-editable
 * leaves), and all photo/music leaves.
 */
export const darling: AiFillTemplateSchema = {
  slug: "darling",
  audience: "partner",
  premise:
    "This is a private, late-night love space someone builds for their partner — deep velvet backgrounds, gold script, a candle-lit feel, with tabs for the letter, photos, music, games and notes. It opens on a hushed welcome overlay with her name, then a long letter on the Home tab; the separate 'Wish' tab is a short framed card, the one line he'd want her to reread.",
  fields: [
    {
      path: "recipientName",
      label: "Her name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The name he actually calls her — the pet name from their story if there is one, otherwise her short first name. It appears on the opening overlay and in the sign-off block, in script, so it should be short and speakable. Never a formal or full legal name. If the story gives you nothing to work from, leave it empty rather than inventing an endearment he has never used.",
      example: "meri jaan",
    },
    {
      path: "senderName",
      label: "How he signs it",
      kind: "text",
      max: 40,
      guide:
        "The name in the sign-off, in his own voice — his name, his initial, or the way he already signs messages to her. Under about 25 characters; it sits in small type beside hers. Nothing that implies she owes him a reply.",
      example: "yours, always — A",
    },
    {
      path: "personalMessage",
      label: "The letter",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The main letter, and the reason the page exists. Write it the way people talk at 1am with the lights off: quiet, unhurried, specific. 3 to 5 short paragraphs separated by blank lines, 400 to 700 characters in total. Build it from the real material in the sender's story — the small habits, the running joke, the night he is clearly thinking of — not from general romance. Because this template is darker and more intimate than the others, understatement lands harder than declaration. Nothing possessive, nothing that keeps score, nothing that makes her feel she owes him anything for this.",
    },
    {
      path: "wishMessage",
      label: "The wish card",
      kind: "longtext",
      max: 320,
      guide:
        "The short framed card on the 'Wish' tab — one thought, two or three sentences, 120 to 250 characters. It is displayed alone with a lot of space around it, so it has to work as a single quotable line rather than a summary of the letter. Say the thing he'd want her to see if she only ever opened one screen. Keep it free of any ask or condition.",
      example: "If I had to explain you to someone, I'd just point at how quiet my head gets.",
    },
    {
      path: "loveDate",
      label: "Their special date",
      kind: "date",
      guide:
        "The date the story names as their beginning, as YYYY-MM-DD. Fill it only from a real date stated in the sender's story. If the story is vague — 'about two years ago', 'that winter' — leave this empty; a wrong anniversary is far worse than a missing one.",
    },
  ],
};
