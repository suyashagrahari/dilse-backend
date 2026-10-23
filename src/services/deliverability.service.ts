// ─── Spam / Promotions risk for one prospect email ──────────────────────────
//
// Two scores, 0–100, for the email exactly as it would be sent (rendered
// subject + text, the From, the headers, any HTML/image):
//
//   · spam        — how much of what spam filters penalise it carries:
//                   spam phrases, shouting, link shorteners, foreign links,
//                   placeholder leftovers, a role sender, a nameless greeting.
//   · promotions  — how much it looks like a one-to-many marketing email,
//                   which is what Gmail files under Promotions: an
//                   unsubscribe header, HTML or images, links, pitch words,
//                   money and numbers, the brand in the subject or From,
//                   emoji, length, no question to answer.
//
// Neither is Gmail's own number — Gmail publishes none. It is a weighted sum
// of the signals Gmail and SpamAssassin-style filters are documented to use,
// so it moves the right way when the text changes, and every point comes
// with the reason and the fix. Pure: tested without a network.

import {
  PERSONAL_PITCH_WORDS,
  SPAM_PHRASES,
  countWords,
  isOurHost,
  isRoleAddress,
} from "./prospectMail.service";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskFactor {
  id: string;
  /** Which score it raises. */
  affects: "spam" | "promotions" | "both";
  points: number;
  label: string;
  fix: string;
}

export interface Deliverability {
  spam: number;
  promotions: number;
  spamLevel: RiskLevel;
  promotionsLevel: RiskLevel;
  factors: RiskFactor[];
  /** What it already does right, for the "why it's low" list. */
  good: string[];
}

export interface DeliverabilityInput {
  subject: string;
  text: string;
  html?: string;
  fromName: string;
  fromAddress: string;
  /** Header names that go out (List-Unsubscribe, In-Reply-To …). */
  headers?: string[];
  /** An inline image is attached. */
  image?: boolean;
  /** The recipient's first name, when known — a greeting that uses it is personal. */
  firstName?: string;
  /** A reply in an ongoing conversation: links and details are expected there. */
  reply?: boolean;
}

const BASE = { spam: 4, promotions: 6 };
const BRAND_RE = /subh\s*-?\s*sandesh/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)+(?:in|com|net|org|io|co|me|ly|app|link|xyz|ee|gl|at|cc|gd)\b(?:\/[^\s<>"')\]]*)?/gi;
const SHORTENER_RE = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy|lnkd\.in|linktr\.ee)\b/i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const MONEY_RE = /[₹$€£]|\brs\.?\s?\d|\binr\b|\d\s?%|\bpercent\b/i;
const NUMBER_RE = /\b\d[\d,.]*\s?(k|lakh|lakhs|crore|cr|million|users|visitors|views|followers)?\b/gi;
const PLACEHOLDER_RE = /\{\{[^}]*\}\}|\[(name|first ?name|instagram)\]/i;
const SHOUT_RE = /\b[A-Z]{4,}\b/g;
const GREETING_RE = /^\s*(hey|hi|hello|hii+|namaste)\b[^\n,]*,?/i;
const GENERIC_GREETING_RE = /^\s*(hey|hi|hello)\s+(there|friend|dear|team|all|everyone)\b|^\s*dear\s+(sir|madam|user|friend|creator)/i;
const FOOTER_RE = /\b(ward no|pin ?code|you'?re receiving|all rights reserved|privacy policy|view in browser)\b/i;
const OPT_OUT_RE = /\bunsubscribe\b|\bopt[- ]?out\b|\breply\s+["“']?(no|stop)\b/i;

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordsRe = (list: readonly string[]) =>
  new RegExp(`(?:^|[^a-z0-9])(${[...list].map(escRe).sort((a, b) => b.length - a.length).join("|")})(?=$|[^a-z0-9])`, "gi");
const SPAM_PHRASE_RE = wordsRe(SPAM_PHRASES);
const PITCH_WORD_RE = wordsRe(PERSONAL_PITCH_WORDS);

function hits(re: RegExp, s: string): string[] {
  const out = new Set<string>();
  for (const m of String(s || "").matchAll(re)) out.add((m[1] || m[0]).trim().toLowerCase());
  return [...out];
}

const clamp = (n: number) => Math.max(2, Math.min(98, Math.round(n)));
export const riskLevel = (n: number): RiskLevel => (n < 25 ? "low" : n < 50 ? "medium" : "high");
const quote = (xs: string[], n = 4) => xs.slice(0, n).map((x) => `“${x}”`).join(", ");

/** Body without the signature block: the last paragraph when it is short. */
function bodyOnly(text: string): string {
  const paras = String(text || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  if (paras.length > 1 && countWords(paras[paras.length - 1]) <= 6) paras.pop();
  return paras.join("\n\n");
}

export function scoreDeliverability(i: DeliverabilityInput): Deliverability {
  const f: RiskFactor[] = [];
  const good: string[] = [];
  const add = (x: RiskFactor) => f.push(x);
  const subject = String(i.subject || "").trim();
  const text = String(i.text || "");
  const body = bodyOnly(text);
  const all = `${subject}\n${body}`;
  const headers = (i.headers || []).map((h) => h.toLowerCase());
  const words = countWords(body);

  // ── Sender ────────────────────────────────────────────────────────────────
  if (isRoleAddress(i.fromAddress)) {
    add({ id: "role_sender", affects: "both", points: 15, label: `Sent from a team mailbox (${i.fromAddress})`, fix: "Send from a person's own address, e.g. suyash@." });
  } else good.push("Sent from a person's own address");
  if (BRAND_RE.test(i.fromName)) {
    add({ id: "brand_from", affects: "promotions", points: 10, label: `Brand in the From name (“${i.fromName}”)`, fix: "Use just the person's name as the From name." });
  }

  // ── Format ────────────────────────────────────────────────────────────────
  if (headers.includes("list-unsubscribe")) {
    add({ id: "list_unsubscribe", affects: "promotions", points: 28, label: "List-Unsubscribe header (marks it as bulk mail)", fix: "Use the personal style — it sends without this header." });
  } else good.push("No unsubscribe header");
  if (i.image) {
    add({ id: "image", affects: "promotions", points: 14, label: "Inline image", fix: "Leave the screenshot out of a first email; describe it in a sentence instead." });
  } else if (i.html && /<(table|img|style|font)\b/i.test(i.html)) {
    add({ id: "html", affects: "promotions", points: 14, label: "Designed HTML layout", fix: "Send plain text, like a person typing an email." });
  } else good.push("Plain text, like a typed email");
  if (FOOTER_RE.test(text)) {
    add({ id: "footer", affects: "promotions", points: 8, label: "Newsletter-style footer or postal address", fix: "End with just your name." });
  }

  // ── Subject ───────────────────────────────────────────────────────────────
  if (!subject) add({ id: "subject_empty", affects: "spam", points: 8, label: "No subject", fix: "Add a short subject with their name." });
  if (subject.length > 60) add({ id: "subject_long", affects: "promotions", points: 6, label: "Long subject (over 60 characters)", fix: "Keep the subject to a few words, like a friend would." });
  if (/!/.test(subject)) add({ id: "subject_bang", affects: "spam", points: 8, label: "“!” in the subject", fix: "Drop the exclamation mark." });
  if (subject && subject === subject.toUpperCase() && /[A-Z]{3,}/.test(subject)) {
    add({ id: "subject_caps", affects: "spam", points: 15, label: "Subject in capitals", fix: "Write the subject in normal case." });
  }
  if (BRAND_RE.test(subject)) add({ id: "subject_brand", affects: "promotions", points: 10, label: "Company name in the subject", fix: "Put their name in the subject, not the company's." });
  if (!i.reply && i.firstName && subject && !subject.toLowerCase().includes(i.firstName.toLowerCase())) {
    add({ id: "subject_no_name", affects: "promotions", points: 4, label: "Subject doesn't use their name", fix: `Mention ${i.firstName} in the subject.` });
  }

  // ── Words ─────────────────────────────────────────────────────────────────
  const spamHits = hits(SPAM_PHRASE_RE, all);
  if (spamHits.length) {
    add({ id: "spam_phrases", affects: "spam", points: Math.min(30, 10 * spamHits.length), label: `Spam-filter phrases: ${quote(spamHits)}`, fix: "Say the same thing in plain, specific words." });
  } else good.push("No spam-filter phrases");
  const pitchHits = i.reply ? [] : hits(PITCH_WORD_RE, all);
  if (pitchHits.length) {
    add({ id: "pitch_words", affects: "promotions", points: Math.min(30, 8 * pitchHits.length), label: `Sales / marketing words: ${quote(pitchHits)}`, fix: "Talk about them and their content; save the details for after they reply." });
  } else if (!i.reply) good.push("No sales words");
  const shouts = [...new Set((body.match(SHOUT_RE) || []).filter((w) => !/^(OK|USA|UK|IST|AM|PM|DM|FAQ|HTML|URL)$/.test(w)))];
  if (shouts.length) add({ id: "caps", affects: "spam", points: Math.min(15, 5 * shouts.length), label: `Words in capitals: ${quote(shouts)}`, fix: "Write in normal case." });
  if (/!{2,}|\?{2,}/.test(all)) add({ id: "punctuation", affects: "spam", points: 6, label: "Repeated “!!” or “??”", fix: "One punctuation mark is enough." });
  const bangs = (body.match(/!/g) || []).length;
  if (bangs > 2) add({ id: "bangs", affects: "promotions", points: 5, label: `${bangs} exclamation marks`, fix: "Keep at most one." });
  const emoji = (all.match(EMOJI_RE) || []).length;
  if (emoji) add({ id: "emoji", affects: "promotions", points: Math.min(12, 6 * emoji), label: `${emoji} emoji`, fix: "Leave emoji out of a first email." });
  if (!i.reply && MONEY_RE.test(all)) {
    add({ id: "money", affects: "both", points: 12, label: "Money or percentages (₹, %, Rs)", fix: "Leave amounts for after they reply." });
  }
  const numbers = (body.match(NUMBER_RE) || []).filter((n) => /\d{2,}|k|lakh|crore|million/i.test(n));
  if (!i.reply && numbers.length >= 2) add({ id: "numbers", affects: "promotions", points: 6, label: "Several figures and stats", fix: "One concrete detail about them beats numbers about you." });
  if (PLACEHOLDER_RE.test(all)) add({ id: "placeholder", affects: "spam", points: 18, label: "An unfilled placeholder ({{…}} or [name])", fix: "Fill in their name before sending." });
  if (OPT_OUT_RE.test(body)) add({ id: "opt_out", affects: "promotions", points: 8, label: "An unsubscribe / “reply no” line", fix: "Leave it out — a “no” reply already stops future emails." });

  // ── Links ─────────────────────────────────────────────────────────────────
  const links = [...new Set(all.match(URL_RE) || [])];
  if (links.some((l) => SHORTENER_RE.test(l))) add({ id: "shortener", affects: "spam", points: 25, label: "A link shortener (bit.ly, linktr.ee …)", fix: "Use the full link, or none." });
  const foreign = links.filter((l) => {
    const host = l.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
    return !isOurHost(host) && !SHORTENER_RE.test(l);
  });
  if (foreign.length) add({ id: "foreign_link", affects: "spam", points: 10, label: `Link to another site (${foreign[0]})`, fix: "Link only to subhsandesh.in, or not at all." });
  if (/[?&]utm_/i.test(all)) add({ id: "tracking", affects: "promotions", points: 8, label: "Tracking parameters (utm_) in a link", fix: "Use the plain link." });
  if (links.length && !i.reply) {
    add({ id: "links", affects: "promotions", points: Math.min(30, 16 + 8 * (links.length - 1)), label: `${links.length} link${links.length > 1 ? "s" : ""} in a cold email`, fix: "Send the first email without links; share the link after they reply." });
  } else if (!links.length) good.push("No links");

  // ── Shape ─────────────────────────────────────────────────────────────────
  const firstLine = body.trim().split("\n")[0] || "";
  if (GENERIC_GREETING_RE.test(firstLine)) {
    add({ id: "generic_greeting", affects: "both", points: 10, label: `Generic greeting (“${firstLine.slice(0, 30)}”)`, fix: "Greet them by first name." });
  } else if (!GREETING_RE.test(firstLine)) {
    add({ id: "no_greeting", affects: "promotions", points: 6, label: "No greeting", fix: "Open with “Hey <first name>,”." });
  } else good.push("Greets them by name");
  if (!i.reply && words > 150) add({ id: "long", affects: "promotions", points: Math.min(15, 5 + Math.floor((words - 150) / 40) * 3), label: `Long (${words} words)`, fix: "Under 100 words reads like a note from a person." });
  if (words > 0 && words < 15) add({ id: "short", affects: "spam", points: 5, label: `Very short (${words} words)`, fix: "Two or three real sentences." });
  if (!i.reply && !/\?/.test(body)) add({ id: "no_question", affects: "promotions", points: 8, label: "Nothing to reply to", fix: "End with one easy question — replies are what move you to Primary." });
  else if (/\?/.test(body)) good.push("Asks a question they can answer");

  const sum = (k: "spam" | "promotions") => f.filter((x) => x.affects === k || x.affects === "both").reduce((a, x) => a + x.points, BASE[k]);
  const spam = clamp(sum("spam"));
  const promotions = clamp(sum("promotions"));
  f.sort((a, b) => b.points - a.points);
  return { spam, promotions, spamLevel: riskLevel(spam), promotionsLevel: riskLevel(promotions), factors: f, good };
}

/** "Hey Om & Diya," → "Om" — the first name a greeting should use. */
export function firstNameOf(name: string): string {
  return String(name || "").trim().split(/\s*(?:&|and|,|\+|\/)\s*|\s+/i)[0] || "";
}
