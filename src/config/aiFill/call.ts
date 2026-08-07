import type { AiFillTemplateSchema } from "./types";

/**
 * call — "Sacch", an incoming-call screen with a caller-identification card.
 *
 * Paths resolve against `CallData` in
 * client/app/(templates)/call/components/types.ts, held as `mf` in
 * useCallEditor.ts.
 *
 * `caller.photoUrl` and `voiceUrl` are media and absent by construction.
 * `tags` is absent too: the tag and its count are crowd-sourced from her
 * friends through the contributor link, and a model-invented "tagged by 47
 * people" would be a fabricated crowd — the one number on this page that has to
 * be real.
 */
export const call: AiFillTemplateSchema = {
  slug: "call",
  audience: "partner",
  premise:
    "A parody caller-identification screen: her call comes in, and over it sits an ID card reading verified, spam risk 0%, and a crowd-sourced tag her friends submitted. Answering plays the sender's message; beneath it is a call log where the comedy lives — 47 calls today, 3 answered. Every Indian recognises this screen instantly, so the chrome must be played dead straight. The register is clipped and factual, like a utility app, and the sincerity is saved entirely for the message after the call connects.",
  forbiddenOutput: ["Truecaller", "Jio", "Airtel", "Vodafone", "Vi", "BSNL"],
  fields: [
    {
      path: "caller.name",
      label: "Who's calling",
      kind: "text",
      max: 40,
      required: true,
      guide:
        "Her name as it appears on the call screen at 30px. The name he actually has her saved under — first name, or the pet name, whichever is true. Under 25 characters; it is set large and must not wrap.",
      example: "Meera",
    },
    {
      path: "caller.number",
      label: "Phone number",
      kind: "text",
      max: 24,
      guide:
        "The number under the name. Must NOT be a real, dialable number — use an obviously invented pattern with the country code, ideally one that carries a joke in its digits (an anniversary, a repeated digit). Never output a plausible working Indian mobile number.",
      example: "+91 90000 14032",
    },
    {
      path: "caller.location",
      label: "Location",
      kind: "text",
      max: 60,
      guide:
        "The location row on the ID card, in the real format: 'City, State'. Where she actually is, or the joke version of it.",
      example: "Bengaluru, Karnataka",
    },
    {
      path: "caller.carrier",
      label: "Carrier line",
      kind: "text",
      max: 40,
      guide:
        "The small carrier and network line beside the number. Format is '<carrier> · <network>'. The carrier must be INVENTED — never a real telecom brand. A one-word joke name works best.",
      example: "Dil Network · 4G",
    },
    {
      path: "message",
      label: "What he says when she answers",
      kind: "list",
      max: 6,
      itemMax: 200,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD. Once the call connects these lines fade in one at a time, about 800ms apart, so each item is one spoken beat — write them as someone actually talking on the phone, not as prose. 4 to 6 lines, each under 140 characters, short enough to breathe. Start ordinary and get more honest as it goes; the last line should be the one that lands. No jokes here — the whole template has been joking up to this point and the change of register is the payload. Use one concrete detail from the sender's story.",
      example: "I know it's late. I just didn't want to leave it till tomorrow.",
    },
    {
      path: "callLog",
      label: "Call log entries",
      kind: "list",
      max: 8,
      itemMax: 120,
      required: true,
      guide:
        "The recents list under the call. 5 to 8 entries, each written EXACTLY as 'kind | time | note' with two pipes — the renderer splits on them. `kind` must be one of exactly: missed, incoming, outgoing, rejected. `time` is a clock time or a relative one ('3:41 AM', 'Yesterday'). `note` is the joke and must stay under 50 characters. Missed entries render in red, so use them for the funniest lines. An absurd number of calls at an absurd hour is the register — keep it dry and factual, never wistful.",
      example: "missed | 3:41 AM | 47 calls today. 3 answered.",
    },
    {
      path: "contributorPrompt",
      label: "Prompt shown to her friends",
      kind: "text",
      max: 140,
      guide:
        "Shown to friends who open the tag link. The ask is one word from them, so say that plainly — the whole growth loop depends on this reading as trivially easy. Name both of them, and phrase it as a question they will enjoy answering.",
      example: "Karan is collecting tags for Meera. What would you call her?",
    },
  ],
};
