import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * streak — "Streaks", a parody camera-chat app. The recipient opens what looks
 * like their camera app: a viewfinder of the couple's photos, a Chat tab with
 * the sender pinned on top (🔥 streak count, best-friend emoji, "New Snap"),
 * a conversation where the sender's saved lines type themselves in, a
 * friendship profile with Charms, stories/memories made of the photos, a map
 * with both avatars at "their spot", and a main letter that plays as a snap.
 * The daily mechanic: each of them sends one snap + one word a day and the
 * streak grows; a missed day pauses it, never breaks it.
 *
 * Paths resolve against `StreakForm` in
 * client/app/(templates)/streak/components/editorTypes.ts (held as `mf` in
 * useStreakEditor.ts). `nameA` / `handleA` / `zodiacA` are the SENDER; the
 * `B` fields are the person the page is for.
 *
 * Media is absent by construction: `photos[].url`, the crops and the avatar
 * presets are the sender's choices. Photo captions and notes ARE declared —
 * they land on the sample photos in the form and stay when the sender swaps
 * in their own. The check-in log is never authored here.
 */

const NO_BRAND = " The app on this page is called Streaks; that is the only product name used anywhere.";

const WARM =
  " The streak is a sweet habit they share, never a duty: every line should read kindly even on a day one of them nearly forgot.";

const photoCaption = (i: number): AiFillField => ({
  path: `photos[${i}].caption`,
  label: `Memory ${i + 1} — caption`,
  kind: "text",
  max: 40,
  guide:
    `The caption on memory photo ${i + 1}. It prints as the caption bar across the middle of a full-screen snap/story and as the title of a story tile. 2–5 words, lowercase, Gen-Z, one emoji allowed. ` +
    (i === 0
      ? "Photo 1 is the Flashback card: name the moment the story treats as the beginning (first date, the day they met, first trip)."
      : "Each caption must name a DIFFERENT specific moment, place, food or in-joke from the story — never repeat an idea from another photo. If the story runs out of moments, use an ordinary shared thing (a café, a late-night drive, a long call)."),
  example: i === 0 ? "the first chai ☕" : undefined,
});

const photoNote = (i: number): AiFillField => ({
  path: `photos[${i}].note`,
  label: `Memory ${i + 1} — little note`,
  kind: "longtext",
  max: 260,
  guide:
    `The little note under memory photo ${i + 1}, shown over the photo when it's opened. One or two lowercase sentences from the sender to the recipient ("you") about the exact moment in that photo's caption: first one concrete detail from the story (a time, an object, a colour, something one of them said, in quotes if possible), then one small honest feeling. Quiet and dry-funny, like a caption you'd whisper. Under 200 characters.`,
});

const microLine = (i: number): AiFillField => ({
  path: `microLines[${i}]`,
  label: `Weekly note — week ${i + 1}`,
  kind: "text",
  max: 120,
  guide:
    `A one-line note from the sender that unlocks in the chat after ${7 * (i + 1)} days of streak. Written like a text: one sentence, lowercase, under 18 words, ending with a full stop or a single emoji. ` +
    [
      "Week 1: pleased and a little surprised they're both still doing it.",
      "Week 2: point at a specific habit of the recipient from the story (a word they always use, the time they snap, a food).",
      "Week 3: the pleasure of something tiny becoming routine — a different idea from weeks 1–2.",
      "Week 4: about a month in; gestures forward softly, asks for nothing.",
    ][i] +
    WARM,
});

export const streak: AiFillTemplateSchema = {
  slug: "streak",
  audience: "partner",
  premise:
    "A parody camera-chat app called Streaks, dressed exactly like the real thing: the recipient opens a camera with their couple photos as the viewfinder, a chat list where the sender is pinned with a 🔥 streak count and a 💛, a conversation (no bubbles, name labels in red/blue), a friendship profile with 'Charms', memories and stories built from the photos, a map with both avatars standing at the couple's spot, and a main letter that opens as a full-screen snap with a timer ring. Every day each of them sends one snap and one word, and the streak grows; missing a day pauses it, never breaks it. Tone: Gen-Z, dry, lowercase texting energy in the UI copy; sincere and specific in the notes and the letter." +
    NO_BRAND,
  forbiddenOutput: ["Snapchat", "Snap Inc", "Snapstreak", "Snapstreaks", "Bitmoji", "Instagram", "WhatsApp", "TikTok", "iPhone"],
  fields: [
    {
      path: "nameA",
      label: "Your name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The sender's first name or the nickname they go by, exactly as in their story. Shown as the author of the snaps, the saved chats and the letter.",
    },
    {
      path: "nameB",
      label: "Their name",
      kind: "text",
      max: 40,
      required: true,
      guide: "The recipient's name as the sender actually says it — a pet name or short form if the story uses one. It is the pinned chat at the top of the list and the name on the friendship profile.",
    },
    {
      path: "handleA",
      label: "Your username",
      kind: "text",
      max: 24,
      guide: "A believable, cute username for the sender, lowercase, letters/numbers/dots/underscores only, no @, 6–18 characters, built from their name or an in-joke in the story (e.g. name + '.bby', name + '_irl', a food they love). Never a real person's actual handle.",
      example: "ananya.bby",
    },
    {
      path: "handleB",
      label: "Their username",
      kind: "text",
      max: 24,
      guide: "A believable username for the recipient in the same format as the sender's (lowercase, dots/underscores, no @, 6–18 chars), built from their name or a habit/in-joke from the story. Must differ from the sender's.",
      example: "rohan_irl",
    },
    {
      path: "zodiacA",
      label: "Your zodiac sign",
      kind: "enum",
      options: ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"],
      guide: "The sender's zodiac sign ONLY if the story states it or gives their birthday. Otherwise leave it empty — never guess.",
    },
    {
      path: "zodiacB",
      label: "Their zodiac sign",
      kind: "enum",
      options: ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"],
      guide: "The recipient's zodiac sign ONLY if the story states it or gives their birthday. Otherwise leave it empty — never guess.",
    },
    {
      path: "streakDays",
      label: "Days already going",
      kind: "number",
      guide: "How many days the two of them have already kept a daily snap streak, ONLY if the story gives a number. Otherwise leave it empty and the form default stands.",
    },
    {
      path: "startedOn",
      label: "Friends since",
      kind: "date",
      max: 10,
      guide: "YYYY-MM-DD — when they met or got together, ONLY if the story gives a specific date or an exact month and year (use the 1st of the month then). Never a future date. Otherwise leave it empty.",
    },
    {
      path: "mapPlace",
      label: "Your spot on the map",
      kind: "text",
      max: 40,
      guide: "The place where both avatars stand on the map — the couple's own spot from the story (a café, a tapri, a campus corner, a city), lowercase, 2–5 words, starting with 'our' when natural. Never a full street address.",
      example: "our chai tapri",
    },
    {
      path: "chats",
      label: "Saved in chat",
      kind: "list",
      max: 4,
      itemMax: 150,
      guide:
        "3–4 short chat lines from the sender that 'type themselves in' at the top of the recipient's chat, as saved messages. Each is ONE casual text, lowercase, under 120 characters, at most one emoji. Every line must be built around a DIFFERENT concrete noun or event that appears in the story (a habit, a food, a place, a thing they said, a trip) and read like something you'd actually text at 1 am — a tease, a callback, a tiny confession." +
        WARM,
    },
    {
      path: "letter",
      label: "THE MAIN LETTER (the big one)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "THE MAIN LOVE LETTER — the longest, most important text on the page (150–220 words; never a question, never a one-liner). It opens as a full-screen snap: each sentence becomes its own caption, tapped through one by one. Line 1 is just the recipient's first name and a comma on its own line ('Rohan,'). Then 4–5 short paragraphs separated by blank lines, 150–220 words, normal sentence case, no exclamation marks. Paragraph 1 nods to the app/streak (they laughed at streaks, now they're up at 11:58 pm keeping it alive). Paragraphs 2–3 are two concrete memories from the story with small details. Paragraph 4 says plainly what the recipient means to them — and if the story contains news, a plan or a confession, it is revealed HERE. The last paragraph ties back to the daily snap (first snap in the morning, last one at night). No sign-off — the page adds it. Specific, never greeting-card language." +
        WARM,
    },
    {
      path: "lockQuestion",
      label: "Question before the letter",
      kind: "text",
      max: 90,
      guide: "A playful yes-question the recipient answers before the letter opens, built on a specific in-joke or habit from the story (not generic), answerable with one tap. Under 60 characters, lowercase, ends with a question mark.",
      example: "are you snapping me back today?",
    },
    {
      path: "lockAnswer",
      label: "Yes button",
      kind: "text",
      max: 30,
      guide: "The label on the yes button for the question above (the 'no' runs away): a short teasing yes that fits the question, 1–4 words plus one emoji, under 22 characters.",
      example: "obviously 🔥",
    },
    ...[0, 1, 2, 3, 4, 5].map(photoCaption),
    ...[0, 1, 2, 3, 4, 5].map(photoNote),
    {
      path: "letters[0].letter",
      label: "Sealed streak note — unlocks at 30 days (separate from the main letter)",
      kind: "longtext",
      max: 420,
      guide:
        "A SHORT note (2–4 sentences, under 350 characters) that unlocks in the chat once the streak reaches 30 days. It is NOT the main letter and must not reuse its memories. Lowercase texting voice, second person, one small detail the story actually states (if none is left, the daily snap habit itself), playful about the two of them still snapping each other every day." +
        WARM,
    },
    {
      path: "letters[1].letter",
      label: "Sealed streak note — unlocks at 100 days (separate from the main letter)",
      kind: "longtext",
      max: 520,
      guide:
        "A note (3–5 sentences, under 450 characters) that unlocks at a 100-day streak. NOT the main letter. Warmer than the 30-day note, one concrete detail the story actually states that the other texts don't use (never invent an event), second person, opens with '100 days' and one emoji." +
        WARM,
    },
    {
      path: "letters[2].letter",
      label: "Sealed streak note — unlocks at 365 days (separate from the main letter)",
      kind: "longtext",
      max: 560,
      guide:
        "A note (3–5 sentences, under 480 characters) that unlocks after a full year of streak. NOT the main letter. Written now, read a year from now: what is true right now and worth remembering, second person, tender, ending with a small toast to another year." +
        WARM,
    },
    ...[0, 1, 2, 3].map(microLine),
  ],
};
