import type { AiFillTemplateSchema } from "./types";

/**
 * valentine-gf — "Be My Valentine".
 *
 * Paths resolve against `ValentineData` in
 * client/app/(templates)/valentine-gf/components/types.ts, held as `mf` in
 * valentine-gf/page.tsx (line 63) — this template keeps its editor inline in the
 * page rather than in a hook, and its manual flow is the four steps rendered
 * there: Names, Letter, Promises, Photos.
 *
 * `theme` is excluded because no control in page.tsx lets the sender change it
 * (it is hard-set to "romantic" on both load paths), and `photos` is media.
 * `promises` is a plain string[] rendered as the cards on the final tab, capped
 * at 8 by the editor, so it is declared once as a list.
 */
export const valentineGf: AiFillTemplateSchema = {
  slug: "valentine-gf",
  audience: "partner",
  premise:
    "A three-screen Valentine's page: a cover that bursts her name across the screen with roses and hearts floating up, then a long love letter that opens 'My Dearest ___,' and is signed by hand, then a final screen of short promise cards revealed one after another under the heading 'Promises of Love'. It is unapologetically the most romantic and least ironic of the templates — the letter is meant to be read slowly and the promises are meant to be read aloud.",
  fields: [
    {
      path: "recipientName",
      label: "Her name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "Set in huge type on the opening screen and again as 'My Dearest ___,' at the head of the letter. Use the name he actually calls her — a pet name if their story has one, otherwise her short first name. It has to look right very large, so keep it under about 15 characters. Never a formal or full legal name.",
    },
    {
      path: "senderName",
      label: "How he signs it",
      kind: "text",
      max: 40,
      guide:
        "Appears twice: under the letter and again beneath the promises. His name or his usual sign-off to her, under about 25 characters. Because it repeats, keep it simple rather than elaborate.",
      example: "always, R",
    },
    {
      path: "personalMessage",
      label: "The love letter",
      kind: "longtext",
      max: 1000,
      required: true,
      guide:
        "The full Valentine's letter on the middle screen, printed under 'My Dearest [her name],' — do not repeat that greeting, start at the body. 4 to 5 short paragraphs, 500 to 850 characters, separated by blank lines; it renders with the line breaks preserved, so paragraphing is what makes it readable. This is the one template where full-hearted romance is the correct register — but it still has to be HERS: anchor at least two paragraphs in specifics from the sender's story so it can't be forwarded to anyone else. Sign off inside the letter with a Valentine's line rather than a summary. No guilt, no keeping score, no 'I hope you feel the same' — nothing that turns a gift into a question she has to answer.",
    },
    {
      path: "promises",
      label: "Promise cards",
      kind: "list",
      max: 5,
      itemMax: 110,
      guide:
        "The short cards on the final screen, revealed one at a time — give 4 or 5, each a single line under 80 characters. Each one is a separate beat, so no two may share a shape or an opening word, and none should restate the letter. Mix registers deliberately: one plain vow, one that names something specific to them, one that is small and practical, one that is funny. Ending a card with a single emoji suits this template. Every promise must be about what HE will do; never a promise extracted from her, never a condition, and nothing that reads as 'and in return you should'. If the sender's story is too thin for five real ones, write three good ones and stop.",
      example: "I promise to keep pretending I don't know where your keys are, so you keep asking me 🔑",
    },
  ],
};
