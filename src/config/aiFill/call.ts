import type { AiFillField, AiFillTemplateSchema } from "./types";

/**
 * call — "Sacch", a parody caller-ID: an incoming call from the sender, ringing
 * on the recipient's phone.
 *
 * Paths resolve against `CallData` in
 * client/app/(templates)/call/components/types.ts, held as `mf` in
 * useCallEditor.ts. `caller` is the SENDER (their name flashes on the screen);
 * `recipient` is whose phone is ringing.
 *
 * Media is absent by construction: `caller.photoUrl`, `photos[].url` and the
 * crops are the sender's uploads. The photo captions and notes ARE declared —
 * they land on the sample photos in the form and stay put when the sender taps
 * "change photo" to swap in their own.
 *
 * Three leaves are plain-string lists the client normalises
 * (`normaliseAiCallData`): `tags` (labels; the counts come from the demo
 * ladder), `message` (one spoken line each) and `callLog`
 * (`kind | day | time | duration | note`).
 */

const NO_BRAND =
  " Never name a real app, phone brand or telecom company — the app on this page is called Sacch and that is the only product name allowed.";

const photoCaption = (i: number): AiFillField => ({
  path: `photos[${i}].caption`,
  label: `Memory ${i + 1} — caption`,
  kind: "text",
  max: 40,
  guide:
    `The caption on shared-media photo ${i + 1}, printed over the photo in a small grid and dropped into the live call as "shared a photo". 2–5 words, lowercase, like a chat caption. ` +
    (i === 0
      ? "Photo 1 is the big tile: name the moment the story treats as the start (first date, first trip, first meeting)."
      : "Each caption must name a DIFFERENT specific moment, place or in-joke from the story — never repeat an idea used by another photo. If the story runs out of moments, use an ordinary shared thing (a café, a long call, a wallpaper)."),
  example: i === 0 ? "the first chai" : undefined,
});

const photoNote = (i: number): AiFillField => ({
  path: `photos[${i}].note`,
  label: `Memory ${i + 1} — little note`,
  kind: "longtext",
  max: 280,
  guide:
    `The little note that opens with photo ${i + 1} as a chat bubble from the sender. One or two sentences, first person, addressed to the recipient as "you", about the exact moment in that photo's caption — a concrete detail (what was said, eaten, worn, the time on the clock). Warm, a little funny, understated — no exclamation marks, no 'such fun', 'best time ever' or 'so adorable', never generic. Under 220 characters.`,
});

export const call: AiFillTemplateSchema = {
  slug: "call",
  audience: "partner",
  premise:
    "A parody caller-ID app called Sacch. The recipient's phone rings with a full-screen incoming call FROM THE SENDER: their name, a joke number, a gold 'verified' badge, spam risk 0%, crowd tags ('saved by 2,481 people as Pick Up. Now.'), and a pinned call reason. Answering plays what the sender says as a live transcript while their photos drop in; afterwards comes the caller's profile — shared media (memories with notes), a voicemail (the main letter), 'who viewed your profile', and a call history where the comedy lives. Play the phone chrome dead straight, Gen-Z and dry; save the sincerity for the spoken lines, the photo notes and the letter.",
  forbiddenOutput: [
    ["True", "caller"].join(""),
    "Jio",
    "Airtel",
    "Vodafone",
    "BSNL",
    "WhatsApp",
    "iPhone",
    "FaceTime",
  ],
  fields: [
    {
      path: "caller.name",
      label: "Your name (the caller)",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The SENDER's name as it flashes on the recipient's ringing screen at 36px. First name, or first + last if the story uses it. Under 22 characters so it never wraps.",
      example: "Meera Sharma",
    },
    {
      path: "recipient.name",
      label: "Their name (whose phone rings)",
      kind: "text",
      max: 40,
      required: true,
      guide: "The RECIPIENT's first name — the person the page is for, as the sender actually calls them (a pet name if the story uses one).",
      example: "Karan",
    },
    {
      path: "savedAs",
      label: "Saved in their phone as",
      kind: "text",
      max: 32,
      guide:
        "How the recipient has the sender saved in their contacts — the sender's first name or pet name plus 1–3 emojis that mean something from the story (a food, an in-joke, a nazar 🧿). Under 24 characters.",
      example: "Meera 🍓🧿",
    },
    {
      path: "callReason",
      label: "Call reason (pinned on the ringing screen)",
      kind: "text",
      max: 80,
      guide:
        "The 'Call reason' pinned on the incoming call — the one line that makes them pick up. First person, lowercase-casual, a little urgent, built on an in-joke or detail from the story, one emoji at most, no exclamation marks. Under 60 characters. Tease, never reveal: if the story has news or a confession, keep it for the letter.",
      example: "not spam. just me, with a very important update 🥹",
    },
    {
      path: "caller.number",
      label: "Phone number",
      kind: "text",
      max: 24,
      guide:
        "The number under the name. Must NOT be a real, dialable number: +91 followed by an obviously invented pattern whose digits hide a date from the story (an anniversary like 1402) or repeated digits. Format '+91 90000 14022'. Never a plausible working mobile number.",
      example: "+91 90000 14022",
    },
    {
      path: "caller.location",
      label: "Location",
      kind: "text",
      max: 60,
      guide: "The location row on the caller-ID card, format 'City, State' — where the sender actually is, taken from the story if it says. Otherwise a plausible Indian city.",
      example: "Lucknow, Uttar Pradesh",
    },
    {
      path: "caller.carrier",
      label: "Carrier",
      kind: "text",
      max: 32,
      guide: "The carrier line: an INVENTED one-word joke network plus the network type, format '<Name> · 5G'. The joke name should nod to the relationship." + NO_BRAND,
      example: "Dil Prepaid · 5G",
    },
    {
      path: "tags",
      label: "Saved-by-others tags",
      kind: "list",
      max: 6,
      itemMax: 36,
      guide:
        "Crowd-sourced caller-ID tags: what friends and family have saved the SENDER's number as, most popular first. Exactly 6 items, each 2–5 words in Title Case, under 28 characters, no emojis, no numbers. Item 1 is the funniest imperative ('Pick Up. Now.'); the rest are specific habits of the sender from the story (always asks if you ate, sends reels at 3 AM, says 'five minutes' for an hour). Dry, affectionate, never mean." +
        NO_BRAND,
      example: "Will Ask If You Ate",
    },
    {
      path: "message",
      label: "What you say when they answer",
      kind: "list",
      max: 6,
      itemMax: 150,
      required: true,
      guide:
        "THE SPOKEN PAYLOAD. After they answer, these lines appear one at a time as a live call transcript, so each item is one spoken beat from the SENDER to the recipient — write it the way people really talk on a late-night call: unhurried, lowercase-casual allowed, no exclamation marks, no announcements. 5 lines, each 40–110 characters. Line 1 reacts to them picking up ('you picked up. took you four rings.'). Lines 2–4 each carry ONE concrete detail from the story (a place, a habit, a time of night) and get more honest as they go. Line 5 lands the feeling in plain words. Do NOT reveal the story's big news or confession here — the voicemail letter carries it; at most hint that there is something ('there's a voicemail waiting, listen to it'). No sign-off line.",
      example: "you still have my charger, by the way. i've stopped asking. i like that you kept it.",
    },
    {
      path: "callLog",
      label: "Call history",
      kind: "list",
      max: 7,
      itemMax: 140,
      required: true,
      guide:
        "The call history between them, newest first. Exactly 6 entries, each written EXACTLY as 'kind | day | time | duration | note' with FOUR pipes. `kind` is one of: missed, incoming, outgoing, rejected. `day` is relative ('Today', 'Yesterday', 'Tuesday', '14 Feb'). `time` is a clock time ('11:47 PM'). `duration` like '4 hrs 12 mins' or '38 mins' — write '-' for missed and rejected calls. `note` is the story behind the call in one dry sentence under 90 characters, from the story (the night before an exam, the call that lasted till sunrise, the one cut because mom walked in). Use at least one missed and one rejected; missed rows render red, so give them the funniest notes. Notes are deadpan: no exclamation marks, no 'together!' greeting-card lines.",
      example: "outgoing | Tuesday | 2:14 AM | 1 min 3 secs | You called to check I'd reached. I'd reached two hours earlier.",
    },
    {
      path: "whoViewed",
      label: "Who viewed your profile",
      kind: "text",
      max: 150,
      guide:
        "The 'Who viewed your profile' line on the caller's profile: the sender confessing how often they check the recipient, written in third person about the sender as a dry app statistic, then a punchline tied to the story (a habit, a city, a time zone, a photo they keep opening). One or two short sentences, under 120 characters, with one specific number.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to your friends",
      kind: "text",
      max: 160,
      guide:
        "Shown to friends who open the tag link: the sender is collecting caller-ID tags for themselves. Ask what the friend has the sender saved as, name the sender, keep it one or two short, playful sentences under 140 characters.",
      example: "Meera is collecting tags for her caller ID. What have you got her saved as?",
    },
    ...[0, 1, 2, 3, 4, 5].map(photoCaption),
    ...[0, 1, 2, 3, 4, 5].map(photoNote),
    {
      path: "letter",
      label: "The voicemail (main letter)",
      kind: "longtext",
      max: 1200,
      required: true,
      guide:
        "The main love letter from the sender to the recipient, delivered as a voicemail that plays back word by word. Line 1 is just the recipient's first name and a comma on its own line ('Karan,'). Then 5 short paragraphs separated by blank lines, AT LEAST 160 and at most 220 words, normal sentence case, no exclamation marks. Paragraph 1 nods to the call (they finally picked up / let it go to voicemail). Paragraphs 2–3 are two concrete memories from the story told with small details (what was said, the weather, the time). Paragraph 4 is what the recipient means to the sender in plain spoken words — and if the story has news, a plan or a confession, it is revealed HERE, not earlier. Paragraph 5 is one or two lines that tie back to calling (not spam, verified, never hanging up first, duration: forever). No sign-off — the page adds it. Heartfelt and specific, never greeting-card language.",
    },
    {
      path: "lockQuestion",
      label: "Question before the voicemail",
      kind: "text",
      max: 90,
      guide: "A playful yes-question the recipient answers before the voicemail plays, built on a specific in-joke or habit from the story (not a generic 'will you pick up'), answerable with one tap. Under 60 characters, ends with a question mark.",
    },
    {
      path: "lockAnswer",
      label: "Answer button",
      kind: "text",
      max: 30,
      guide: "The label on the green answer button for the question above (the red Decline button runs away): a short, teasing yes that fits the question, 1–4 words plus one emoji, under 22 characters.",
    },
  ],
};
