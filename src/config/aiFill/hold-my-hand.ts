import type { AiFillTemplateSchema } from "./types";

/**
 * Hold My Hand — AI form-fill schema.
 *
 * `mf` is `HoldData` (client `app/(templates)/hold-my-hand/components/types.ts`).
 *
 * THE INTERACTION, because every guide below depends on it: the recipient must
 * press and physically hold one spot on a dark screen for `durationMs` — 60s by
 * default. While they hold, a photo of them comes slowly into focus, `holdLines`
 * surface one at a time as progress passes each line's `atMs`, and a
 * `ghostFragment` appears for every 12 seconds accumulated. The instant they let
 * go, progress DRAINS backwards, the fragments go with it, and the next unused
 * `releaseLine` appears — indexed by how many times they have let go, so line 1
 * is the first time, line 2 the second. Reaching 100% reveals `letter`, one line
 * at a time, in handwriting. In "evil" mode a bait line is planted five seconds
 * from the end telling them they can stop; letting go there costs 5× drain.
 *
 * The `atMs` timestamps below are the seeded ones against the default 60s hold,
 * and they are quoted in each guide because WHERE a line lands is the entire
 * content of that line.
 *
 * Deliberately NOT declared, and why:
 *  - `photoUrl` — media (rule 1); it is also the whole point that it is a photo
 *    of the actual recipient.
 *  - `senderName` / `recipientName` — names the sender types in the composer.
 *  - `durationMs`, `mode`, `hands` — the sender's choices about how hard this
 *    is and how sincere it is. `mode` in particular decides whether line 11 is
 *    a kindness or a trap, and that is not the model's call.
 *  - `holdLines[i].atMs` — the seeded timings are already spaced for a 60s hold
 *    and moving them desynchronises every line from the copy written for it.
 */
export const holdMyHand: AiFillTemplateSchema = {
  slug: "hold-my-hand",
  premise:
    "The recipient opens a dark page and has to press and physically hold one spot on the screen, usually for a minute. As they hold, a photograph of them comes into focus, short lines surface one at a time, and fragments of a letter drift up behind the picture; the moment they let go everything drains backwards and a line about letting go appears. Hold all the way to the end and the full letter is revealed — so the copy is a voice keeping somebody company through a minute of effort, spoken quietly, in lowercase, and it must never make holding on feel like a debt or letting go feel like a failure.",
  audience: "partner",
  fields: [
    {
      path: "holdLines[0].text",
      label: "Hold line — 3s",
      kind: "text",
      max: 60,
      guide:
        "The first line, three seconds in, the moment they realise they actually have to hold this. Lowercase, under 60 characters, and almost nothing — an acknowledgement rather than a sentence. It sets the register for the whole page: quiet, present, unhurried.",
      example: "okay. hold.",
    },
    {
      path: "holdLines[1].text",
      label: "Hold line — 8s",
      kind: "text",
      max: 60,
      guide:
        "Eight seconds in. They are still there and the sender has noticed. Lowercase, under 60 characters. Notice them; do not thank them, and do not tell them how long is left.",
    },
    {
      path: "holdLines[2].text",
      label: "Hold line — 14s",
      kind: "text",
      max: 70,
      guide:
        "Fourteen seconds. The first line with real warmth in it — say something about the plain physical fact of their hand being on the glass. Lowercase, under 70 characters. Specific to them if the sender's story gives you anything; otherwise plain is fine.",
    },
    {
      path: "holdLines[3].text",
      label: "Hold line — 20s",
      kind: "text",
      max: 70,
      guide:
        "Twenty seconds, a third of the way. A small aside about how far they have got. Lowercase, under 70 characters. Wry, never a dare — do not compare them to anyone else, do not suggest most people would have quit, and do not challenge them to keep going.",
    },
    {
      path: "holdLines[4].text",
      label: "Hold line — 26s",
      kind: "text",
      max: 70,
      guide:
        "Just under halfway. The sender admitting, a little sheepishly, that they are counting. Lowercase, under 70 characters. This is the line where the person behind the page shows through, so let it be slightly embarrassing to have written.",
    },
    {
      path: "holdLines[5].text",
      label: "Hold line — 33s",
      kind: "text",
      max: 30,
      guide:
        "Past halfway, where holding genuinely starts to be work. The shortest line on the page — one or two words, lowercase, under 30 characters. Not an instruction and not a plea; closer to somebody saying something under their breath.",
      example: "don't.",
    },
    {
      path: "holdLines[6].text",
      label: "Hold line — 38s",
      kind: "text",
      max: 60,
      guide:
        "Thirty-eight seconds. Name the difficulty out loud instead of pretending it is not happening — acknowledging that this bit is hard is what makes the page feel honest. Lowercase, under 60 characters.",
    },
    {
      path: "holdLines[7].text",
      label: "Hold line — 44s",
      kind: "text",
      max: 40,
      guide:
        "Forty-four seconds. Almost. Lowercase, under 40 characters — short, because there is not much air left in the minute.",
    },
    {
      path: "holdLines[8].text",
      label: "Hold line — 49s",
      kind: "text",
      max: 80,
      guide:
        "Eleven seconds from the end. Something that says the sender can wait exactly as long as this takes — patience offered, not asked for. Lowercase, under 80 characters. This is the longest line in the back half; let it breathe.",
    },
    {
      path: "holdLines[9].text",
      label: "Hold line — 52s",
      kind: "text",
      max: 60,
      guide:
        "Fifty-two seconds. Quiet and close to the end. Make this one about them rather than about the timer — the photo is nearly in full focus by now and the line should be looking at it. Lowercase, under 60 characters.",
    },
    {
      path: "holdLines[10].text",
      label: "Hold line — 55s (the bait slot)",
      kind: "text",
      max: 60,
      guide:
        "Five seconds from the end, and structurally the most important line on the page: in 'evil' mode this exact slot is the bait — the line that tells them they may stop, five seconds early, where letting go costs five times the drain. Write it as a genuine, gentle release ('okay, you can let go now'). Lowercase, under 60 characters. Whether it turns out to be a kindness or a trap is decided by a switch the sender flips, not by you, so write it kindly either way and never wink at the trick.",
    },
    {
      path: "holdLines[11].text",
      label: "Hold line — 58s",
      kind: "text",
      max: 40,
      guide:
        "Two seconds left — the last thing said before the letter opens. Lowercase, under 40 characters. Tiny. It should feel like holding a breath rather than counting down.",
    },
    {
      path: "releaseLines",
      label: "Lines when they let go",
      kind: "list",
      max: 8,
      itemMax: 90,
      guide:
        "The lines shown when they let go, used strictly in order: the first is what the sender says the first time they let go, the second the second time, and so on. Write up to eight. Lowercase, short, patient — the voice of somebody who is still there, not somebody who has been wounded. This is the field most likely to go wrong, so be explicit with yourself: never scold, never keep score, never say or imply that they always leave, that they gave up, or that letting go means anything at all about how much they care. Let the later lines get gentler rather than sharper. 'come back.' is the whole register, and under 90 characters each.",
    },
    {
      path: "ghostFragments",
      label: "Ghost fragments",
      kind: "list",
      max: 4,
      itemMax: 90,
      guide:
        "Low-opacity fragments that surface behind the photo, one for every twelve seconds of progress, and that drain away again if they let go. Read in order, the four of them should form one broken sentence that hints at the letter without giving any of it away — each item is a clause, not a sentence. Lowercase, no full stops, under 90 characters each. They are glimpsed rather than read, so keep them short enough to take in at a glance.",
      example: "there is a version of this",
    },
    {
      path: "letter",
      label: "The letter",
      kind: "longtext",
      max: 1000,
      required: true,
      guide:
        "The letter revealed only at 100%, printed one line at a time in handwriting. Blank lines separate paragraphs, so write three or four short ones. This is the payoff for a minute of actual physical effort, so it has to be worth the minute: plain, specific to their story, and honest about why the sender wanted their undivided attention badly enough to build this. Say what the holding was for. It must never turn the effort into a debt — no 'you owe me', no 'now you know how it feels to wait', no asking them for anything in return. End it somewhere soft; they have just been holding their arm up for sixty seconds.",
    },
  ],
};
