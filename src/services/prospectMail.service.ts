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
//                      (classic) · prospectPersonalText (personal)
//   · inbox check      inboxCheck — what makes this email read as personal
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
  type FollowerRange,
  type ProspectStatus,
} from "../models/InfluencerProspect";
import type { FirstTouch, JobKind, OutreachStyle } from "../models/ProspectMailJob";

export type { FirstTouch, OutreachStyle };

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
  fresh: { min: 40, max: 160, ideal: [60, 130] },
  reply: { min: 10, max: 220, ideal: [30, 160] },
};
/**
 * Personal (a note from Suyash) style: a first note is 50–100 words, a
 * follow-up is a 20–60 word nudge, a new email sits in between, a reply is a
 * conversation.
 */
const PERSONAL_RANGES: Record<JobKind, { min: number; max: number; ideal: readonly [number, number] }> = {
  initial: { min: 45, max: 110, ideal: [50, 100] },
  followup: { min: 15, max: 70, ideal: [20, 60] },
  fresh: { min: 30, max: 125, ideal: [40, 100] },
  reply: { min: 10, max: 160, ideal: [25, 130] },
};
/**
 * Connect (a hello asking to connect, no pitch): the first note is 35–70
 * words, its follow-up a 20–45 word bump.
 */
export const CONNECT_RANGES = {
  initial: { min: 35, max: 70, ideal: [40, 60] as const },
  followup: { min: 20, max: 45, ideal: [22, 40] as const },
};
/** Connect subject: 3–7 words that name them, no company, no pitch. */
export const CONNECT_SUBJECT_WORDS = [3, 7] as const;
export const SUBJECT_LINT_MAX = 70;
/** Classic: a first email's / new email's subject is 4–8 words, specific and honest. */
export const SUBJECT_WORDS = [4, 8] as const;
/** Personal: 2–6 words, the way a person titles a note ("Hey Om and Diya"). */
export const PERSONAL_SUBJECT_WORDS = [3, 8] as const;

/**
 * Subjects that say nothing about the email. A note from a team to someone
 * it has never met needs to say what it is about. Compared after lower-casing
 * and dropping punctuation; "quick question" is refused anywhere in it.
 */
export const GENERIC_SUBJECTS = [
  "hi", "hello", "hey", "hi there", "hello there", "collab", "collab idea", "collaboration", "question",
  "a question", "quick question", "quick note", "a quick note", "checking in", "following up", "follow up",
  "just checking in", "touching base", "important", "for you", "hi from subhsandesh", "hello from subhsandesh",
];
/** Words that make a subject read like an ad — refused in any subject. Linter only, never in a prompt. */
const SUBJECT_SPAM_RE = /(?:^|[^a-z0-9])(free|earn|earns|earning|earnings|offer|offers|opportunity|opportunities|guaranteed?|money|cash|deal|winner|prize|urgent|limited)(?=$|[^a-z0-9])|%|₹/i;

/**
 * The "reply no and I won't email again" / "unsubscribe" kind of line. The
 * owner does not want it in team notes: it reads like a mass mailing. The
 * protection it described stays, silently — a short "no" / "stop" reply is
 * still read by classifyProspectReply and suppresses them for good.
 */
const OPT_OUT_RE = /(\b(reply|write back|just say|respond)\b[^\n]{0,30}["“'‘]?\b(no|stop)\b|\b(won'?t|will not|never)\s+(email|mail|write to|message|contact|bother)\b[^\n]{0,20}\b(again|you)\b|\bunsubscribe\b|\bopt[- ]?out\b|\bremove you from\b|\bnot for you\b[^\n]{0,40}\b(ignore|no worries|no problem)\b)/i;
export const hasOptOutLine = (body: string) => OPT_OUT_RE.test(String(body || ""));

/** Drop whole paragraphs/lines that are an opt-out line. Never touches the rest. */
export function stripOptOutLines(body: string): string {
  return String(body || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !hasOptOutLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Problems with a first / new email's subject — empty when it is fine. Pure.
 * Classic: 4–8 words naming the collaboration. Personal: 2–6 words, like a
 * person writes one ("Hey Om and Diya", "Loved your couple reels"), with no
 * pitch words at all.
 */
export function subjectIssues(subject: string, style: OutreachStyle = "classic", touch: FirstTouch = "pitch"): LintIssue[] {
  const s = String(subject || "").replace(/\s+/g, " ").trim();
  const out: LintIssue[] = [];
  const personal = style === "personal";
  const connect = personal && touch === "connect";
  if (!s) return [{ code: "subject_empty", message: "Add a subject." }];
  const key = s.toLowerCase().replace(/[^\p{L}\p{N}@ ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (GENERIC_SUBJECTS.includes(key) || /\bquick question\b/.test(key)) {
    out.push({
      code: "subject_generic",
      message: personal
        ? "Say something real — e.g. “Hey Priya” or “Loved your couple reels” — not “quick question” or “hi” on its own."
        : "Say what the email is about — e.g. “Collab idea for @handle” — not “quick question” or “hi”.",
    });
  }
  const n = countWords(s);
  const [lo, hi] = connect ? CONNECT_SUBJECT_WORDS : personal ? PERSONAL_SUBJECT_WORDS : SUBJECT_WORDS;
  if (n < lo || n > hi) {
    out.push({
      code: "subject_words",
      message: connect
        ? `Keep the subject to ${lo}–${hi} words that name them — e.g. “Om & Diya, would love to connect” (it is ${n}).`
        : personal
        ? `Keep the subject to ${lo}–${hi} words, the way a person writes one — e.g. “Hey Om and Diya” or “A reel idea for you two” (it is ${n}).`
        : `Keep the subject to ${lo}–${hi} words, specific and honest, e.g. “A creator collab with SubhSandesh” (it is ${n}).`,
    });
  }
  const spam = s.match(SUBJECT_SPAM_RE);
  if (spam) out.push({ code: "subject_spam", message: `“${(spam[1] || spam[0]).trim()}” in a subject reads like an ad — ${personal ? "write it like a note to a friend" : "name the collaboration instead"}.` });
  else if (connect) {
    const pitch = s.match(CONNECT_RE);
    if (pitch) out.push({ code: "subject_pitch", message: `“${pitch[1]}” turns a hello into a pitch — try “<Name>, would love to connect”.` });
    else if (/\d/.test(s)) out.push({ code: "subject_number", message: "No numbers in a Connect subject." });
  } else if (personal) {
    const pitch = s.match(PITCH_RE);
    if (pitch) out.push({ code: "subject_pitch", message: `“${pitch[1]}” makes the subject a pitch — try “Hey <name>” or “A reel idea for you two”.` });
  }
  if (/!/.test(s)) out.push({ code: "subject_bang", message: "No “!” in the subject." });
  if ((s.match(EMOJI_RE) || []).length > 0) out.push({ code: "subject_emoji", message: "No emoji in the subject — it's a promotional signal." });
  if (/^\s*(re|fwd?)\s*:/i.test(s)) out.push({ code: "subject_fake_reply", message: "Don't start a new email with “Re:” or “Fwd:” — it pretends to be a reply, and filters punish that." });
  return out;
}

/**
 * A subject that always passes subjectIssues, for when the model's is weak.
 * Classic names the collaboration: "Collab idea for @handle",
 * "SubhSandesh x Om & Diya — a paid collab?". Personal names them and the
 * idea: "Om & Diya, a reel idea from SubhSandesh".
 */
export function fallbackSubject(o: {
  kind: "initial" | "fresh";
  person?: { name?: string; instagram?: string } | null;
  variant?: number;
  style?: OutreachStyle;
  template?: boolean;
  /** Personal first email: "connect" gets the hello subject (connectSubject). */
  touch?: FirstTouch;
}): string {
  if (o.style === "personal" && o.touch === "connect" && o.kind === "initial") return connectSubject(o);
  if (o.style === "personal") return personalFallbackSubject(o);
  const handle = String(o.person?.instagram || "").replace(/^@+/, "").trim();
  const name = String(o.person?.name || "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim();
  const shortName = name && countWords(name) <= 3 && !/\d/.test(name) ? name : prospectFirstName(name);
  const v = Math.abs(o.variant || 0) % 2;
  const candidates: string[] =
    o.kind === "fresh"
      ? [
          handle ? `Another collab idea for @${handle}` : "",
          shortName ? `A reel idea for ${shortName} from SubhSandesh` : "",
          "Another collab idea from SubhSandesh",
        ]
      : v === 0
        ? [handle ? `Collab idea for @${handle}` : "", shortName ? `SubhSandesh x ${shortName} — a paid collab?` : "", "A creator collab with SubhSandesh"]
        : [shortName ? `SubhSandesh x ${shortName} — a paid collab?` : "", handle ? `Collab idea for @${handle}` : "", "A creator collab with SubhSandesh"];
  for (const c of candidates) if (c && subjectIssues(c).length === 0 && c.length <= SUBJECT_LINT_MAX) return c;
  return o.kind === "fresh" ? "Another collab idea from SubhSandesh" : "A creator collab with SubhSandesh";
}

/** "Om & Diya" → "Om and Diya"; one person → their first name. */
export function greetingNames(full: string): string {
  const name = String(full || "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim();
  const couple = name.match(/^(\S+)(?:\s+\S+)?\s*(?:&|\+|\band\b)\s*(\S+)/i);
  if (couple) return `${prospectFirstName(couple[1])} and ${prospectFirstName(couple[2])}`;
  return prospectFirstName(name);
}

const isCouple = (name: string) => /\s(&|and|\+)\s/i.test(String(name || ""));

/** "Om & Diya" / "Om and Diya Sharma" → "Om & Diya"; one person → their first name. */
export function subjectNames(full: string): string {
  const name = String(full || "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim();
  const couple = name.match(/^(\S+)(?:\s+\S+)?\s*(?:&|\+|\band\b)\s*(\S+)/i);
  if (couple) return `${prospectFirstName(couple[1])} & ${prospectFirstName(couple[2])}`;
  return prospectFirstName(name);
}

/**
 * The personal style's subject for a first / new email. Deterministic on
 * purpose: it always names them and says what the note is about, so every
 * invite carries a proper subject instead of whatever the model tried
 * ("Hey Om and Diya", "Loved your couple reels"):
 *   A: "Om & Diya, a reel idea from SubhSandesh"
 *   B: "A little reel idea for Om & Diya"
 *   new email: "One more reel idea for Om & Diya"
 * A template (several recipients) uses {{firstName}} in place of the name.
 */
function personalFallbackSubject(o: { kind: "initial" | "fresh"; person?: { name?: string; instagram?: string } | null; variant?: number; template?: boolean }): string {
  const names = o.template ? "{{firstName}}" : o.person?.name ? subjectNames(o.person.name) : "";
  const v = Math.abs(o.variant || 0) % 2;
  const candidates: string[] =
    o.kind === "fresh"
      ? [names ? `One more reel idea for ${names}` : "", "One more reel idea from SubhSandesh"]
      : v === 0
        ? [names ? `${names}, a reel idea from SubhSandesh` : "", "A reel idea from SubhSandesh"]
        : [names ? `A little reel idea for ${names}` : "", "A little reel idea from SubhSandesh"];
  const probe = (c: string) => c.replace(/\{\{firstName\}\}/g, "Asha");
  for (const c of candidates) if (c && !/\d/.test(c) && subjectIssues(probe(c), "personal").length === 0 && probe(c).length <= SUBJECT_LINT_MAX) return c;
  return o.kind === "fresh" ? "One more reel idea from SubhSandesh" : "A reel idea from SubhSandesh";
}

/**
 * The Connect subject. Deterministic, human, names them, says nothing about
 * the company or an idea — it is a hello:
 *   A: "Om & Diya, would love to connect"
 *   B: "Hey Om & Diya, quick hello from Suyash"
 * A template (several recipients) uses {{firstName}} in place of the name.
 */
export function connectSubject(o: { person?: { name?: string } | null; variant?: number; template?: boolean; writer?: string }): string {
  const names = o.template ? "{{firstName}}" : o.person?.name ? subjectNames(o.person.name) : "";
  const w = o.writer ?? personalWriterName();
  const v = Math.abs(o.variant || 0) % 2;
  const candidates: string[] =
    v === 0
      ? [names ? `${names}, would love to connect` : "", "Would love to connect"]
      : [names ? `Hey ${names}, quick hello from ${w}` : "", `A quick hello from ${w}`];
  const probe = (c: string) => c.replace(/\{\{firstName\}\}/g, "Asha");
  for (const c of candidates) if (c && !/\d/.test(c) && subjectIssues(probe(c), "personal", "connect").length === 0 && probe(c).length <= SUBJECT_LINT_MAX) return c;
  return v === 0 ? "Would love to connect" : `A quick hello from ${w}`;
}

/**
 * Words that turn a note from Suyash into a promotion. Personal first emails,
 * follow-ups and new emails carry none of them (a reply, once they wrote
 * back, may) — the details come after they reply. Kept in code, never in the
 * AI prompt (naming a word to a model invites it). "partner" alone is fine —
 * people send these pages to their partner; "partnership" is a pitch.
 */
export const PERSONAL_PITCH_WORDS = [
  "collab", "collabs", "collaboration", "collaborations", "collaborate", "collaborating",
  "partnership", "partnerships", "opportunity", "opportunities", "brand", "brands", "branded",
  "promote", "promotes", "promoting", "promotion", "promotions", "promotional", "offer", "offers", "deal", "deals",
  "sponsor", "sponsors", "sponsored", "sponsorship", "campaign", "campaigns", "website", "websites", "platform", "platforms",
  "exclusive", "limited", "free", "earn", "earns", "earning", "earnings", "commission", "commissions",
  "sign up", "sign-up", "signup", "join now", "program", "programme", "programs", "programmes", "affiliate",
  "referral", "payout", "payouts", "income", "profit", "discount",
  "ad", "ads", "advert", "adverts", "advertise", "advertising", "advertisement", "promo", "promos", "marketing",
];

/**
 * Connect notes go further: they say nothing about the company or what it
 * makes, so on top of PERSONAL_PITCH_WORDS they refuse the company name,
 * product words, anything about money, and the prefixes below (collab…,
 * partner…, promot…, sponsor…, brand…). Linter only — never in a prompt.
 */
export const CONNECT_BANNED_WORDS = [
  "subhsandesh", "pages", "website", "websites", "app", "apps", "link", "links",
  "pay", "paid", "paying", "payment", "payments", "money", "earn", "earns", "earning", "earnings",
  "commission", "commissions", "offer", "offers", "deal", "deals", "free", "reel for us", "reels for us",
];
const CONNECT_PREFIXES = ["collab", "partner", "promot", "sponsor", "brand"];

/**
 * The first name the personal emails are written and signed by — the first
 * word of the signature ("Suyash"). Empty when the signature is a team's
 * ("Team SubhSandesh"), which switches the "I'm <name>" check off.
 */
export function personalWriterName(signature: string = env.PROSPECT_PERSONAL_SIGNATURE): string {
  const first = String(signature || "").trim().split(/\s+/)[0] || "";
  const word = first.replace(/[^\p{L}'-]+/gu, "");
  if (!word || /^(team|the|subhsandesh)$/i.test(word)) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Does the note introduce its writer — "I'm Suyash", "Suyash here", "this is Suyash"? */
export function introducesWriter(body: string, writer: string): boolean {
  if (!writer) return true;
  const w = escRe(writer);
  return new RegExp(`\\b(i['’]?m|i am|this is|it['’]?s|me)\\s+${w}\\b|\\b${w}\\s+(here|from|this side)\\b`, "i").test(String(body || ""));
}

/** A team sign-off in a note that is meant to come from one person. */
const TEAM_SIGNOFF_RE = /\b(team\s+subhsandesh|subhsandesh\s+team|the\s+subhsandesh\s+team)\b/i;

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
  /** Which rule set produced this verdict. */
  style: OutreachStyle;
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
const PITCH_RE = new RegExp(
  `(?:^|[^a-z0-9])(${PERSONAL_PITCH_WORDS.map(escRe).sort((a, b) => b.length - a.length).join("|")})(?=$|[^a-z0-9])`,
  "i"
);
const CONNECT_RE = new RegExp(
  `(?:^|[^a-z0-9])(${[...PERSONAL_PITCH_WORDS, ...CONNECT_BANNED_WORDS].map(escRe).sort((a, b) => b.length - a.length).join("|")}|(?:${CONNECT_PREFIXES.join("|")})[a-z]*)(?=$|[^a-z0-9])`,
  "i"
);
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
  /** Which rule set: "personal" (Primary-tab note) or "classic". Default classic. */
  style?: OutreachStyle;
  /** Follow-ups already sent to this person. The first carries no link; later ones may. */
  priorFollowups?: number;
  /** Personal: who writes it ("Suyash"). Defaults to personalWriterName(). */
  writer?: string;
  /**
   * The confirmed traction numbers this email may quote ("52.2K", "52K",
   * "2.75M", "3 months" — outreachProof.service proofAllowedNumbers). A
   * personal first email / follow-up still refuses every OTHER digit, %, ₹.
   */
  allowedNumbers?: string[];
  /**
   * Personal first email / follow-up: "connect" holds it to the Connect
   * profile (35–70 words, no company, no product, no money, no numbers, no
   * links, one question). Ignored for classic, a new email and a reply.
   */
  touch?: FirstTouch;
}

/** Is this email held to the Connect profile? */
export function isConnectProfile(o: { style?: OutreachStyle; kind?: JobKind; touch?: FirstTouch }): boolean {
  return o.style === "personal" && o.touch === "connect" && (o.kind === "initial" || o.kind === "followup");
}

/** Personal first email with a numbers line: a little more room (70–120 words). */
const PERSONAL_INITIAL_WITH_NUMBERS = { min: 55, max: 135, ideal: [70, 120] as const };
/** …and a follow-up that brings one number back: 30–80 words. */
const PERSONAL_FOLLOWUP_WITH_NUMBERS = { min: 15, max: 95, ideal: [30, 80] as const };

/** One regex for every allowed number form, matched as a whole token. */
function allowedNumbersRe(forms: string[] | undefined): RegExp | null {
  const list = [...new Set((forms || []).map((f) => String(f || "").trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  const alt = list.map((f) => escRe(f).replace(/\\s\+|\s+/g, "\\s+")).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}.,])(?:${alt})(?![\\p{L}\\p{N}]|[.,]\\d)`, "giu");
}

/** The text with the allowed number tokens blanked out. */
export function withoutAllowedNumbers(text: string, forms: string[] | undefined): string {
  const re = allowedNumbersRe(forms);
  return re ? String(text || "").replace(re, " ") : String(text || "");
}

/**
 * May this personal email carry a (subhsandesh.in) link? Never in the first
 * email or the first follow-up; yes in later follow-ups, a new email to
 * someone already written to, and a reply.
 */
export function personalLinkAllowed(kind: JobKind, priorFollowups = 0): boolean {
  if (kind === "initial") return false;
  if (kind === "followup") return priorFollowups >= 1;
  return true;
}

/** Text with @handles, email addresses and merge fields removed — for number checks. */
function withoutHandles(t: string): string {
  return String(t || "")
    .replace(/[^\s@<>()]+@[^\s@<>()]+/g, " ")
    .replace(/@[a-z0-9._]+/gi, " ")
    .replace(MERGE_RE, " ");
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
  if (s.length > SUBJECT_LINT_MAX) err("subject_long", `Keep the subject under ${SUBJECT_LINT_MAX} characters (it is ${s.length}).`);
  const kind: JobKind = o.kind || "initial";
  const style: OutreachStyle = o.style === "personal" ? "personal" : "classic";
  const personal = style === "personal";
  /** Personal anything-but-a-reply: the strict, no-pitch profile. */
  const coldPersonal = personal && kind !== "reply";
  /** Connect: a hello — stricter still (no company, no money, no numbers, no links). */
  const connect = isConnectProfile({ style, kind, touch: o.touch });
  const touch: FirstTouch = connect ? "connect" : "pitch";
  // A hello carries no numbers at all, confirmed or not.
  if (connect) o = { ...o, allowedNumbers: undefined };
  const linkOk = connect ? false : !coldPersonal || personalLinkAllowed(kind, o.priorFollowups || 0);
  // A first email and a new email carry their own subject, which must say
  // what the email is about. Follow-ups and replies are "Re: <subject>".
  if (kind === "initial" || kind === "fresh") {
    for (const i of subjectIssues(s, style, touch)) err(i.code, i.message);
    if (s && /^(?:[A-Z][a-z']+\s+){3,}[A-Z][a-z']+$/.test(s)) warn("subject_title_case", "Title Case Subjects Look Like Marketing — use sentence case.");
  } else {
    if (!s) err("subject_empty", "Add a subject.");
    if (/!/.test(s)) (personal ? err : warn)("subject_bang", "No “!” in the subject.");
    if ((s.match(EMOJI_RE) || []).length > 0) (personal ? err : warn)("subject_emoji", "No emoji in the subject — it's a promotional signal.");
  }

  // ── Merge fields ───────────────────────────────────────────────────────
  const tpl = o.template ? `${o.template.subject}\n${o.template.body}` : all;
  const unknown = unknownMergeFields(tpl);
  if (unknown.length) err("merge_unknown", `Unknown merge field ${unknown.join(", ")} — only {{firstName}}, {{instagram}} and {{name}} are filled in.`);
  if (/\{\{|\}\}|\[(name|link|date|insert[^\]]*)\]/i.test(all.replace(MERGE_RE, ""))) {
    err("placeholder", "There's still a blank to fill in (like [name] or a stray {{ }}).");
  }

  // ── Length ─────────────────────────────────────────────────────────────
  const words = countWords(b);
  const hasNumbers = !!o.allowedNumbers?.length && allowedNumbersRe(o.allowedNumbers)!.test(b);
  const r = connect
    ? CONNECT_RANGES[kind as "initial" | "followup"]
    : personal && hasNumbers && kind === "initial"
      ? PERSONAL_INITIAL_WITH_NUMBERS
      : personal && hasNumbers && kind === "followup"
        ? PERSONAL_FOLLOWUP_WITH_NUMBERS
        : (personal ? PERSONAL_RANGES : RANGES)[kind];
  if (words < r.min) err("too_short", `Too short (${words} words). Aim for ${r.ideal[0]}–${r.ideal[1]}.`);
  else if (words > r.max) err("too_long", `Too long (${words} words). Aim for ${r.ideal[0]}–${r.ideal[1]} — short emails get read.`);
  else if (words < r.ideal[0] || words > r.ideal[1]) warn("length", `${words} words — ${r.ideal[0]}–${r.ideal[1]} reads best.`);

  // ── Links ──────────────────────────────────────────────────────────────
  // Email addresses are not links; their domains must not be read as one.
  // @handles are not links either ("@theecouple.in" is an Instagram name).
  const noEmails = all.replace(/[^\s@<>()]+@[^\s@<>()]+/g, " ").replace(/(^|[^\w/])@[a-z0-9._]+/gi, "$1 ");
  const links = [...new Set((noEmails.match(URL_RE) || []).map((u) => u.replace(/[.,;:!?)]+$/, "")))];
  if (!linkOk && links.length) {
    err(
      "personal_link",
      connect
        ? `No links in a Connect note (${links[0]}) — it's a hello. The link comes after they reply.`
        : `No links in a ${kind === "initial" ? "first email" : "first follow-up"} (${links[0]}) — links are what push it into Promotions. The link can go in a later follow-up or after they reply.`
    );
  }
  for (const u of linkOk ? links : []) {
    if (SHORTENERS.test(u)) { err("shortener", `Link shorteners (${u}) are a classic spam signal — use the full subhsandesh.in link.`); continue; }
    if (/^http:\/\//i.test(u)) { err("insecure_link", `Use https:// (${u}).`); continue; }
    let host = "";
    try { host = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname; } catch { host = u; }
    if (!isOurHost(host)) err("foreign_link", `Only subhsandesh.in links are allowed (${u}).`);
    else if (!/^https:\/\//i.test(u)) warn("bare_link", `Write the link in full (https://${u.replace(/^www\./i, "")}) so it is clickable everywhere.`);
  }
  if (links.length > 1 && linkOk) err("too_many_links", `One link only — this has ${links.length}. More links look like marketing.`);
  if (links.length === 0 && kind !== "reply" && !personal) warn("no_link", "No link to the join page — they'll have to search for it.");
  if (/<\/?[a-z][^>]*>/i.test(b)) err("html", "Plain text only — remove the HTML tags.");

  // ── Spam wording ───────────────────────────────────────────────────────
  // The proof's own numbers ("2.75 million") are not spam wording.
  const spam = withoutAllowedNumbers(all, o.allowedNumbers).match(SPAM_RE);
  if (spam) err("spam_phrase", `“${spam[1]}” reads like spam to filters and people. Say it plainly instead.`);

  const caps = (all.replace(URL_RE, "").match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !["SUBHSANDESH"].includes(w));
  if (caps.length) err("all_caps", `No ALL-CAPS words (${[...new Set(caps)].slice(0, 3).join(", ")}).`);
  const bangCount = (all.match(/!/g) || []).length;
  if (/!{2,}/.test(all)) err("bangs", "No “!!” — one exclamation mark at most, anywhere.");
  else if (bangCount > (coldPersonal ? 1 : 2)) err("bangs", coldPersonal ? "One exclamation mark at most — a calm note reads like a person." : "Too many exclamation marks — keep it to one or two.");
  if (/\?{2,}/.test(all)) err("questions", "No “??”.");
  const money = (all.match(/₹|\$|\brs\.?(?=\s*\d)|\binr\b/gi) || []).length;
  if (money > 1) err("money_symbols", "Mention money at most once — repeated ₹/$ amounts are a spam signal.");
  for (const m of all.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b|percent\b)/gi)) {
    if (Math.abs(Number(m[1]) - o.commissionPercent) > 0.001) {
      err("wrong_percent", `It says ${m[0].trim()}, but the commission is ${o.commissionPercent}%.`);
      break;
    }
  }
  if (coldPersonal) {
    const scrubbed = withoutAllowedNumbers(withoutHandles(all.replace(URL_RE, " ")), o.allowedNumbers);
    const label = connect ? "Connect note" : kind === "initial" ? "first email" : kind === "fresh" ? "new email" : "follow-up";
    const num = scrubbed.match(/₹|\$|\brs\.?(?=\s*\d)|\binr\b|%|\d/i);
    if (num) {
      err(
        "personal_number",
        o.allowedNumbers?.length
          ? `Only the numbers from your traction screenshot can go in a ${label} (found “${num[0]}”) — no ₹, %, or other figures.`
          : `No numbers, ₹ or % in a ${label} (found “${num[0]}”) — the details come after they reply.`
      );
    }
    // A follow-up's subject is "Re: <the first email's subject>" — inherited,
    // not written now — so only its body is held to the pitch-word list.
    if (connect) {
      // The company stays out of the hello entirely; so does anything about
      // what it makes or money. The subject is checked by subjectIssues.
      const company = b.match(/subh\s*-?\s*sandesh/i);
      if (company) err("connect_company", "Leave “SubhSandesh” out of a Connect note — it's just a hello from you. Who you are and what you make come after they reply.");
      const pitch = b.replace(URL_RE, " ").replace(/subh\s*-?\s*sandesh/gi, " ").match(CONNECT_RE);
      if (pitch) err("pitch_word", `“${pitch[1]}” turns a hello into a pitch. Talk only about them and wanting to connect — the details come after they reply.`);
    } else {
      const pitch = (kind === "followup" ? b : all).replace(URL_RE, " ").match(PITCH_RE);
      if (pitch) err("pitch_word", `“${pitch[1]}” turns a note into a pitch. Say it the way you'd tell a friend — e.g. “make a reel together” — details after they reply.`);
    }
    const pays = (b.match(/\b(paid|pay|paying|payment|payments)\b/gi) || []).length;
    if (pays > 1) err("pay_twice", "Mention paying once, casually (“happy to pay for it, of course”) — more reads like an offer.");
    if ((all.match(EMOJI_RE) || []).length > 0) err("emoji", "No emoji in a note from one person to another stranger — it reads promotional.");
    if (hasOptOutLine(b)) err("opt_out_line", "Leave out “reply no / I won't email again / unsubscribe” lines — they read like a mass mailing. A “no” reply still stops all future emails automatically.");
    if (connect && !/\?/.test(b)) {
      err("no_question", "End with one easy question, e.g. “Would you be open to a quick chat this week?” — it's what gets a reply.");
    } else if (connect) {
      if ((b.match(/\?/g) || []).length > 2) warn("many_questions", "One question is easier to answer than three.");
    } else if (kind === "initial" || kind === "fresh") {
      if (!/\?/.test(b)) (kind === "initial" ? err : warn)("no_question", personal ? "Ask one soft question with a question mark, e.g. “Would you be up for making a reel together?” — a reply is what moves you to Primary." : "Ask one soft question, e.g. “Would you be open to a paid collab?” — a reply is what moves you to Primary.");
      else if ((b.match(/\?/g) || []).length > 2) warn("many_questions", "One question is easier to answer than three.");
    }
  }
  const emoji = (b.match(EMOJI_RE) || []).length;
  if (emoji > 1 && !coldPersonal) err("emoji", "One emoji at most — several read as promotional.");

  // ── Shape ──────────────────────────────────────────────────────────────
  if (!/^(hi|hey|hello|namaste|dear)\b/i.test(b)) {
    if (personal && (kind === "initial" || kind === "fresh")) err("greeting", "Open with “Hey {{firstName}},” — it's a note to one person.");
    else warn("greeting", `Open with “${personal ? "Hey" : "Hi"} {{firstName}},” — a personal greeting matters.`);
  }
  if (personal) {
    const writer = o.writer ?? personalWriterName();
    if (TEAM_SIGNOFF_RE.test(b)) err("team_signoff", `It comes from ${writer || "one person"} — drop the “Team SubhSandesh” line; the signature${writer ? ` “${writer}”` : ""} is added automatically.`);
    if (writer && !introducesWriter(b, writer)) {
      if (kind === "initial") err("no_intro", connect ? `Say who you are in the first person — e.g. “I'm ${writer}.”` : `Introduce yourself in the first person — e.g. “I'm ${writer} from SubhSandesh.”`);
      else if (kind === "fresh") warn("no_intro", `A line like “${writer} here again” reminds them who's writing.`);
    }
  }
  if (!personal && /unsubscribe/i.test(b)) warn("unsubscribe_in_body", "No need to mention unsubscribing — the footer has the link.");

  return { ok: errors.length === 0, errors, warnings, words, links, style };
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
    ? `You're receiving this one-off note because we came across your Instagram (@${instagram}) and thought the programme might suit you.`
    : "You're receiving this one-off note because we came across your work as a creator and thought the programme might suit you.";
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

// ── Personal style: a plain note from Suyash ──────────────────────────────────
//
// What Gmail files as Promotions is mostly decided by signals a one-to-one
// email never has: a List-Unsubscribe header, a newsletter footer, an HTML
// part, a brand or no-reply sender, sales vocabulary, links and numbers in a
// cold email, and open tracking. Personal style removes every one of them.
// It is written by Suyash — "Suyash" <suyash@subhsandesh.in> — in
// the first person ("I'm Suyash"; "we" only for the company), and goes out on
// the quiet SES lane (PROSPECT_SES_CONFIGURATION_SET: no open tracking).
// Opt-out is silent: a short "no" / "stop" reply is read by
// classifyProspectReply and suppresses them for good — no "reply no" line.

/**
 * The signature under personal mail: "Suyash", then a plain "SubhSandesh" line
 * (the company, on by default — PROSPECT_SIGNATURE_COMPANY_LINE), optionally
 * "subhsandesh.in" (PROSPECT_SIGNATURE_SITE_LINE, off) and the postal line.
 */
export function personalSignature(
  signature: string = env.PROSPECT_PERSONAL_SIGNATURE,
  includeAddress: boolean = env.PROSPECT_PERSONAL_INCLUDE_ADDRESS,
  siteLine: boolean = env.PROSPECT_SIGNATURE_SITE_LINE,
  companyLine: boolean = env.PROSPECT_SIGNATURE_COMPANY_LINE
): string {
  const sig = String(signature || "").replace(/\r\n/g, "\n").trim();
  const lines = [sig];
  if (companyLine && !/subhsandesh/i.test(sig)) lines.push("SubhSandesh");
  if (siteLine && !/subhsandesh\.in/i.test(sig)) lines.push("subhsandesh.in");
  if (includeAddress) lines.push(businessLine());
  return lines.join("\n");
}

/**
 * The signature under a Connect note and its follow-ups: just the writer's
 * first name ("Suyash") — no company line, no site, no address. The company is
 * introduced in the reply, once they have written back.
 */
export function connectSignature(signature: string = env.PROSPECT_PERSONAL_SIGNATURE): string {
  const writer = personalWriterName(signature);
  if (writer) return writer;
  return String(signature || "").replace(/\r\n/g, "\n").trim().split("\n")[0].trim() || "Suyash";
}

/**
 * The whole personal email: the body, a blank line, the signature. Nothing
 * else — no footer, no unsubscribe link, no visible Ref token. Replies are
 * matched by In-Reply-To/References and the sender address instead.
 */
export function prospectPersonalText(c: { body: string; signature: string; screenshotNote?: string }): string {
  const note = String(c.screenshotNote || "").trim();
  return [String(c.body || "").trim(), "", ...(note ? [note, ""] : []), String(c.signature || "").trim()].join("\n");
}

/**
 * The HTML twin of a personal email that carries the analytics screenshot —
 * what Gmail's own composer produces when a person pastes an image: the same
 * paragraphs, the image inline (cid:), the same signature. No layout tables,
 * no colours, no fonts, no links: it mirrors the text part line for line.
 * `src` is "cid:<id>" when sent and the CDN URL in the admin preview.
 */
export function prospectPersonalHtml(c: { body: string; signature: string; image: { src: string; alt: string; width?: number; height?: number } }): string {
  const para = (t: string) => `<div>${esc(t).replace(/\n/g, "<br>")}</div>`;
  const blocks = String(c.body || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const w = c.image.width ? Math.min(600, c.image.width) : 600;
  const h = c.image.width && c.image.height ? Math.round((c.image.height * w) / c.image.width) : 0;
  const img = `<div><img src="${esc(c.image.src)}" alt="${esc(c.image.alt)}" width="${w}"${h ? ` height="${h}"` : ""} style="max-width:100%;height:auto;border:1px solid #ddd"></div>`;
  const sig = para(String(c.signature || "").trim());
  return `<div dir="ltr">${blocks.map(para).join("<div><br></div>")}<div><br></div>${img}<div><br></div>${sig}</div>`;
}

export interface PersonalSender {
  fromAddress: string;
  fromName: string;
  /** Where replies go: the From address unless PROSPECT_PERSONAL_REPLY_TO_EMAIL is set. */
  replyToAddress: string;
}

const ADDR_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function personalSender(
  fromAddress: string = env.PROSPECT_PERSONAL_FROM_EMAIL,
  fromName: string = env.PROSPECT_PERSONAL_FROM_NAME,
  replyTo: string = env.PROSPECT_PERSONAL_REPLY_TO_EMAIL
): PersonalSender {
  const from = String(fromAddress || "").trim().toLowerCase();
  const rt = String(replyTo || "").trim().toLowerCase();
  return {
    fromAddress: from,
    fromName: String(fromName || "").replace(/[\r\n"<>]+/g, " ").trim(),
    replyToAddress: ADDR_RE.test(rt) ? rt : from,
  };
}

/**
 * The sender of a Connect note and its follow-ups: the personal sender, with
 * the display name PROSPECT_CONNECT_FROM_NAME when it is set (e.g. plain
 * "Suyash"); empty keeps the normal name ("Suyash").
 */
export function connectSender(connectFromName: string = env.PROSPECT_CONNECT_FROM_NAME, base: PersonalSender = personalSender()): PersonalSender {
  const name = String(connectFromName || "").replace(/[\r\n"<>]+/g, " ").trim();
  return name ? { ...base, fromName: name } : base;
}

/** The sender and signature one personal email goes out with. */
export function personalDress(touch: FirstTouch | undefined, kind: JobKind): { sender: PersonalSender; signature: string } {
  return isConnectProfile({ style: "personal", kind, touch })
    ? { sender: connectSender(), signature: connectSignature() }
    : { sender: personalSender(), signature: personalSignature() };
}

/**
 * Which first-touch profile one recipient's email is held to.
 *   initial   what the admin picked (Connect unless they chose Pitch).
 *   followup  the first email's: a follow-up to a Connect note stays a
 *             pitch-free bump until they reply.
 *   fresh / reply   always "pitch" — a reply is where the real context goes.
 * Classic mail is always "pitch".
 */
export function touchFor(
  e: { kind: JobKind; style: OutreachStyle; firstTouch?: FirstTouch | "" | null; lastReplyAt?: Date | null },
  requested: FirstTouch = "connect"
): FirstTouch {
  if (e.style !== "personal") return "pitch";
  if (e.kind === "initial") return requested === "pitch" ? "pitch" : "connect";
  if (e.kind === "followup") return e.firstTouch === "connect" && !e.lastReplyAt ? "connect" : "pitch";
  return "pitch";
}

/** support@, noreply@, influencer-support@ … — an address no person owns. */
export function isRoleAddress(addr: string): boolean {
  const local = String(addr || "").toLowerCase().split("@")[0] || "";
  return /^(no-?reply|support|help|info|hello|team|admin|contact|feedback|billing|verify|marketing|news|newsletter|influencer[-_.]?support|creators?|partners?|sales|mail|notifications?)$/.test(local);
}

/**
 * Is this a sender someone can write back to and trust? Our own domain, a
 * display name, and not a no-reply / notifications / marketing mailbox.
 * suyash@subhsandesh.in "Suyash" is fine; noreply@ is not.
 */
export function isTrustworthySender(s: { fromAddress: string; fromName: string }): boolean {
  const addr = String(s.fromAddress || "").toLowerCase();
  const local = addr.split("@")[0] || "";
  const host = addr.split("@")[1] || "";
  return (
    isOurHost(host) &&
    !!String(s.fromName || "").trim() &&
    !/^(no-?reply|do-?not-?reply|notifications?|marketing|news|newsletter|mailer|bounce)/.test(local)
  );
}

/**
 * Did SES refuse because the IAM policy does not allow this From address?
 * (ses:FromAddress condition.) A refusal on a configuration set is a
 * different problem with a different fix, so it is not counted.
 */
export function isSenderNotAllowedError(message: string): boolean {
  const m = String(message || "");
  if (/configuration-set/i.test(m)) return false;
  return /not authori[sz]ed to perform\W+ses:Send(Raw)?Email/i.test(m) || /ses:FromAddress/i.test(m);
}

export function personalSenderBlockedMessage(address: string, awsMessage = ""): string {
  // An email carrying the screenshot goes out as a raw MIME message, which IAM
  // checks as ses:SendRawEmail — a policy that only allows ses:SendEmail
  // refuses it even though the address is on the list. Say which one it was.
  if (/ses:SendRawEmail/i.test(awsMessage)) {
    return `Sender isn't allowed yet: SES refused the email with the screenshot from ${address} — the IAM policy allows ses:SendEmail but not ses:SendRawEmail, which an attached image needs. Add ses:SendRawEmail to the policy, or send without the screenshot. Nothing was sent from another address.`;
  }
  return `Sender isn't allowed yet: SES refused to send as ${address} (the IAM policy's ses:FromAddress list doesn't include it). Add it to the policy (add-personal-sender.sh) or switch these emails to Classic. Nothing was sent from another address.`;
}

export interface InboxCheckItem {
  ok: boolean;
  label: string;
  /** Not a blocker — shown with ⚠ (e.g. the quiet lane is not set up yet). */
  warn?: boolean;
}

/**
 * The quiet sending lane, as the server last saw it. "unknown": configured
 * but no send has used it yet. "ready": SES accepted a send on it.
 * "missing": SES said it does not exist / is not allowed, so sends fell back
 * to the default lane. "off": PROSPECT_SES_CONFIGURATION_SET is off.
 */
export interface QuietLaneState {
  configurationSet: string;
  state: "unknown" | "ready" | "missing" | "off";
  message: string;
}

export function quietLaneItem(q?: QuietLaneState | null): InboxCheckItem {
  if (!q || q.state === "unknown" || q.state === "ready") return { ok: true, label: "Quiet sending lane (no open tracking)" };
  if (q.state === "off") return { ok: false, warn: true, label: "Quiet lane switched off — sent on the default lane (open tracking on)" };
  return { ok: false, warn: true, label: `Quiet lane not set up yet — sending on the default lane (open tracking on) until SES has “${q.configurationSet}”` };
}

/**
 * What keeps this email in the inbox — shown next to Send. Every line is a
 * fact about the email as it will be sent (never a hope). Pure: derived from
 * the style, the sender, the subject and the linter's verdict.
 */
export function inboxCheck(o: {
  style: OutreachStyle;
  kind: JobKind;
  body: string;
  lint: LintResult;
  sender: { fromAddress: string; fromName: string };
  subject?: string;
  priorFollowups?: number;
  quietLane?: QuietLaneState | null;
  /** Personal: who writes it. Defaults to personalWriterName(). */
  writer?: string;
  /** The body quotes confirmed traction numbers. */
  numbers?: boolean;
  /** The analytics screenshot goes inline (multipart/related HTML + text). */
  image?: boolean;
  /** Connect note / its follow-up: the hello checklist. */
  touch?: FirstTouch;
}): InboxCheckItem[] {
  const codes = new Set(o.lint.errors.map((e) => e.code));
  const from = `${o.sender.fromName} <${o.sender.fromAddress}>`;
  if (isConnectProfile({ style: o.style, kind: o.kind, touch: o.touch })) {
    const r = CONNECT_RANGES[o.kind as "initial" | "followup"];
    const items: InboxCheckItem[] = [
      { ok: isTrustworthySender(o.sender), label: `From ${from}` },
      { ok: !codes.has("connect_company") && !codes.has("pitch_word") && !codes.has("subject_pitch") && !codes.has("team_signoff"), label: "No company pitch — just a hello" },
      { ok: !codes.has("personal_link") && !codes.has("personal_number") && !codes.has("subject_number") && !o.image, label: "No links, numbers or images" },
      { ok: !codes.has("no_question"), label: "Ends with one easy question" },
      { ok: !codes.has("too_short") && !codes.has("too_long"), label: `Short (${r.min}–${r.max} words)` },
    ];
    if (o.kind === "followup") items.push({ ok: /^re:/i.test(String(o.subject || "Re:").trim()), label: "Same thread (Re: + In-Reply-To)" });
    items.push(quietLaneItem(o.quietLane));
    return items;
  }
  if (o.style === "classic") {
    return [
      { ok: isTrustworthySender(o.sender), label: `From ${from}` },
      { ok: false, label: "HTML + text, with an unsubscribe footer" },
      { ok: false, label: "List-Unsubscribe header (Gmail reads it as bulk mail)" },
      { ok: o.lint.links.length <= 1, label: "One link to subhsandesh.in" },
      quietLaneItem(o.quietLane),
    ];
  }
  const writer = o.writer ?? personalWriterName();
  const items: InboxCheckItem[] = [
    { ok: isTrustworthySender(o.sender), label: `From ${from}` },
    { ok: !codes.has("no_intro") && !codes.has("team_signoff"), label: writer ? `Written by ${writer}, first person` : "Written by one person" },
    o.image
      ? { ok: false, warn: true, label: "Screenshot attached — images can nudge Gmail toward Promotions; numbers in the text alone are safest for a first email" }
      : { ok: true, label: "Plain text — no HTML or images" },
    { ok: true, label: "No unsubscribe header or newsletter footer" },
    quietLaneItem(o.quietLane),
  ];
  const subjectBad = [...codes].some((c) => c.startsWith("subject_"));
  const noPitch = !codes.has("personal_number") && !codes.has("pitch_word") && !codes.has("pay_twice") && !codes.has("emoji");
  if (o.kind === "initial") {
    items.push({ ok: !codes.has("personal_link"), label: "No links in the first email" });
    items.push({ ok: !subjectBad, label: "Short, human subject" });
    items.push({ ok: noPitch, label: o.numbers ? "No pitch words; only your confirmed traction numbers (no ₹, %)" : "No pitch words in the first email" });
    items.push({ ok: !codes.has("no_question"), label: "Asks one easy question" });
    items.push({ ok: !codes.has("opt_out_line"), label: "No “reply no / unsubscribe” line (a “no” reply still stops future emails)" });
    return items;
  }
  if (o.kind === "followup") {
    items.push({ ok: /^re:/i.test(String(o.subject || "Re:").trim()), label: "Follow-ups stay in the same thread (Re: + In-Reply-To)" });
    items.push(
      personalLinkAllowed("followup", o.priorFollowups || 0)
        ? { ok: o.lint.links.length <= 1 && !codes.has("foreign_link"), label: "At most one link, to subhsandesh.in" }
        : { ok: !codes.has("personal_link"), label: "No link in the first follow-up" }
    );
    items.push({ ok: noPitch, label: "No pitch words or numbers" });
    return items;
  }
  if (o.kind === "fresh") {
    items.push({ ok: !subjectBad, label: "Short, human new subject" });
    items.push({ ok: o.lint.links.length <= 1 && !codes.has("foreign_link"), label: "At most one link, to subhsandesh.in" });
    items.push({ ok: noPitch, label: "No pitch words or numbers" });
    return items;
  }
  items.push({ ok: /^re:/i.test(String(o.subject || "Re:").trim()), label: "Continues their thread (Re: + In-Reply-To)" });
  items.push({ ok: o.lint.links.length <= 1, label: "At most one link (you're in a conversation now)" });
  return items;
}

// ── Contact rules ───────────────────────────────────────────────────────────
//
// No fixed cap. After the first email the admin can always send another: a
// follow-up in the same thread, a new email, or a reply once they wrote back.
// Hard blocks only for unsubscribed / bounced / complained / joined (and a
// deleted row or a dead address). "Not interested" is allowed only with an
// explicit confirm. A send within 48 hours of the last one is a warning,
// never a block.

export const RECENT_SEND_HOURS = 48;

export interface ProspectContactState {
  status: ProspectStatus;
  initialSentAt?: Date | null;
  followUpSentAt?: Date | null;
  followUpCount?: number | null;
  lastContactedAt?: Date | null;
  lastReplyAt?: Date | null;
  complainedAt?: Date | null;
  deletedAt?: Date | null;
  email?: string;
  contactCount?: number | null;
}

/** Follow-ups sent so far (rows from before the counter count one if dated). */
export function priorFollowupsOf(p: { followUpCount?: number | null; followUpSentAt?: Date | null }): number {
  return Math.max(Number(p.followUpCount) || 0, p.followUpSentAt ? 1 : 0);
}

/** Which kind of email this prospect would get by default, or null if none is allowed. */
export function prospectJobKind(p: ProspectContactState): JobKind | null {
  const v = canEmailProspect(p);
  return v.ok ? v.kind : null;
}

export type ContactVerdict =
  | {
      ok: true;
      /** The default intent. */
      kind: JobKind;
      /** Every intent allowed now, default first. */
      kinds: JobKind[];
      /** Set when sending needs an explicit confirm (said not interested). */
      needsConfirm?: string;
      /** Set when the last email went out under 48 h ago — a warning, never a block. */
      recent?: string;
      /** A contacted prospect who has been quiet for PROSPECT_FOLLOWUP_DAYS. */
      followupDue?: boolean;
    }
  | { ok: false; reason: string };

/**
 * May we email this prospect now, and with which intents? The single gate,
 * called when queueing AND again by the worker immediately before sending,
 * so a status that changed in between (an unsubscribe, a bounce, a join)
 * always wins.
 */
export function canEmailProspect(
  p: ProspectContactState,
  now: Date = new Date(),
  followUpDays: number = env.PROSPECT_FOLLOWUP_DAYS
): ContactVerdict {
  if (p.deletedAt) return { ok: false, reason: "Deleted." };
  if (p.email && p.email.endsWith(".invalid")) return { ok: false, reason: "No usable email address." };
  switch (p.status) {
    case "unsubscribed":
      return { ok: false, reason: p.complainedAt ? "Marked an email as spam — never email again." : "Unsubscribed — never email again." };
    case "bounced": return { ok: false, reason: "Their address bounced." };
    case "joined": return { ok: false, reason: "Already joined — email them from their influencer page." };
  }
  const emailed = !!p.initialSentAt || (Number(p.contactCount) || 0) > 0;
  let kinds: JobKind[];
  if (!emailed) kinds = ["initial"];
  else if (p.status === "replied") kinds = ["reply", "followup", "fresh"];
  else if (p.lastReplyAt) kinds = ["followup", "fresh", "reply"];
  else kinds = ["followup", "fresh"];

  const out: ContactVerdict = { ok: true, kind: kinds[0], kinds };
  if (p.status === "not_interested") out.needsConfirm = "They said they're not interested. Send only if they asked to hear more.";
  const last = p.lastContactedAt ? new Date(p.lastContactedAt).getTime() : 0;
  if (last) {
    const hours = (now.getTime() - last) / 3_600_000;
    if (hours >= 0 && hours < RECENT_SEND_HOURS) {
      const h = Math.round(hours);
      out.recent = `Last email went ${hours < 1 ? "under an hour" : `${h} hour${h === 1 ? "" : "s"}`} ago — waiting ${RECENT_SEND_HOURS}h between emails reads better.`;
    }
    if (p.status === "contacted" && !p.lastReplyAt && now.getTime() >= last + followUpDays * 86_400_000) out.followupDue = true;
  }
  return out;
}

// ── Selection planning ──────────────────────────────────────────────────────
//
// Generate / Send on a multi-selection that mixes stages (some never emailed,
// some contacted, someone who replied). One intent per send: the admin picks
// it (or the most common default is used), everyone it fits is included, and
// everyone else is listed with the reason — nobody is skipped silently.

export interface PlanRow {
  id: string;
  name: string;
  verdict: ContactVerdict;
}

export interface SelectionPlan {
  intent: JobKind | null;
  included: { id: string; name: string }[];
  excluded: { id: string; name: string; reason: string }[];
  /** How many of the selection each intent would reach (for the picker). */
  reach: Record<JobKind, number>;
  /** Said not interested — included only when the admin confirms. */
  needsConfirm: { id: string; name: string }[];
}

const INTENT_ORDER: JobKind[] = ["initial", "followup", "fresh", "reply"];

function wrongIntentReason(intent: JobKind, v: Extract<ContactVerdict, { ok: true }>): string {
  if (intent === "initial") return "Already emailed — use Follow-up or New email.";
  if (intent === "reply") return v.kinds.includes("initial") ? "Not emailed yet — nothing to reply to." : "Hasn't replied — nothing to answer.";
  return "Not emailed yet — needs a first email.";
}

export function planSelection(rows: PlanRow[], o: { intent?: JobKind | null; allowNotInterested?: boolean } = {}): SelectionPlan {
  const reach = { initial: 0, followup: 0, fresh: 0, reply: 0 } as Record<JobKind, number>;
  const defaults = { initial: 0, followup: 0, fresh: 0, reply: 0 } as Record<JobKind, number>;
  for (const r of rows) {
    if (!r.verdict.ok) continue;
    for (const k of r.verdict.kinds) reach[k]++;
    defaults[r.verdict.kind]++;
  }
  let intent: JobKind | null = o.intent && INTENT_ORDER.includes(o.intent) ? o.intent : null;
  if (!intent) {
    let best = 0;
    for (const k of INTENT_ORDER) if (defaults[k] > best) { best = defaults[k]; intent = k; }
  }
  const plan: SelectionPlan = { intent, included: [], excluded: [], reach, needsConfirm: [] };
  for (const r of rows) {
    const v = r.verdict;
    if (!v.ok) { plan.excluded.push({ id: r.id, name: r.name, reason: v.reason }); continue; }
    if (!intent || !v.kinds.includes(intent)) { plan.excluded.push({ id: r.id, name: r.name, reason: wrongIntentReason(intent || "initial", v) }); continue; }
    if (v.needsConfirm && !o.allowNotInterested) {
      plan.needsConfirm.push({ id: r.id, name: r.name });
      plan.excluded.push({ id: r.id, name: r.name, reason: "Said not interested — confirm to include." });
      continue;
    }
    plan.included.push({ id: r.id, name: r.name });
  }
  return plan;
}

// ── Pacing ──────────────────────────────────────────────────────────────────

/** Local sending hours. start === end means "any time". */
export interface SendWindow {
  startHour: number;
  endHour: number;
  /** Minutes east of UTC — 330 for IST. */
  tzOffsetMinutes: number;
}

export function envSendWindow(): SendWindow {
  return {
    startHour: env.PROSPECT_SEND_START_HOUR,
    endHour: env.PROSPECT_SEND_END_HOUR,
    tzOffsetMinutes: env.PROSPECT_SEND_TZ_OFFSET_MINUTES,
  };
}

const DAY_MS = 86_400_000;

/** Is `now` inside the window, and if not, when does it next open? */
export function sendWindowState(now: Date, w: SendWindow): { open: true } | { open: false; opensAt: Date } {
  const start = ((w.startHour % 24) + 24) % 24;
  const end = ((w.endHour % 24) + 24) % 24;
  if (start === end) return { open: true };
  const off = w.tzOffsetMinutes * 60_000;
  const local = now.getTime() + off;
  const minute = Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60_000);
  const inside = start < end ? minute >= start * 60 && minute < end * 60 : minute >= start * 60 || minute < end * 60;
  if (inside) return { open: true };
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  let target = dayStart + start * 3_600_000;
  if (target <= local) target += DAY_MS;
  return { open: false, opensAt: new Date(target - off) };
}

/** A random gap in [minS, maxS] seconds, in ms — drawn once per send. */
export function pickGapMs(minS: number, maxS: number, rand: () => number = Math.random): number {
  const lo = Math.max(0, minS);
  const hi = Math.max(lo, maxS);
  return Math.round((lo + rand() * (hi - lo)) * 1000);
}

export interface PacingInput {
  sentLast24h: number;
  /** When the oldest of those sends happened — the cap frees up 24h after it. */
  oldestInWindow: Date | null;
  lastSentAt: Date | null;
  cap: number;
  minGapMs: number;
  /** The jittered gap drawn when the last email went out; wins over minGapMs. */
  lastGapMs?: number | null;
  /** Average gap, for the finish estimate. Defaults to minGapMs. */
  avgGapMs?: number;
  /** Local sending hours; absent = any time. */
  window?: SendWindow | null;
  /** Instant mode: ignore the window and the gap; only the cap still holds. */
  instant?: boolean;
  now: Date;
}

export type PacingDecision = { send: true } | { send: false; until: Date; reason: "cap" | "gap" | "off" | "window" };

/** Is the next send allowed now, and if not, when? */
export function nextSendDecision(p: PacingInput): PacingDecision {
  if (p.cap <= 0) return { send: false, until: new Date(p.now.getTime() + 3_600_000), reason: "off" };
  if (p.sentLast24h >= p.cap) {
    const free = p.oldestInWindow ? p.oldestInWindow.getTime() + 86_400_000 : p.now.getTime() + 3_600_000;
    return { send: false, until: new Date(Math.max(free, p.now.getTime() + 1000)), reason: "cap" };
  }
  if (p.instant) return { send: true };
  if (p.window) {
    const w = sendWindowState(p.now, p.window);
    if (!w.open) return { send: false, until: w.opensAt, reason: "window" };
  }
  if (p.lastSentAt) {
    const gap = typeof p.lastGapMs === "number" && p.lastGapMs > 0 ? p.lastGapMs : p.minGapMs;
    const next = p.lastSentAt.getTime() + gap;
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
  const gap = p.instant ? 2_000 : p.avgGapMs ?? p.minGapMs;
  const inWindow = (ms: number) => {
    if (!p.window || p.instant) return ms;
    const w = sendWindowState(new Date(ms), p.window);
    return w.open ? ms : w.opensAt.getTime();
  };
  t = inWindow(t);
  for (let i = 1; i < queued; i++) {
    if (left <= 0) {
      t += 86_400_000;
      left = p.cap;
    } else {
      t += gap;
    }
    t = inWindow(t);
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
  // A phone's automatic sign-off is not part of what they said.
  const head = String(body || "")
    .trim()
    .replace(/\n+\s*(sent from my [^\n]*|get outlook for [^\n]*|sent via [^\n]*)\s*$/i, "")
    .trim()
    .replace(/[’‘]/g, "'");
  if (!head || head.length > 120) return "reply";
  if (/^(please\s+|kindly\s+)?(unsubscribe|stop\b|remove\s+me|take\s+me\s+off|do\s*n[o']?t\s+(email|contact|mail|message|write\s+to)\s+me|never\s+(email|contact)\s+me)/i.test(head)) {
    return "unsubscribe";
  }
  if (/^(no,?\s+thanks?|no\s+thank\s+you|not\s+interested|not\s+for\s+me|i'?m\s+not\s+interested|i\s+am\s+not\s+interested|i'?ll\s+pass|i\s+will\s+pass|pass\b|not\s+my\s+thing)/i.test(head)) {
    return "not_interested";
  }
  // A bare no — with at most a polite tail — means no. "No problem, tell me
  // more" does not.
  if (/^["'“]?(no|nope|nah|na|nahi|nahin)["'”]?[\s.,!]*((thanks?|thank\s+you|thx|sorry|not\s+(interested|for\s+me|now|right\s+now)|i'?m\s+(good|okay|ok|not\s+interested)|i'?ll\s+pass)[\s.,!]*)*$/i.test(head)) {
    return "not_interested";
  }
  return "reply";
}
