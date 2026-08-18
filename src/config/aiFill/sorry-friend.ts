// ─── sorry-friend — AI form-fill schema ──────────────────────────────────────
//
// Editor state: the shared Redux `TemplateData` slot
// (client/store/templateEditSlice.ts → { heading; body; senderName }), written
// by the three MANUAL_STEPS in
// client/app/(templates)/sorry-friend/components/EditPanel.tsx. The greeting
// ("Hey Friend,"), the "Let's Fix This" cards and the emoji all live in
// config.ts and are not addressable.

import type { AiFillTemplateSchema } from "./types";

export const sorryFriend: AiFillTemplateSchema = {
  slug: "sorry-friend",
  premise:
    "This is a three-screen apology card sent to a friend — not a partner: a cover screen with one large handwritten line, a letter screen where one paragraph sits on a card above a signature, and a closing screen headed 'Let's Fix This'. You are writing the message someone sends a friend they let down, in the register two friends actually use with each other — warm, unfussy, and without any romantic language.",
  audience: "friend",
  fields: [
    {
      path: "heading",
      label: "Cover line",
      kind: "text",
      max: 70,
      required: true,
      guide:
        "The one big line on the opening screen, set in a handwritten script. Write what you would text a friend before the long message — an admission, not a plea. Around six to eight words; longer lines wrap badly at this size. One emoji at the end is fine. Keep it friend-register: no 'my love', no hearts, nothing that reads as romantic. Do not phrase it as a demand for a reply.",
      example: "I messed up, and I know it 😔",
    },
    {
      path: "body",
      label: "The letter",
      kind: "longtext",
      max: 700,
      required: true,
      guide:
        "The apology itself — one paragraph, roughly 60 to 110 words, three to five sentences. It has to name the specific thing that happened, taken from the sender's story: what they did, or what they failed to show up for, and why that mattered to this friend in particular. Friendship apologies fail differently from romantic ones — the usual injury is absence, a thing said in front of others, or a confidence broken — so name which one it was. Then say what you understood about it afterwards, and one concrete thing you will do differently. Write in the sender's own language and script; Hinglish stays Hinglish. Hard constraints: do not ask them to forgive you or to reply, do not say the friendship will end if they do not, do not spend the paragraph describing how guilty you feel — that asks the friend to look after the sender, which is backwards here. No romantic phrasing at all. If the story points at something genuinely serious, write it plainly and drop the lightness entirely.",
      example:
        "I bailed on your show, and then I let it sit for two weeks without saying anything, which was worse. You told me in March you were nervous nobody would come, and I still didn't come. I have been the friend who is always slightly late to your things and I don't want to be that. Next one, I'm there early, and I'm not going to disappear when I've messed up.",
    },
    {
      path: "senderName",
      label: "Signed by",
      kind: "text",
      max: 40,
      guide:
        "The sign-off under the letter and again on the closing screen. How this person actually signs off to this friend — a first name, a nickname the group uses, or a short plain phrase. Under about four words. Keep it un-sentimental; a friend's sign-off that is too affectionate reads as trying to buy the apology back.",
      example: "— Ishaan",
    },
  ],
};
