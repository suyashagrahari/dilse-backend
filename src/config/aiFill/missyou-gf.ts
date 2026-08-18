import type { AiFillTemplateSchema } from "./types";

/**
 * missyou-gf — "Miss You".
 *
 * Paths resolve against `MissYouData` in
 * client/app/(templates)/missyou-gf/components/types.ts, held as `mf` in
 * useMissYouEditor.ts (line 51).
 *
 * Excluded: sinceDate / reunionDate (real timestamps a model cannot know — a
 * wrong goodbye date is a lie on the face of the page), the quiz flip-cards
 * (three interlocking leaves per card whose demo content already reads well),
 * `yourCity` (the editor defaults it to the sender's own detected city, so it is
 * the one city field that is already right without help — `theirCity` is the
 * arbitrary one), and every media leaf (voiceUrl, backgroundMusic,
 * memories[].image, sharePhoto).
 *
 * The city enums are the `label` values of CITY_PRESETS in the same file.
 */
const CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Chennai", "Kolkata", "Hyderabad", "Dubai",
  "London", "Paris", "Berlin", "New York", "Toronto", "Chicago",
  "San Francisco", "Los Angeles", "Sydney", "Melbourne", "Singapore", "Tokyo",
  "Hong Kong", "Doha", "Riyadh", "Kathmandu", "Auckland",
] as const;

export const missyouGf: AiFillTemplateSchema = {
  slug: "missyou-gf",
  audience: "partner",
  premise:
    "This is a long-distance page. It opens as a wax-sealed envelope the recipient has to break open; inside is a letter, two live clocks side by side showing what time it is where each of them is right now, the distance between their cities, a timer counting up from the last goodbye, a lane of polaroid memories with handwritten captions, a scratch-card hiding a secret, and a row of sealed 'Open when…' notes for her hard days. Everything on it exists to make being apart feel survivable, so the whole page must land as comfort rather than as complaint.",
  fields: [
    {
      path: "recipientName",
      label: "Her real name",
      kind: "text",
      max: 40,
      guide:
        "Her actual first name, used in the plainer parts of the page. Short and real — not a title, not a full legal name. If the sender only ever refers to her by a pet name, leave this empty and put that name in the pet-name field instead.",
    },
    {
      path: "senderName",
      label: "His name",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "The name of the person doing the missing — the sender. It prints under the letter's sign-off, so use the short form she'd recognise from his messages, not a full name.",
    },
    {
      path: "petName",
      label: "Pet name on the envelope",
      kind: "text",
      max: 30,
      required: true,
      guide:
        "The name shown large on the sealed envelope and in the greeting — the single most important word on the page, because it's the first thing she sees before anything else loads. It must be the name he genuinely calls her, taken straight from his story: 'my moon', 'jaan', 'bubs', 'trouble'. Keep it under 20 characters so it fits the envelope. If his story never uses one, leave it empty — a generic invented endearment is worse than none, because she will know he didn't write it.",
      example: "little bear",
    },
    {
      path: "coverLine",
      label: "Line on the envelope",
      kind: "text",
      max: 45,
      guide:
        "The small eyebrow line printed on the sealed envelope, above her pet name — the first words she reads, before she has torn anything open. It is the handwriting on the outside of a letter, so it must be short and quiet: 3 to 6 words, under 30 characters, sentence case, no full stop. It should set the hour and the mood rather than deliver any content ('a letter for you', 'from 4,000 miles away', 'read this when it's late'). Do not put her name in it — her name is already the big text directly beneath. Do not make it a plea or a summary of the letter.",
      example: "sent at 2am, as usual",
    },
    {
      path: "letterBody",
      label: "The letter",
      kind: "longtext",
      max: 900,
      required: true,
      guide:
        "The 'I miss you' letter, and the heart of the page — the recipient reaches it right after tearing the envelope open. 400 to 700 characters, 2 to 4 short paragraphs separated by blank lines. Write it in the small hours, in concrete detail: the specific thing he keeps reaching for his phone to tell her, the song that ambushed him, what the distance actually feels like in his day. This is the field most at risk of going wrong — missing someone slides very easily into blame. It must never say she doesn't call enough, never measure who misses whom more, never make her responsible for how he feels, and never end on an ask. Steer it to: this is hard, and it hasn't made me doubt us once, and every day is one closer.",
    },
    {
      path: "signature",
      label: "Sign-off line",
      kind: "text",
      max: 40,
      guide:
        "The short line directly above his name, in handwriting script — 'Always yours,', 'Yours across the ocean,', 'Counting down,'. Three or four words, and it should end with a comma the way a real letter does. Match the warmth of the letter, don't outdo it.",
    },
    {
      path: "theirCity",
      label: "Her city",
      kind: "enum",
      options: CITIES,
      guide:
        "Where she is — this sets the second clock and the 'x km apart' number. Same rule: only from an explicit mention in the story, otherwise leave it empty. The default is a placeholder, and a sender would rather fill this in himself than have the page confidently tell her she's in the wrong country.",
    },
    {
      path: "memories[0].caption",
      label: "Memory caption 1",
      kind: "text",
      max: 60,
      guide:
        "A handwritten caption under the first polaroid in the memory lane. The sender adds his own photos; you write the captions that go with them, so keep them about moments rather than about a specific image you cannot see. Lowercase, fragment not sentence, under 45 characters, the way someone actually scribbles on a photo. Draw on the earliest or most-repeated moment in his story. An emoji at the end is welcome but never required.",
      example: "the day the train was late (thank god)",
    },
    {
      path: "memories[1].caption",
      label: "Memory caption 2",
      kind: "text",
      max: 60,
      guide:
        "Second polaroid caption. Same handwritten register — lowercase fragment, under 45 characters — but a different kind of moment from the first: if caption 1 was a beginning, make this an ordinary day that stuck. Never reuse a phrase from another caption; these are read one after another.",
    },
    {
      path: "memories[2].caption",
      label: "Memory caption 3",
      kind: "text",
      max: 60,
      guide:
        "Third polaroid caption. Reach for something small and funny here — the running joke, the disaster meal, the thing she does that he describes with exasperated affection. Lowercase fragment, under 45 characters.",
    },
    {
      path: "memories[3].caption",
      label: "Memory caption 4",
      kind: "text",
      max: 60,
      guide:
        "Fourth polaroid caption. A place — the café, the rooftop, the route they always walk — named the way the two of them name it, not the way a map would. Lowercase fragment, under 45 characters.",
    },
    {
      path: "memories[4].caption",
      label: "Memory caption 5",
      kind: "text",
      max: 60,
      guide:
        "Fifth polaroid caption. Something quiet and undramatic: doing nothing together, falling asleep on a call, cooking badly. Lowercase fragment, under 45 characters.",
    },
    {
      path: "memories[5].caption",
      label: "Memory caption 6",
      kind: "text",
      max: 60,
      guide:
        "Last polaroid caption, so it's the one the lane ends on. Make it the warmest of the six without becoming a whole sentence. Lowercase fragment, under 45 characters. If his story has run out of real material by now, leave this empty rather than padding the lane with something generic.",
    },
    {
      path: "secret",
      label: "The scratch-card secret",
      kind: "longtext",
      max: 220,
      guide:
        "Hidden under a scratch card she has to rub away with her finger, so it must pay off the effort — this is the one confession he hasn't said out loud yet, or the inside joke only she would understand. One or two sentences, 80 to 180 characters. It should feel like leaning in and lowering his voice. Keep it happy: a plan he's been quietly making, a thing he noticed and never mentioned. Never a heavy confession, never anything that puts her on the spot or asks her to respond.",
      example: "I've already worked out which song is playing when I see you at arrivals. That's all I'll say.",
    },
    {
      path: "openWhen[0].label",
      label: "Open-when note 1 — label",
      kind: "text",
      max: 45,
      guide:
        "The label printed on the front of the first sealed note, always starting with 'open when' in lowercase. This one is for the plainest case: 'open when you miss me'. Under 35 characters, no capital letters, no full stop.",
    },
    {
      path: "openWhen[0].text",
      label: "Open-when note 1 — inside",
      kind: "longtext",
      max: 300,
      guide:
        "What she finds inside the first note, read at the exact moment named on the label — so write directly to her in that moment, not about it. Two or three sentences, 100 to 220 characters. Present tense, physical, comforting: what he'd say if he were in the room. He is allowed to say he misses her too; he is not allowed to make her feel bad for missing him.",
    },
    {
      path: "openWhen[1].label",
      label: "Open-when note 2 — label",
      kind: "text",
      max: 45,
      guide:
        "Label for the second sealed note, covering a harder moment than the first — 'open when you can't sleep', 'open when work is too much', 'open when you're overthinking'. Pick the one his story shows she actually struggles with. Lowercase, under 35 characters, begins with 'open when'.",
    },
    {
      path: "openWhen[1].text",
      label: "Open-when note 2 — inside",
      kind: "longtext",
      max: 300,
      guide:
        "The note for her hardest moment, and the one most worth getting right. 100 to 220 characters. Give her something to do with her hands or her breath, not advice and not a pep talk — steady, close, unbothered by her being a mess. Do not turn it into a reminder of how much he's sacrificing; that flips comfort into debt.",
    },
    {
      path: "openWhen[2].label",
      label: "Open-when note 3 — label",
      kind: "text",
      max: 45,
      guide:
        "Label for the third note, and the light one — 'open when you need a laugh'. Lowercase, under 35 characters, begins with 'open when'.",
    },
    {
      path: "openWhen[2].text",
      label: "Open-when note 3 — inside",
      kind: "longtext",
      max: 300,
      guide:
        "The funny note. Retell one specific ridiculous thing from their story — the actual incident, with the detail that makes it land — in 100 to 200 characters. It must be a story she'd laugh at with him, never one at her expense.",
    },
  ],
};
