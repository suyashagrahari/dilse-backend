import type { AiFillTemplateSchema } from "./types";

/**
 * love-gf — "Love You Forever".
 *
 * Paths resolve against `ContentData` in
 * client/app/(templates)/love-gf/components/types.ts, held as `mf` in
 * useLoveEditor.ts (line 73).
 *
 * Deliberately excluded: galleryPhotos[].letter (the array is empty in
 * DEMO_CONTENT, so writing a letter would mint a photo card with no image and
 * render a broken <img>), quizQuestions/spinItems/truthDareQuestions (either
 * not editable in EditSheet at all, or made of interlocking leaves — options +
 * correct index, text + type — that a partial write leaves incoherent), and
 * every photo/music leaf.
 */
export const loveGf: AiFillTemplateSchema = {
  slug: "love-gf",
  audience: "partner",
  premise:
    "This is a small private website someone builds for the person they love — a scrapbook-styled app with tabs along the bottom (Home, Wish, Photos, Music, Games, Notes), handwriting fonts, torn-paper edges and hearts drifting up the screen. It opens on a welcome curtain with her name on it, then lands on a long handwritten letter on the Home tab; the Wish tab is a separate, shorter card that reads like the line you'd write inside an actual greeting card.",
  fields: [
    {
      path: "recipientName",
      label: "Her name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The name the sender actually calls her out loud — the pet name from their story if they use one (jaan, Pri, bubu), otherwise her short first name. This is printed on the opening curtain and again as 'My Dearest ___,' above the letter, so it has to be a name a person would say, never a full legal name and never a title. If the story only gives a formal name, shorten it the way people naturally do. Leave empty rather than inventing a nickname the sender never used.",
      example: "Pia",
    },
    {
      path: "senderName",
      label: "How he signs off",
      kind: "text",
      max: 40,
      guide:
        "The signature under the letter, in the sender's own voice. It can be his name, or the way he already signs texts to her ('always yours', 'your idiot', 'A.'). Keep it under about 25 characters — it renders small and bold beneath the message. Do not sign it with anything that asks for something back.",
      example: "your idiot, R",
    },
    {
      path: "personalMessage",
      label: "The love letter (Home)",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The long handwritten letter on the Home tab, opening under 'My Dearest [her name],'. Do not repeat that greeting — start straight into the body. Write 3 to 5 short paragraphs, 400 to 700 characters total, separated by blank lines; it renders as soft flowing text so long walls of prose read badly. Use the specific details from the sender's story — the actual habits, the actual places, the thing only they would find funny — rather than general romantic statements. Warm and plainly said beats poetic. Absolutely nothing that guilts her, keeps score of what he has done for her, or implies she owes him a reply, a visit, or a feeling. It should read like something she can enjoy and put down.",
    },
    {
      path: "wishMessage",
      label: "The wish card",
      kind: "longtext",
      max: 320,
      guide:
        "The short card on the 'Wish' tab — this is the greeting-card line, not a second letter. Two or three sentences, 120 to 250 characters, sitting inside a decorative frame with a lot of white space around it, so brevity is the whole point. It should say the one thing he most wants her to remember, in a different register from the long letter: lighter, more direct, quotable. It must not restate the letter. No conditions, no 'don't forget me', no obligation of any kind.",
      example: "You are the best thing I never planned for. That's the whole message.",
    },
    {
      path: "loveDate",
      label: "Their special date",
      kind: "date",
      guide:
        "The date their story actually names as the beginning — first met, first date, the day they said it back — as YYYY-MM-DD. Only fill this if the sender's story states a real date you can pin down; the page is perfectly fine without it, so leave it empty rather than approximating a year or guessing a month. Never invent an anniversary.",
    },
  ],
};
