// ─── "Make it more personal": rewrite one email to lower its risk scores ────
//
// The admin's own subject + body (a template: {{firstName}} / {{instagram}}
// stay as placeholders) go to the prospect model with the FIXES the scorer
// suggested — never the offending words themselves: naming a word to a model
// is the surest way to get it written. Each attempt is linted and re-scored
// by the caller's `check`, and only a draft that passes the linter AND scores
// lower than the original is returned. Up to three attempts; the best wins.

import type { Completion } from "./influencerMailAi.service";
import type { Deliverability } from "./deliverability.service";
import { prospectCompletion } from "./prospectModel.service";
import { ThreadAiRefusedError, ThreadAiUnavailableError } from "./threadReplyAi.service";
import { env } from "../config/env";

export interface ImproveCheck {
  /** The linter's errors for this subject + body ([] = sendable). */
  errors: { code: string; message: string }[];
  score: Deliverability;
}

/**
 * The linter messages a model may be told: shape rules (length, a question,
 * the greeting, the intro). Any message that quotes a word is left out —
 * naming a flagged word to the model invites it.
 */
export function shapeFixes(errors: { code: string; message: string }[]): string[] {
  return errors.map((e) => e.message).filter((m) => !/[“”"‘’]|'[^s ]/.test(m.replace(/\{\{\w+\}\}/g, "")));
}

export interface ImproveInput {
  subject: string;
  body: string;
  /** The subject is set by code (Connect, Re: threads): keep it as is. */
  subjectLocked: boolean;
  /** Who writes it, for the voice ("Suyash"). */
  writer: string;
  /** A first hello (Connect): nothing about a company, product or ask. */
  connect?: boolean;
  /** Lint + score a candidate, exactly as the preview would. */
  check: (subject: string, body: string) => ImproveCheck;
}

export interface ImproveResult {
  improved: boolean;
  subject: string;
  body: string;
  before: Deliverability;
  after: Deliverability;
  /** Why nothing better was found, when improved is false. */
  reason?: string;
}

export const IMPROVE_SYSTEM_PROMPT = [
  "You edit one short email so it reads like a note one person typed to one other person they admire — the kind of email that lands in a friend's main inbox.",
  "Rules:",
  "- Keep the meaning, every fact, and the writer's voice (first person). Never invent facts, numbers, links or offers.",
  "- Keep placeholders exactly as written, braces included: {{firstName}}, {{instagram}}.",
  "- Never add a person's name that is not already in the body; the placeholders fill names in for each recipient.",
  "- Keep the greeting line as it is.",
  "- Plain text. Short sentences, everyday words, normal capitalisation, at most one exclamation mark.",
  "- Make it about them and their content, then one easy question they can answer in a line.",
  "- Do not add a signature or sign-off; one is added automatically.",
  "- Apply every requested change below.",
  'Return JSON: {"reading": "<one line on what you changed>", "subject": "<subject>", "body": "<body>"}.',
].join("\n");

export function buildImprovePrompt(i: { subject: string; body: string; subjectLocked: boolean; writer: string; fixes: string[]; connect?: boolean }): string {
  return [
    `WRITER: ${i.writer}`,
    "",
    ...(i.connect
      ? [
          "THIS IS A FIRST HELLO: the only purpose is to connect. Say nothing about any company, product, website, money or what you want from them — that comes after they reply.",
          "",
        ]
      : []),
    "CHANGES TO MAKE:",
    `- Introduce yourself once, by first name, in the first person (“I'm ${i.writer}”).`,
    ...(i.fixes.length ? i.fixes.map((f) => `- ${f}`) : ["- Make it read even more like a personal note."]),
    "",
    i.subjectLocked ? "SUBJECT (keep exactly as is):" : "SUBJECT:",
    i.subject,
    "",
    "BODY:",
    i.body,
  ].join("\n");
}

const total = (d: Deliverability) => d.spam + d.promotions;

export async function improveProspectMail(i: ImproveInput, complete: Completion = prospectCompletion): Promise<ImproveResult> {
  if (complete === prospectCompletion && !env.OPENAI_API_KEY) {
    throw new ThreadAiUnavailableError("OPENAI_API_KEY is not set on this deployment.");
  }
  const start = i.check(i.subject, i.body);
  // The scorer's fixes, plus the linter's shape rules (length, question …).
  const fixes = [...new Set([...start.score.factors.map((f) => f.fix), ...shapeFixes(start.errors)])];
  const basePrompt = buildImprovePrompt({ subject: i.subject, body: i.body, subjectLocked: i.subjectLocked, writer: i.writer, fixes, connect: i.connect });
  let feedback: string[] = [];

  let best: { subject: string; body: string; check: ImproveCheck } | null = null;
  let lastProblem = "";
  for (let n = 0; n < 3; n++) {
    let raw: string;
    try {
      const prompt = feedback.length ? `${basePrompt}\n\nYOUR LAST VERSION STILL NEEDS:\n${feedback.map((f) => `- ${f}`).join("\n")}` : basePrompt;
      raw = await complete(IMPROVE_SYSTEM_PROMPT, prompt);
    } catch (error) {
      throw new ThreadAiUnavailableError(`The AI could not be reached: ${(error as Error)?.message || "unknown error"}`);
    }
    let parsed: { subject?: unknown; body?: unknown };
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      lastProblem = "The model did not return usable JSON.";
      continue;
    }
    const body = String(parsed.body || "").replace(/\r\n/g, "\n").trim();
    const subject = i.subjectLocked ? i.subject : String(parsed.subject || "").replace(/\s+/g, " ").trim() || i.subject;
    if (!body) {
      lastProblem = "The model returned an empty body.";
      continue;
    }
    // Placeholders in the original must survive.
    const lost = (i.body.match(/\{\{\s*\w+\s*\}\}/g) || []).filter((p) => !body.includes(p.replace(/\s+/g, "")) && !body.includes(p));
    if (lost.length) {
      lastProblem = `The rewrite dropped ${lost[0]}.`;
      continue;
    }
    const c = i.check(subject, body);
    if (c.errors.length) {
      lastProblem = c.errors[0].message;
      feedback = shapeFixes(c.errors);
      if (!feedback.length) feedback = ["Keep it about them and their content only, in plain everyday words."];
      continue;
    }
    if (!best || total(c.score) < total(best.check.score)) best = { subject, body, check: c };
    if (c.score.spam < 25 && c.score.promotions < 25) break;
  }

  // Better = lower risk, or sendable where the original was not.
  if (best && (total(best.check.score) < total(start.score) || start.errors.length > 0)) {
    return { improved: true, subject: best.subject, body: best.body, before: start.score, after: best.check.score };
  }
  if (!best && lastProblem) {
    throw new ThreadAiRefusedError(`Couldn't produce a sendable rewrite: ${lastProblem}`);
  }
  return {
    improved: false,
    subject: i.subject,
    body: i.body,
    before: start.score,
    after: start.score,
    reason: "This email is already about as personal as it gets — the rewrite didn't score lower.",
  };
}
