// ─── Prospect outreach: everything that can be decided without Mongo or SES ──
//
// The pure half of the prospect feature. Kept apart so every rule the owner
// cares about — "it must not land in spam, it must not read like spam, nobody
// who said no is ever written to again" — is unit-tested on its own terms:
//
//   · input            parseProspectInput, parseProspectCsv
//   · merge fields     renderMergeFields ({{firstName}}, {{instagram}}, {{name}})
//   · the linter       lintOutreach — deterministic; blocks Send with reasons
//   · the email        prospectMailText / prospectMailHtml / prospectHeaders
//   · contact rules    canEmailProspect, prospectJobKind
//   · pacing           nextSendDecision
//   · feedback         parseSesFeedback, looksLikeUnsubscribeReply
//
// The send itself goes through `sendInfluencerMail` (influencerMail.service),
// so SES, the From address, the Reply-To and the stub transport are the ones
// the influencer chat already uses — there is one email system, not two.

import { env } from "../config/env";
import { BUSINESS } from "../config/business";
import { parseInstagramHandle } from "../config/instagramHandle";
import {
  FOLLOWER_RANGES,
  PROSPECT_NAME_MAX,
  PROSPECT_NICHE_MAX,
  PROSPECT_NOTE_MAX,
  SUPPRESSED_STATUSES,
  type FollowerRange,
  type ProspectStatus,
} from "../models/InfluencerProspect";
import type { JobKind } from "../models/ProspectMailJob";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Input ───────────────────────────────────────────────────────────────────

export interface ProspectInput {
  name: string;
  email: string;
  instagram: string;
  note: string;
  niche: string;
  followerRange: FollowerRange;
}

export type ParseResult =
  | { ok: true; value: ProspectInput }
  | { ok: false; field: keyof ProspectInput; error: string };

const clean = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export function parseProspectInput(raw: Record<string, unknown>): ParseResult {
  const name = clean(raw.name, PROSPECT_NAME_MAX);
  if (name.length < 2) return { ok: false, field: "name", error: "Add their name." };

  const email = String(raw.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 180 || /[\s<>,;"()]/.test(email)) {
    return { ok: false, field: "email", error: "That doesn't look like a valid email address." };
  }

  let instagram = "";
  const igRaw = String(raw.instagram ?? "").trim();
  if (igRaw) {
    const ig = parseInstagramHandle(igRaw);
    if (!ig.ok) return { ok: false, field: "instagram", error: ig.message.replace(/your username/i, "their username") };
    instagram = ig.handle;
  }

  const followerRange = String(raw.followerRange ?? "") as FollowerRange;
  return {
    ok: true,
    value: {
      name,
      email,
      instagram,
      note: String(raw.note ?? "").replace(/\r\n/g, "\n").trim().slice(0, PROSPECT_NOTE_MAX),
      niche: clean(raw.niche, PROSPECT_NICHE_MAX),
      followerRange: (FOLLOWER_RANGES as readonly string[]).includes(followerRange) ? followerRange : "",
    },
  };
}

/**
 * Bulk paste: one person per line, "name, email, instagram[, note]". Tabs work
 * too (a paste from a spreadsheet). A header row is skipped. Each line is
 * parsed exactly like the modal, so the rules cannot drift.
 */
export function parseProspectCsv(text: string, maxRows = 200): {
  rows: ProspectInput[];
  errors: { line: number; error: string }[];
} {
  const rows: ProspectInput[] = [];
  const errors: { line: number; error: string }[] = [];
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /^name$/i.test(cells[0] || "") && /mail/i.test(cells[1] || "")) return;
    if (rows.length >= maxRows) {
      errors.push({ line: i + 1, error: `Only ${maxRows} rows at a time.` });
      return;
    }
    const r = parseProspectInput({ name: cells[0], email: cells[1], instagram: cells[2], note: cells.slice(3).join(", ") });
    if (r.ok) rows.push(r.value);
    else errors.push({ line: i + 1, error: r.error });
  });
  return { rows, errors };
}

// ── Merge fields ────────────────────────────────────────────────────────────

export const MERGE_FIELDS = ["firstName", "instagram", "name"] as const;
const MERGE_RE = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export interface MergeTarget {
  name: string;
  instagram: string;
}

/** "Priya Sharma" → "Priya". Titles and initials are skipped. */
export function prospectFirstName(full: string): string {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  const skip = /^(mr|mrs|ms|miss|dr|shri|smt)\.?$/i;
  const first = parts.find((p) => !skip.test(p) && p.replace(/\./g, "").length > 1) || parts[0] || "";
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Merge fields the template uses that we do not fill. */
export function unknownMergeFields(template: string): string[] {
  const out = new Set<string>();
  for (const m of String(template || "").matchAll(MERGE_RE)) {
    if (!(MERGE_FIELDS as readonly string[]).includes(m[1])) out.add(m[0]);
  }
  return [...out];
}

/**
 * Fill {{firstName}}, {{instagram}} ("@handle") and {{name}} for one person.
 *
 * A missing Instagram handle renders as "your profile" rather than an empty
 * hole, and a missing first name as "there" ("Hi there,"). Unknown fields are
 * left in place, so the linter can refuse them by name.
 */
export function renderMergeFields(template: string, t: MergeTarget): string {
  return String(template || "").replace(MERGE_RE, (whole, key: string) => {
    if (key === "firstName") return prospectFirstName(t.name) || "there";
    if (key === "name") return t.name || "there";
    if (key === "instagram") return t.instagram ? `@${t.instagram.replace(/^@+/, "")}` : "your profile";
    return whole;
  });
}

// ── The linter ──────────────────────────────────────────────────────────────
//
// Deterministic, so the same text always gets the same verdict, and run on the
// SERVER at send time — the UI shows the same verdict live, but a crafted
// request cannot skip it. Errors block Send; warnings are advice.
//
// It checks the parts the admin writes (subject + body). The footer —
// unsubscribe link, address — is ours and added afterwards.

export const WORDS_MIN = 60;
export const WORDS_MAX = 180;
export const WORDS_IDEAL = [80, 150] as const;
/** Follow-ups and replies continue a conversation and should be shorter. */
const RANGES: Record<JobKind, { min: number; max: number; ideal: readonly [number, number] }> = {
  initial: { min: WORDS_MIN, max: WORDS_MAX, ideal: WORDS_IDEAL },
  followup: { min: 25, max: 140, ideal: [40, 100] },
  reply: { min: 10, max: 220, ideal: [30, 160] },
};
export const SUBJECT_LINT_MAX = 70;

export interface LintIssue {
  code: string;
  message: string;
}
export interface LintResult {
  ok: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
  words: number;
  links: string[];
}

/**
 * Phrases that filters and people both read as spam. Matched as whole words,
 * case-insensitively. Kept in code, NOT in the AI prompt — naming a phrase to
 * a model is the surest way to get it written.
 */
export const SPAM_PHRASES = [
  "earn money fast", "make money fast", "easy money", "free money", "get rich", "quick cash", "extra cash",
  "guaranteed", "guarantee", "100%", "risk-free", "risk free", "no risk", "click here", "click below",
  "limited time", "act now", "act fast", "urgent", "hurry", "don't miss out", "dont miss out", "once in a lifetime",
  "exclusive deal", "special promotion", "winner", "congratulations", "you have been selected", "you've been selected",
  "dear friend", "dear sir", "dear madam", "dear user", "double your", "passive income", "be your own boss",
  "work from home", "no strings attached", "no catch", "cash bonus", "money back", "lowest price", "best price",
  "buy now", "order now", "apply now", "sign up now", "join now", "instant", "unlimited earning", "unlimited income",
  "financial freedom", "million", "crore", "lakh", "lottery", "prize", "investment", "100 percent",
  "exciting opportunity", "amazing opportunity", "golden opportunity", "huge opportunity", "opportunity of a lifetime",
];

const SHORTENERS = /\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy|lnkd\.in|linktr\.ee)\b/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+|\b(?:[a-z0-9-]+\.)+(?:in|com|net|org|io|co|me|ly|app|link|xyz|ee|gl|at|cc|gd)\b(?:\/[^\s<>"')\]]*)?/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

/** Domains a prospect email may link to. */
export function isOurHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return h === "subhsandesh.in" || h.endsWith(".subhsandesh.in");
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SPAM_RE = new RegExp(
  `(?:^|[^a-z0-9])(${SPAM_PHRASES.map(escRe).sort((a, b) => b.length - a.length).join("|")})(?=$|[^a-z0-9])`,
  "i"
);

export function countWords(text: string): number {
  return (String(text || "").replace(MERGE_RE, "x").match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
}

export interface LintOptions {
  commissionPercent: number;
  /** The template, before rendering, for merge-field checks. Defaults to the text itself. */
  template?: { subject: string; body: string };
  /** Which email this is. A follow-up/reply continues a thread, so "Re:" is honest there. */
  kind?: JobKind;
}

export function lintOutreach(subject: string, body: string, o: LintOptions): LintResult {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const s = String(subject || "").trim();
  const b = String(body || "").replace(/\r\n/g, "\n").trim();
  const all = `${s}\n${b}`;
  const err = (code: string, message: string) => errors.push({ code, message });
  const warn = (code: string, message: string) => warnings.push({ code, message });

  // ── Subject ────────────────────────────────────────────────────────────
  if (!s) err("subject_empty", "Add a subject.");
  if (s.length > SUBJECT_LINT_MAX) err("subject_long", `Keep the subject under ${SUBJECT_LINT_MAX} characters (it is ${s.length}).`);
  const kind: JobKind = o.kind || "initial";
  if (kind === "initial" && /^\s*(re|fwd?)\s*:/i.test(s)) {
    err("subject_fake_reply", "Don't start a first email with “Re:” or “Fwd:” — it pretends to be a reply, and filters punish that.");
  }
  if (/!/.test(s)) warn("subject_bang", "Subjects without “!” read more like a person wrote them.");
  if ((s.match(EMOJI_RE) || []).length > 0) warn("subject_emoji", "An emoji in the subject is a promotional signal — consider removing it.");

  // ── Merge fields ───────────────────────────────────────────────────────
  const tpl = o.template ? `${o.template.subject}\n${o.template.body}` : all;
  const unknown = unknownMergeFields(tpl);
  if (unknown.length) err("merge_unknown", `Unknown merge field ${unknown.join(", ")} — only {{firstName}}, {{instagram}} and {{name}} are filled in.`);
  if (/\{\{|\}\}|\[(name|link|date|insert[^\]]*)\]/i.test(all.replace(MERGE_RE, ""))) {
    err("placeholder", "There's still a blank to fill in (like [name] or a stray {{ }}).");
  }

  // ── Length ─────────────────────────────────────────────────────────────
  const words = countWords(b);
  const r = RANGES[kind];
  if (words < r.min) err("too_short", `Too short (${words} words). Aim for ${r.ideal[0]}–${r.ideal[1]}.`);
  else if (words > r.max) err("too_long", `Too long (${words} words). Aim for ${r.ideal[0]}–${r.ideal[1]} — short emails get read.`);
  else if (words < r.ideal[0] || words > r.ideal[1]) warn("length", `${words} words — ${r.ideal[0]}–${r.ideal[1]} reads best.`);

  // ── Links ──────────────────────────────────────────────────────────────
  // Email addresses are not links; their domains must not be read as one.
  const noEmails = all.replace(/[^\s@<>()]+@[^\s@<>()]+/g, " ");
  const links = [...new Set((noEmails.match(URL_RE) || []).map((u) => u.replace(/[.,;:!?)]+$/, "")))];
  for (const u of links) {
    if (SHORTENERS.test(u)) { err("shortener", `Link shorteners (${u}) are a classic spam signal — use the full subhsandesh.in link.`); continue; }
    if (/^http:\/\//i.test(u)) { err("insecure_link", `Use https:// (${u}).`); continue; }
    let host = "";
    try { host = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname; } catch { host = u; }
    if (!isOurHost(host)) err("foreign_link", `Only subhsandesh.in links are allowed (${u}).`);
    else if (!/^https:\/\//i.test(u)) warn("bare_link", `Write the link in full (https://${u.replace(/^www\./i, "")}) so it is clickable everywhere.`);
  }
  if (links.length > 1) err("too_many_links", `One link only — this has ${links.length}. More links look like marketing.`);
  if (links.length === 0 && kind !== "reply") warn("no_link", "No link to the join page — they'll have to search for it.");
  if (/<\/?[a-z][^>]*>/i.test(b)) err("html", "Plain text only — remove the HTML tags.");

  // ── Spam wording ───────────────────────────────────────────────────────
  const spam = all.match(SPAM_RE);
  if (spam) err("spam_phrase", `“${spam[1]}” reads like spam to filters and people. Say it plainly instead.`);

  const caps = (all.replace(URL_RE, "").match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !["SUBHSANDESH"].includes(w));
  if (caps.length) err("all_caps", `No ALL-CAPS words (${[...new Set(caps)].slice(0, 3).join(", ")}).`);
  if (/!{2,}/.test(all)) err("bangs", "No “!!” — one exclamation mark at most, anywhere.");
  else if ((all.match(/!/g) || []).length > 2) err("bangs", "Too many exclamation marks — keep it to one or two.");
  if (/\?{2,}/.test(all)) err("questions", "No “??”.");
  const money = (all.match(/₹|\$|\brs\.?(?=\s*\d)|\binr\b/gi) || []).length;
  if (money > 1) err("money_symbols", "Mention money at most once — repeated ₹/$ amounts are a spam signal.");
  for (const m of all.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/gi)) {
    if (Math.abs(Number(m[1]) - o.commissionPercent) > 0.001) {
      err("wrong_percent", `It says ${m[0].trim()}, but the commission is ${o.commissionPercent}%.`);
      break;
    }
  }
  const emoji = (b.match(EMOJI_RE) || []).length;
  if (emoji > 1) err("emoji", "One emoji at most — several read as promotional.");

  // ── Shape ──────────────────────────────────────────────────────────────
  if (!/^(hi|hey|hello|namaste|dear)\b/i.test(b)) warn("greeting", "Open with “Hi {{firstName}},” — a personal greeting matters.");
  if (/unsubscribe/i.test(b)) warn("unsubscribe_in_body", "No need to mention unsubscribing — the footer has the link.");

  return { ok: errors.length === 0, errors, warnings, words, links };
}

// ── The email ───────────────────────────────────────────────────────────────

/** The public base of this API, for links that must reach the server. */
export function publicApiBase(
  explicit: string = env.PUBLIC_API_URL,
  shareBase: string = env.SHARE_BASE_URL,
  port: number = Number(env.PORT) || 5000
): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  try {
    const host = new URL(shareBase).hostname;
    if (host === "subhsandesh.in" || host === "www.subhsandesh.in") return "https://api.subhsandesh.in";
    const sub = host.match(/^([a-z0-9-]+)\.subhsandesh\.in$/);
    if (sub) return `https://${sub[1]}-api.subhsandesh.in`;
  } catch { /* fall through */ }
  return `http://localhost:${port}`;
}

export function unsubscribeUrl(token: string, base: string = publicApiBase()): string {
  return `${base}/api/public/prospects/unsubscribe/${encodeURIComponent(token)}`;
}

export interface ProspectMailContent {
  /** Rendered body, merge fields already filled. */
  body: string;
  signature: string;
  instagram: string;
  unsubscribeUrl: string;
  /** INF-XXXXXXXX, for replies whose headers were stripped. */
  token: string;
}

export function businessLine(): string {
  return `${BUSINESS.name}, ${BUSINESS.addressLines.join(", ")}`;
}

export function whyLine(instagram: string): string {
  return instagram
    ? `You're receiving this one-off note because I came across your Instagram (@${instagram}) and thought the programme might suit you.`
    : "You're receiving this one-off note because I came across your work as a creator and thought the programme might suit you.";
}

export function prospectMailText(c: ProspectMailContent): string {
  return [
    c.body.trim(),
    "",
    c.signature.trim(),
    "",
    "--",
    whyLine(c.instagram),
    `Not interested? Unsubscribe: ${c.unsubscribeUrl}`,
    businessLine(),
    `Ref: ${c.token}`,
  ].join("\n");
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Links shown as themselves — the visible text IS the href, never a disguise. */
function linkify(escaped: string): string {
  return escaped.replace(/\bhttps:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`);
}

/**
 * Minimal HTML that mirrors the text part line for line. No images, no
 * tracking pixel, no tables, no colours beyond grey for the footer — it should
 * look like an email a person typed in Gmail.
 */
export function prospectMailHtml(c: ProspectMailContent): string {
  const paras = (t: string) =>
    t
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`)
      .join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222">
<div style="max-width:600px">
${paras(c.body)}
<p style="margin:0 0 14px">${esc(c.signature.trim()).replace(/\n/g, "<br>")}</p>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#777">${esc(whyLine(c.instagram))}<br>
Not interested? <a href="${esc(c.unsubscribeUrl)}" style="color:#777">Unsubscribe</a>.<br>
${esc(businessLine())}<br>
Ref: ${esc(c.token)}</p>
</div>
</body></html>`;
}

/**
 * RFC 2369 + RFC 8058 one-click unsubscribe. Gmail and Yahoo show their own
 * "Unsubscribe" button from these, which is far better for reputation than a
 * spam-button press. The mailto goes to our reply address, where the inbound
 * pipeline reads it and unsubscribes them (see classifyProspectReply).
 */
export function prospectHeaders(unsubUrl: string, replyTo: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl}>, <mailto:${replyTo}?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ── Contact rules ───────────────────────────────────────────────────────────

export interface ProspectContactState {
  status: ProspectStatus;
  initialSentAt?: Date | null;
  followUpSentAt?: Date | null;
  lastContactedAt?: Date | null;
  deletedAt?: Date | null;
  email?: string;
}

/** Which kind of email this prospect is due, or null if none is allowed. */
export function prospectJobKind(p: ProspectContactState): JobKind | null {
  if (p.deletedAt || SUPPRESSED_STATUSES.includes(p.status)) return null;
  if (p.status === "replied") return "reply";
  if (!p.initialSentAt) return "initial";
  if (!p.followUpSentAt) return "followup";
  return null;
}

export type ContactVerdict = { ok: true; kind: JobKind } | { ok: false; reason: string };

/**
 * May we email this prospect now? The single gate, called when queueing AND
 * again by the worker immediately before sending, so a status that changed in
 * between (an unsubscribe, a reply, a join) always wins.
 */
export function canEmailProspect(
  p: ProspectContactState,
  now: Date = new Date(),
  followUpDays: number = env.PROSPECT_FOLLOWUP_DAYS
): ContactVerdict {
  if (p.deletedAt) return { ok: false, reason: "Deleted." };
  if (p.email && p.email.endsWith(".invalid")) return { ok: false, reason: "No usable email address." };
  switch (p.status) {
    case "unsubscribed": return { ok: false, reason: "Unsubscribed — never email again." };
    case "bounced": return { ok: false, reason: "Their address bounced." };
    case "not_interested": return { ok: false, reason: "Marked not interested." };
    case "joined": return { ok: false, reason: "Already joined — email them from their influencer page." };
  }
  const kind = prospectJobKind(p);
  if (!kind) return { ok: false, reason: "Already sent a first email and a follow-up. Wait for a reply." };
  if (kind === "followup") {
    const last = p.lastContactedAt ? new Date(p.lastContactedAt).getTime() : 0;
    const due = last + followUpDays * 86_400_000;
    if (now.getTime() < due) {
      const days = Math.ceil((due - now.getTime()) / 86_400_000);
      return { ok: false, reason: `Follow-up available in ${days} day${days === 1 ? "" : "s"}.` };
    }
  }
  return { ok: true, kind };
}

// ── Pacing ──────────────────────────────────────────────────────────────────

export interface PacingInput {
  sentLast24h: number;
  /** When the oldest of those sends happened — the cap frees up 24h after it. */
  oldestInWindow: Date | null;
  lastSentAt: Date | null;
  cap: number;
  minGapMs: number;
  now: Date;
}

export type PacingDecision = { send: true } | { send: false; until: Date; reason: "cap" | "gap" | "off" };

/** Is the next send allowed now, and if not, when? */
export function nextSendDecision(p: PacingInput): PacingDecision {
  if (p.cap <= 0) return { send: false, until: new Date(p.now.getTime() + 3_600_000), reason: "off" };
  if (p.sentLast24h >= p.cap) {
    const free = p.oldestInWindow ? p.oldestInWindow.getTime() + 86_400_000 : p.now.getTime() + 3_600_000;
    return { send: false, until: new Date(Math.max(free, p.now.getTime() + 1000)), reason: "cap" };
  }
  if (p.lastSentAt) {
    const next = p.lastSentAt.getTime() + p.minGapMs;
    if (next > p.now.getTime()) return { send: false, until: new Date(next), reason: "gap" };
  }
  return { send: true };
}

/** A rough "the last one goes out around …" for N queued, given the pacing. */
export function estimateFinish(queued: number, p: PacingInput): Date {
  const first = nextSendDecision(p);
  let t = first.send ? p.now.getTime() : first.until.getTime();
  let left = Math.max(0, p.cap - p.sentLast24h);
  if (!first.send && first.reason === "cap") left = p.cap;
  left -= 1;
  for (let i = 1; i < queued; i++) {
    if (left <= 0) {
      t += 86_400_000;
      left = p.cap;
    } else {
      t += p.minGapMs;
    }
    left--;
  }
  return new Date(t);
}

// ── Feedback: bounces, complaints, "please stop" replies ────────────────────

export interface SesFeedback {
  type: "bounce" | "complaint";
  permanent: boolean;
  recipients: string[];
}

/**
 * Read an SES bounce/complaint notification — either an identity feedback
 * notification (`notificationType`) or a configuration-set event
 * (`eventType`). Returns null for anything else, including deliveries.
 */
export function parseSesFeedback(payload: unknown): SesFeedback | null {
  const p = (payload || {}) as {
    notificationType?: string;
    eventType?: string;
    bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress?: string }[] };
    complaint?: { complainedRecipients?: { emailAddress?: string }[] };
  };
  const t = String(p.notificationType || p.eventType || "").toLowerCase();
  const addr = (list?: { emailAddress?: string }[]) =>
    (list || [])
      .map((r) => String(r.emailAddress || "").trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1"))
      .filter((a) => EMAIL_RE.test(a));
  if (t === "bounce") {
    return {
      type: "bounce",
      permanent: String(p.bounce?.bounceType || "").toLowerCase() === "permanent",
      recipients: addr(p.bounce?.bouncedRecipients),
    };
  }
  if (t === "complaint") {
    return { type: "complaint", permanent: true, recipients: addr(p.complaint?.complainedRecipients) };
  }
  return null;
}

export type ReplyClass = "unsubscribe" | "not_interested" | "reply";

/**
 * A reply that is really "stop emailing me" or "no thanks". Read from the
 * subject (the List-Unsubscribe mailto sets it to "unsubscribe") and the
 * opening of the TRIMMED body only — a long reply that mentions stopping
 * somewhere is a conversation, and is left for a human to read.
 */
export function classifyProspectReply(subject: string, body: string): ReplyClass {
  if (/^\s*(re:\s*)?unsubscribe\s*$/i.test(String(subject || ""))) return "unsubscribe";
  const head = String(body || "").trim();
  if (!head || head.length > 120) return "reply";
  if (/^(please\s+)?(unsubscribe|stop\b|remove\s+me|take\s+me\s+off|do\s*n[o']?t\s+(email|contact|mail)\s+me)/i.test(head)) {
    return "unsubscribe";
  }
  if (/^(no,?\s+thanks?|no\s+thank\s+you|not\s+interested)\b/i.test(head)) return "not_interested";
  return "reply";
}
