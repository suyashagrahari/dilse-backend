import type { AiFillTemplateSchema } from "./types";

/**
 * recharge — "DIL Prepaid", a prepaid recharge flow.
 *
 * Paths resolve against `RechargeData` in
 * client/app/(templates)/recharge/components/types.ts, held as `mf` in
 * useRechargeEditor.ts.
 *
 * `categories`, `plans[].id`, `plans[].categoryId` and `payment.methods[].id`
 * are structural keys the renderer joins on, not prose, so they stay out of the
 * schema — a model rewriting an id silently detaches a plan from its tab.
 *
 * The plan grid is declared as flat lists rather than nested per-plan objects
 * because the recommended plan is the whole screenshot: it is the one thing a
 * sender posts, and it earns a field of its own.
 */
export const recharge: AiFillTemplateSchema = {
  slug: "recharge",
  audience: "partner",
  premise:
    "A parody prepaid-recharge flow: a plan grid where every plan is a joke about the relationship, then a payment page, a processing screen, and a transaction receipt. Every Indian has scrolled this exact grid. It only works if it looks like a boring utility app shipped by someone who did not care — no gradients, no decoration, hard 1px borders. The comedy is 100% in the copy, and the receipt at the end is where the joking stops.",
  forbiddenOutput: [
    "Jio",
    "Airtel",
    "Vodafone",
    "Vi",
    "BSNL",
    "Paytm",
    "PhonePe",
    "Google Pay",
    "GPay",
    "Truecaller",
  ],
  fields: [
    {
      path: "operator.tagline",
      label: "Operator tagline",
      kind: "text",
      max: 60,
      guide:
        "The small line under the invented operator's wordmark in the header. Written like a real telecom slogan — three or four words, faintly corporate, quietly about her.",
      example: "Always connected. Mostly.",
    },
    {
      path: "subscriber.number",
      label: "Number being recharged",
      kind: "text",
      max: 24,
      guide:
        "Shown at 20px in the header as the number being recharged. Must NOT be a real, dialable number — use an obviously invented pattern with the country code, ideally with a date hidden in the digits. Never output a plausible working Indian mobile number.",
      example: "+91 90000 14032",
    },
    {
      path: "subscriber.circle",
      label: "Circle",
      kind: "text",
      max: 40,
      guide: "The telecom 'circle' — really just her city or state, in the flat official register.",
      example: "Bengaluru",
    },
    {
      path: "currentPlan.expiresIn",
      label: "Current plan expiry",
      kind: "text",
      max: 40,
      guide:
        "Shown on the card overlapping the header: how long the current plan has left. '0 days' sets up the note beneath it.",
      example: "0 days",
    },
    {
      path: "currentPlan.note",
      label: "Expiry note",
      kind: "text",
      max: 90,
      guide:
        "The grey line under the expiry, and the first joke on the page. It should undercut the expiry line it sits beneath — the format is a flat correction, delivered deadpan.",
      example: "expires in 0 days. it never expires. bad example.",
    },
    {
      path: "plans",
      label: "Plan rows",
      kind: "list",
      max: 12,
      itemMax: 130,
      required: true,
      guide:
        "The label-value rows inside the plan cards — where most of the humour lives, so give it room: 9 to 12 rows. Each item MUST be written as 'Label: Value' with a single colon, because the renderer splits on it and aligns the values against dot leaders. Labels are the real ones (Validity, Calls, Data, SMS, Benefits, Caller Tune, Roaming); values carry the joke and must stay under 55 characters or they break the leader alignment. Mine the sender's story for real specifics — the funniest values are the ones only these two would understand.",
      example: "Calls: Unlimited (she never picks up)",
    },
    {
      path: "plans[0].validity",
      label: "Recommended plan validity",
      kind: "text",
      max: 40,
      guide:
        "The validity shown on the RECOMMENDED card — the one card that gets screenshotted on its own. 'Lifetime' is the canonical answer and hard to beat.",
      example: "Lifetime",
    },
    {
      path: "plans[0].benefits",
      label: "Recommended plan benefit chips",
      kind: "list",
      max: 4,
      itemMax: 44,
      guide:
        "The small chips under the recommended plan's rows. 2 to 4, each under 32 characters — they wrap into a tight row and long ones look wrong. Written like real bundled-benefit copy, applied to something absurdly domestic.",
      example: "Free subscription to my nonsense",
    },
    {
      path: "receipt.message",
      label: "The receipt message",
      kind: "list",
      max: 4,
      itemMax: 400,
      required: true,
      guide:
        "THE EMOTIONAL PAYLOAD, rendered in a serif beneath the transaction receipt once the recharge 'succeeds'. Everything before this is a utility app; these lines are the sender talking honestly, and the break from transaction data to real writing is the entire point of the template. 2 to 4 paragraphs, 200 to 500 characters total. No telecom voice, no callback to the plan names, no jokes. One concrete detail from the sender's story so it could not have been written about anyone else.",
      example: "There's no plan for this and I checked. I just wanted to say it somewhere you'd have to read it.",
    },
  ],
};
