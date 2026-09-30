// ─── Writing one announcement for many creators ──────────────────────────────
//
// A super admin types what they want to tell people ("we launched a Diwali
// template", "sorry the editor was slow last week") and who it is for; this
// returns a subject and body for them to read, edit and send.
//
// Same two rules as every other drafter in the panel:
//
//   · It returns text. It never sends. Generate and Send are two routes with a
//     human in between, and there is no route that does both.
//   · It may only state what the brief states. The feedback and draft drafters
//     ban offers outright; this one cannot, because announcing an offer is a
//     legitimate reason to write to everybody. So the rule is narrower: a
//     price, discount, date or feature reaches the email only if the super
//     admin wrote it in the brief. Anything else is the model inventing a
//     promise in the company's name.
//
// ── ONE EMAIL, ONE MERGE FIELD ──────────────────────────────────────────────
//
// The body is common to everyone. The only per-person part is `{{firstName}}`
// in the greeting, filled at send time from the account name (or "there").
// That is a string replace, not a model call per recipient — cheap, identical
// for all, and nothing about a person is sent to the model.

import OpenAI from "openai";
import { env } from "../config/env";
import { AiRefusedError, AiUnavailableError } from "./courtOfLoveAi.service";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const BROADCAST_SUBJECT_MAX = 150;
export const BROADCAST_BODY_MIN = 30;
export const BROADCAST_BODY_MAX = 6000;
export const BRIEF_MAX = 2000;

export const TONES = ["warm", "festive", "professional", "apologetic", "excited"] as const;
export const LENGTHS = ["short", "medium", "long"] as const;
export type Tone = (typeof TONES)[number];
export type Length = (typeof LENGTHS)[number];

export interface BroadcastDraftInput {
  brief: string;
  tone: Tone;
  length: Length;
  /** Who it goes to, in words — shapes the framing, never named in the email. */
  audienceLabel: string;
  audienceSize: number;
}

export interface BroadcastDraft {
  subject: string;
  body: string;
  /** A short button label when the brief has a clear action, else "". */
  ctaLabel: string;
}

const WORDS: Record<Length, string> = { short: "60-110", medium: "110-180", long: "180-280" };

const TONE_NOTE: Record<Tone, string> = {
  warm: "Warm and personal, like a founder writing to people they are glad to have.",
  festive: "Celebratory and joyful, fitting an Indian festival or occasion, without going over the top.",
  professional: "Clear, polite and to the point.",
  apologetic: "Sincere and accountable. Own the problem plainly, say what changed, no excuses.",
  excited: "Upbeat and energetic about something new, but never salesy.",
};

const SYSTEM_PROMPT = `You write emails from the SubhSandesh team to the people who use SubhSandesh.

SubhSandesh (subhsandesh.in) is an Indian website where people create beautiful personalised pages to celebrate someone — birthdays, anniversaries, proposals, weddings, festivals like Diwali, Holi, Eid and Raksha Bandhan, apologies and "I miss you" notes — and share them as one link.

You are given a BRIEF written by the team saying what this email must communicate, plus who receives it. Write ONE email that is sent, identically, to everyone in that group.

Rules:
- Communicate exactly what the brief says. Do not add news, features, prices, discounts, dates, deadlines, links or promises that are not in the brief. If the brief mentions an offer, repeat it exactly as written — never change a number.
- Begin the body with the greeting "Hi {{firstName}}," on its own line. {{firstName}} is replaced per recipient. Use no other placeholders or square-bracket blanks anywhere.
- Plain text. Short paragraphs separated by one blank line. No markdown, no bullet symbols, no headings, no emojis in the body.
- Do not sign off and do not add a signature, name or "Team SubhSandesh" — the signature is added automatically.
- Never mention the recipient's data, ratings, or why they were selected (no "we noticed you rated us 2 stars").
- Subject: under 60 characters, specific, human. No clickbait, no ALL CAPS, no "!!!", at most one emoji.
- ctaLabel: if the brief asks people to do one clear thing (try a template, create a page, reply), give a 2-4 word button label like "Try it now". Otherwise "".
- Write in English unless the brief is written in Hindi or Hinglish, in which case match it.`;

function buildPrompt(input: BroadcastDraftInput): string {
  return [
    `BRIEF:\n${input.brief.trim()}`,
    `RECIPIENTS: ${input.audienceSize} people — ${input.audienceLabel || "all users"}. Use this only to pitch the tone; do not mention it.`,
    `TONE: ${TONE_NOTE[input.tone]}`,
    `LENGTH: ${WORDS[input.length]} words for the body.`,
  ].join("\n\n");
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body", "ctaLabel"],
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    ctaLabel: { type: "string" },
  },
} as const;

/** Any `{{…}}` other than the one merge field is a blank the model left. */
export const STRAY_PLACEHOLDER = /\{\{(?!\s*firstName\s*\}\})[^}]*\}\}|\[(?:name|your name|link|date|insert[^\]]*)\]/i;

export function parseBroadcastDraft(raw: string | null | undefined): BroadcastDraft {
  if (!raw?.trim()) throw new AiRefusedError("The model returned nothing");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new AiRefusedError("The model did not return usable JSON");
  }

  const subject = String(obj.subject ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, BROADCAST_SUBJECT_MAX);
  let body = String(obj.body ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BROADCAST_BODY_MAX);

  // Same repair as the draft drafter: double spaces where blank lines belonged.
  if (!body.includes("\n") && /\S {2,}\S/.test(body)) {
    body = body.split(/ {2,}/).map((s) => s.trim()).filter(Boolean).join("\n\n");
  }
  // A sign-off slipped through despite the prompt — the signature adds its own.
  body = body.replace(/\n+(?:warm(?:est)? regards|regards|best|cheers|with love|love|thanks|thank you)[,!]?\s*\n+[^\n]{0,40}$/i, "").trim();
  body = body.replace(/\n+[—–-]\s*team subhsandesh\.?$/i, "").trim();

  if (body.length < BROADCAST_BODY_MIN) throw new AiRefusedError("The model returned too little to send");
  if (STRAY_PLACEHOLDER.test(`${subject}\n${body}`)) {
    throw new AiRefusedError("The draft left a blank to fill in. Press Generate again, or add the missing detail to the brief.");
  }

  const ctaLabel = String(obj.ctaLabel ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  return { subject: subject || "A note from SubhSandesh", body, ctaLabel };
}

export async function draftBroadcast(input: BroadcastDraftInput): Promise<BroadcastDraft> {
  if (!env.OPENAI_API_KEY) throw new AiUnavailableError("OPENAI_API_KEY is not configured");

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.7,
      max_tokens: 900,
      response_format: { type: "json_schema", json_schema: { name: "broadcast_email", strict: true, schema: responseSchema } },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(input) },
      ],
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) throw new AiUnavailableError("The AI key was rejected");
      if (error.status === 429) throw new AiUnavailableError("The AI is rate limited — try again shortly");
    }
    console.error("Broadcast draft request failed:", error);
    throw new AiUnavailableError("Could not reach the AI");
  }

  const choice = completion.choices?.[0];
  if (choice?.message?.refusal) throw new AiRefusedError("The model declined to write this email");
  return parseBroadcastDraft(choice?.message?.content);
}

export { AiRefusedError, AiUnavailableError };
