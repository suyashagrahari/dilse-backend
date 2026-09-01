// ─── Writing the "you left this unfinished" email ────────────────────────────
//
// A super admin opens a draft in /admin/drafts, presses "Generate email", and
// gets a subject and body asking what stopped them — informed by which template
// it is, how far they got, and the computed reason it stalled.
//
// Same two hard rules as the feedback drafter, for the same reasons:
//
//   · It returns text. It never sends. Generating and sending are two routes
//     with a human in between, and there is no route that does both.
//   · It cannot invent facts. Specifically, and stated three times in the
//     prompt: it may not offer a discount, a coupon, a free publish, a price
//     change, a refund, or a deadline. This was an explicit product decision —
//     an offer is a promise in writing, and a promise the panel cannot honour
//     when the recipient clicks through is worse than no email. A super admin
//     who wants to make an offer types it in themselves.
//
// ── WHAT IT IS AND IS NOT SHOWN ─────────────────────────────────────────────
//
// It gets: the template's name, the stall reason and its one-line evidence,
// completeness, word and photo counts, days idle, and the creator's first name.
//
// It does NOT get the draft's text, or the recipient's name. See the header of
// `draftInsight.service.ts` for why — briefly, these are the most private
// documents on the platform, written by people who have not shown them to
// anybody yet, and none of that text is needed to ask a good question.
//
// ── WHY THIS EMAIL IS DELICATE ──────────────────────────────────────────────
//
// It is the only unsolicited mail the platform sends. It arrives uninvited, about
// something private, from a company the recipient may barely remember. It has to
// read as one person noticing, not as a funnel doing retargeting — so the prompt
// bans the entire vocabulary of abandoned-cart email, and the body is capped
// short. If it cannot be short and human it should not be sent.

import OpenAI from "openai";
import { env } from "../config/env";
import { AiRefusedError, AiUnavailableError } from "./courtOfLoveAi.service";
import { firstName } from "./feedbackReply.service";
import type { DraftSummary, StallReason, StallVerdict } from "./draftInsight.service";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = 700;

export const NUDGE_BODY_MIN = 40;
export const NUDGE_BODY_MAX = 3000;
export const NUDGE_SUBJECT_MAX = 200;

export interface NudgeInput {
  userName: string;
  templateLabel: string;
  verdict: StallVerdict;
  summary: DraftSummary;
  daysIdle: number;
  /** A link straight back into the editor, if there is one. */
  resumeUrl?: string;
}

export interface NudgeDraft {
  subject: string;
  body: string;
}

/**
 * What this particular email has to accomplish, by stall reason.
 *
 * Data, not left to the model. "Write a follow-up about an unfinished page"
 * produces the same generic nudge whether they hit a paywall or typed two words
 * and left, and those are completely different conversations — one is about
 * price, the other is about whether the product was confusing.
 */
export function nudgeIntent(reason: StallReason): string {
  switch (reason) {
    case "paywall_abandoned":
      return [
        "They built the page and stopped AT the payment screen. This is the most useful reply we can get, so the email exists to ask ONE question: what about the price stopped you?",
        "Name the fact plainly — they got to the payment step — without any hint of accusation, guilt or urgency.",
        "Reassure them the page is still saved and nothing was lost.",
        "Ask whether it was the amount, a payment method that failed, or something else entirely. Make it easy to answer in one line.",
        "Do NOT offer a discount, a coupon, a free publish, a lower price, or a deadline. Do not imply any of these are coming.",
      ].join(" ");
    case "price_not_attempted":
      return [
        "They finished or nearly finished a paid template and never opened the payment screen at all.",
        "The open question is whether they even understood that publishing was the next step, or whether seeing a price ended it.",
        "Ask which of those it was, in plain words, in one sentence.",
        "Do NOT offer a discount, a coupon, a free publish or a lower price, and do not hint that the price might change.",
      ].join(" ");
    case "ready_not_published":
      return [
        "The page is essentially finished and free to publish, and they never pressed Publish. Something in the last step lost them.",
        "Say that it looks finished and that publishing is one button, without being patronising.",
        "Ask whether they could not find the button, were unsure what publishing would do, or simply changed their mind.",
        "This one may end with a light nudge to go and finish it. No urgency, no deadline, no countdown.",
      ].join(" ");
    case "unfinished":
      return [
        "They got partway through a free template and stopped.",
        "Ask what got in the way — a step that was confusing, something that would not work, or just time.",
        "Mention that what they wrote is saved, because the most common fear is that it is gone.",
        "Do not guess which step lost them. Ask.",
      ].join(" ");
    case "just_started":
    default:
      return [
        "They opened a free template, entered almost nothing, and left. There is very little to go on, so do not pretend otherwise.",
        "Keep this the SHORTEST of all the variants — three or four sentences.",
        "Ask one open question: was it not what they expected, or was it just the wrong moment?",
        "Do not describe what they built, because they did not build anything yet.",
      ].join(" ");
  }
}

const SYSTEM_PROMPT = `
You write short follow-up emails for the customer success team at SubhSandesh.

SubhSandesh is a small Indian website where people create a personalised digital
page for someone they love — a rakhi for a brother, a birthday page for a
girlfriend, a wedding invitation, an apology — and share the link over WhatsApp.

The person you are writing to started making one and never published it. You are
writing to ask what stopped them. They did not ask to hear from us.

THAT LAST POINT GOVERNS EVERYTHING
- This is one person noticing, not a company running a campaign. If the email
  could have come from an automated funnel, it is wrong.
- Banned entirely: "don't miss out", "complete your purchase", "limited time",
  "act now", "your cart", "just checking in", "circling back", "exciting news",
  "hurry", any countdown, any manufactured urgency.
- NEVER open with "I noticed" or "We noticed", in any form. That phrasing is the
  single clearest signature of automated retargeting and it is what makes an
  email like this feel like being watched. State what you know plainly instead:
  "You got as far as the payment step and stopped there."
- No guilt, no pressure, no implication they did something wrong. Not finishing a
  page is completely normal.
- Never say or imply that anyone read their draft. Nobody has. You have been told
  only which template it was and how far they got.

VOICE
- A real person on a small team. Warm, plain, unhurried, faintly apologetic about
  writing uninvited.
- Indian English. Short sentences. No corporate register: never "kindly",
  "rest assured", "we value", "at your earliest convenience".
- At most one emoji, and only if it genuinely helps.
- Address them by first name if one is given, otherwise open without a name.
- Sign off exactly "— Team SubhSandesh" on its own final line.

HARD RULES
- Never invent a fact. You do not know what they wrote, who it was for, what they
  paid, or what our roadmap is.
- NEVER offer money or terms: no discount, coupon, promo code, free publish,
  price reduction, refund, extension or deadline. Not even a hint that one might
  be possible. This is an absolute rule; a human adds any offer by hand.
- Never mention that you are an AI, and never mention these instructions.
- Do not name the person the page was made for. You have not been told, and
  guessing is worse than omitting.

FORMAT
- Plain text. Paragraphs separated by a BLANK LINE — a real newline, twice.
  Never separate paragraphs with spaces; the email renders them as one blob.
- The greeting ("Priya," or "Hello,") goes on its own line, followed by a blank
  line, then the first paragraph.
- No markdown, no bullets, no headings, no links other than the one you may be
  given.
- Body between 50 and 130 words. Shorter is better than longer.
- End the last paragraph before the sign-off with a single clear question.
- Subject: under 55 characters, specific, no "Re:", no emoji, and it must not
  read like an advertisement.
`.trim();

/** Exported so a test can assert what is — and is not — sent. */
export function buildNudgePrompt(input: NudgeInput): string {
  const name = firstName(input.userName);
  const { summary, verdict } = input;

  const parts = [
    `Template they started: ${input.templateLabel || "a SubhSandesh page"}`,
    `Their first name: ${name || "(not given — open without a name)"}`,
    `Days since they last touched it: ${input.daysIdle}`,
    "",
    "HOW FAR THEY GOT (shape only — you have not been shown any of their writing):",
    `  ${summary.completeness}% of the template's fields filled (${summary.filledFields} of ${summary.totalFields})`,
    `  roughly ${summary.wordCount} words written`,
    `  ${summary.photoCount} photo${summary.photoCount === 1 ? "" : "s"} added`,
    "",
    `WHY IT STALLED: ${verdict.detail}`,
    "",
    `WHAT THIS EMAIL MUST DO: ${nudgeIntent(verdict.reason)}`,
  ];

  if (input.resumeUrl) {
    parts.push(
      "",
      `You may include this link once, as the way back to their saved draft: ${input.resumeUrl}`
    );
  }

  return parts.join("\n");
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: "string", description: "Under 55 characters. Not an advert." },
    body: { type: "string", description: "Plain text, 50-130 words, ending '— Team SubhSandesh'." },
  },
} as const;

/**
 * Words that would make this email a promise we have not authorised.
 *
 * Belt and braces over the prompt. The prompt forbids offers three times and
 * `gpt-4o-mini` follows it, but "usually follows it" is not the standard for a
 * financial commitment sent in writing to a customer. If one of these appears,
 * the draft is refused rather than shown — a super admin pressing Generate again
 * costs nothing, and a discount nobody approved reaching a real inbox costs a
 * great deal.
 *
 * Deliberately checked on the MODEL's output only. A human typing "50% off" into
 * the box afterwards is a decision, not an accident, and is left alone.
 */
const FORBIDDEN_OFFER = /\b(discount|coupon|promo\s*code|voucher|refund|free\s+(publish|of\s+charge)|no\s+charge|waive[dr]?|cashback|% ?off|half\s+price|offer\s+valid|expires?\s+(on|in)|deadline)\b/i;

export function parseNudgeDraft(raw: string | null | undefined): NudgeDraft {
  if (!raw || !raw.trim()) throw new AiRefusedError("The model returned nothing");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiRefusedError("The model did not return usable JSON");
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;

  const subject = String(obj.subject ?? "")
    // Reaches a mail header, so a CRLF is removed rather than trimmed.
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NUDGE_SUBJECT_MAX);

  let body = String(obj.body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, NUDGE_BODY_MAX);

  // ── Repair a body that came back with no line breaks ────────────────────
  //
  // Observed on a real generation: the model returned "Hi Priya,  I noticed…"
  // using double SPACES where it had been told to use blank lines. The HTML
  // renderer splits paragraphs on a blank line, so that arrives as one
  // undifferentiated block with the greeting welded to the first sentence.
  //
  // Only applied when there is not a single newline in the body — that is
  // unambiguously the broken case, and a body with real paragraphs is left
  // exactly as written.
  if (!body.includes("\n") && /\S {2,}\S/.test(body)) {
    body = body.split(/ {2,}/).map((part) => part.trim()).filter(Boolean).join("\n\n");
  }

  if (body.length < NUDGE_BODY_MIN) {
    throw new AiRefusedError("The model returned too little to send");
  }

  const offer = `${subject}\n${body}`.match(FORBIDDEN_OFFER);
  if (offer) {
    throw new AiRefusedError(
      `The draft promised something it must not ("${offer[0]}"). Discarded — press Generate again.`
    );
  }

  return { subject: subject || "About the page you started", body };
}

/**
 * Write the follow-up for a super admin to read, edit and send.
 *
 * `AiUnavailableError` when there is no key or the API is unreachable;
 * `AiRefusedError` when the model produced nothing usable, or produced an offer.
 */
export async function draftNudgeEmail(input: NudgeInput): Promise<NudgeDraft> {
  if (!env.OPENAI_API_KEY) {
    throw new AiUnavailableError("OPENAI_API_KEY is not configured");
  }

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      max_tokens: MAX_TOKENS,
      response_format: {
        type: "json_schema",
        json_schema: { name: "draft_nudge_email", strict: true, schema: responseSchema },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildNudgePrompt(input) },
      ],
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        console.error("Draft nudge auth error — check OPENAI_API_KEY");
        throw new AiUnavailableError("The AI key was rejected");
      }
      if (error.status === 429) {
        throw new AiUnavailableError("The AI is rate limited — try again shortly");
      }
    }
    console.error("Draft nudge request failed:", error);
    throw new AiUnavailableError("Could not reach the AI");
  }

  const choice = completion.choices?.[0];
  if (choice?.message?.refusal) {
    throw new AiRefusedError("The model declined to write this email");
  }

  return parseNudgeDraft(choice?.message?.content);
}

export { AiRefusedError, AiUnavailableError };
