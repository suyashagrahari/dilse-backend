// ─── Email threading: the header arithmetic ──────────────────────────────────
//
// Pure functions only. No SES client, no database. Everything here is decided
// from strings, so it can be tested exhaustively — which matters, because a
// threading bug is invisible until somebody's mail client shows two separate
// conversations and nobody can say why.
//
// ── HOW MAIL THREADING ACTUALLY WORKS ───────────────────────────────────────
//
// A client groups two messages when the second one names the first:
//
//   In-Reply-To: <id-of-the-message-being-answered>
//   References:  <id-of-first> <id-of-second> … <id-of-parent>
//
// `In-Reply-To` is the immediate parent. `References` is the whole ancestry, and
// it is what Gmail and Outlook actually lean on — a client that has never seen
// the parent can still place the message by any ancestor it recognises.
//
// ── THE PROBLEM SES CREATES, AND WHAT IT COSTS US ───────────────────────────
//
// From the SES documentation, verbatim:
//
//   "If you provide a Message-ID header, Amazon SES overrides the header with
//    its own value."
//
// So we cannot choose the id of anything we send. We are told SES's own id
// (`MessageId` in the API response) but NOT the `Message-ID` header it wrote,
// and those are different strings: the header is the API id with a domain
// glued on.
//
// That gluing is stable and widely relied on, but it is observed behaviour and
// not a documented API — see `rfcMessageIdFor`. Everything here therefore
// treats a reconstructed id as a GOOD GUESS and never as a fact:
//
//   · Outbound ids are stored with `source: "reconstructed"`.
//   · The moment a real reply arrives we have its true `Message-ID` from its own
//     headers, marked `source: "received"`, and every later send anchors to that
//     instead. From the second message on, the chain is exact.
//   · Subject is kept as an independent fallback — see `replySubject`. Gmail
//     threads on subject plus participants even when the headers say nothing, so
//     a wrong guess degrades to "still threaded" rather than "two conversations".
//
// Three mechanisms, deliberately overlapping, because we only control two of
// them and the one we don't control is the one that assigns the ids.

/** SES caps any one header value at 995 characters. `References` grows forever. */
export const HEADER_VALUE_MAX = 900;

const MESSAGE_ID_MAX = 400;

/**
 * The `Message-ID` header SES most likely wrote for a message it accepted.
 *
 * SES's API returns an id like `010001a05d94a634-…-000000`. The header on the
 * delivered message is that id with the sending region's SES domain appended;
 * `us-east-1` uses the bare `email.amazonses.com`, every other region uses its
 * own name.
 *
 * Returns "" for an empty id rather than a syntactically valid id for nothing,
 * so callers cannot accidentally anchor a thread to a message that was never
 * sent (SES is skipped entirely when it has no credentials).
 */
export function rfcMessageIdFor(sesMessageId: string, region: string): string {
  const id = String(sesMessageId || "").trim();
  if (!id) return "";
  // Already a full header value: hand it back untouched.
  if (id.includes("@")) return normalizeMessageId(id);

  const r = String(region || "").trim().toLowerCase() || "us-east-1";
  const domain = r === "us-east-1" ? "email.amazonses.com" : `${r}.amazonses.com`;
  return `<${id}@${domain}>`;
}

/**
 * One message id in canonical `<…>` form, or "" if it is not one.
 *
 * Mail clients are inconsistent about the angle brackets and about whitespace,
 * and an id compared with brackets against one stored without them silently
 * fails to match — which shows up as a reply that starts its own thread.
 */
export function normalizeMessageId(raw: string): string {
  let id = String(raw || "").trim();
  if (!id) return "";
  // Strip every layer of brackets, not one: `<<id>>` has been seen in the wild.
  while (id.startsWith("<")) id = id.slice(1).trim();
  while (id.endsWith(">")) id = id.slice(0, -1).trim();
  if (!id || /[\s<>]/.test(id)) return "";
  if (id.length > MESSAGE_ID_MAX) return "";
  return `<${id}>`;
}

/**
 * Every id in a `References` (or `In-Reply-To`) header, in order, deduplicated.
 *
 * The header is space-separated in theory and folded across lines with tabs and
 * commas in practice, so the split is on anything that is not part of an id.
 */
export function parseMessageIds(header: string): string[] {
  const text = String(header || "");
  if (!text.trim()) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  // Bracketed ids first — that is the correct form and the only unambiguous one.
  const bracketed = text.match(/<[^<>\s]+>/g) || [];
  for (const raw of bracketed) {
    const id = normalizeMessageId(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (out.length > 0) return out;

  // No brackets anywhere: some clients send a bare id. Accept it only if the
  // whole header looks like exactly one id, so prose is never mistaken for one.
  const bare = normalizeMessageId(text);
  return bare ? [bare] : [];
}

/**
 * The `References` value for a new message, capped to fit one SES header.
 *
 * RFC 5322 says to append and never trim, which is unbounded — a long
 * conversation would eventually exceed SES's 995-character limit and the send
 * would be refused outright. When it must be trimmed, the FIRST id is always
 * kept and the middle is dropped: the root is what places the message in the
 * conversation, and the tail is what places it in the right spot. The middle is
 * the only part no client needs.
 */
export function buildReferences(existing: string[], parentId: string): string {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...existing, parentId]) {
    const id = normalizeMessageId(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      chain.push(id);
    }
  }
  if (chain.length === 0) return "";

  let value = chain.join(" ");
  if (value.length <= HEADER_VALUE_MAX) return value;

  const root = chain[0];
  const tail = chain.slice(1);
  // Drop from the front of the tail until it fits. A single id longer than the
  // whole budget cannot fit with the root, so the root alone is the floor.
  while (tail.length > 0) {
    value = [root, ...tail].join(" ");
    if (value.length <= HEADER_VALUE_MAX) return value;
    tail.shift();
  }
  return root;
}

const RE_PREFIX = /^\s*(?:re|aw|sv|antw|ref|res|r)\s*(?:\[\d+\])?\s*:\s*/i;
const FWD_PREFIX = /^\s*(?:fw|fwd|forward)\s*(?:\[\d+\])?\s*:\s*/i;

/**
 * A subject with every `Re:` / `Fwd:` layer removed.
 *
 * Used two ways: to build one clean `Re:` for an outgoing reply, and as a
 * matching key for an inbound reply whose headers did not identify a thread.
 * Both need "Re: Re: RE: Fwd: Your Rakhi page" and "Your Rakhi page" to be the
 * same string.
 */
export function baseSubject(subject: string): string {
  let s = String(subject || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  // Loop: each pass strips one prefix, and clients stack them.
  for (let i = 0; i < 12; i++) {
    const next = s.replace(RE_PREFIX, "").replace(FWD_PREFIX, "");
    if (next === s) break;
    s = next.trim();
  }
  return s;
}

/** `Re:` exactly once, however many the thread's subject already carried. */
export function replySubject(subject: string): string {
  const base = baseSubject(subject);
  return base ? `Re: ${base}` : "Re:";
}

/** A subject reduced to a comparison key — case and spacing carry no meaning. */
export function subjectKey(subject: string): string {
  return baseSubject(subject).toLowerCase();
}

export interface ThreadMessageLike {
  direction: "outbound" | "inbound";
  rfcMessageId?: string;
  rfcMessageIdSource?: "received" | "reconstructed" | "";
  references?: string[];
}

export interface ThreadingHeaders {
  inReplyTo: string;
  references: string;
  /**
   * How much the headers can be trusted. "exact" when anchored to an id we read
   * off a real message; "reconstructed" when anchored to a guess at one of ours;
   * "none" when there is nothing to anchor to and this opens a thread.
   */
  confidence: "exact" | "reconstructed" | "none";
}

/**
 * The `In-Reply-To` and `References` for the next message in a conversation.
 *
 * The anchor is the LAST message that has an id — that is what the next message
 * is a reply to. Preferring a received id over a reconstructed one is tempting
 * and wrong: naming an older message as the parent puts the reply in the right
 * conversation but the wrong place in it, and `References` already carries every
 * exact id we know, which is what a client uses to place it.
 */
export function threadingHeadersFor(messages: ThreadMessageLike[]): ThreadingHeaders {
  const known: string[] = [];
  let anchor = "";
  let anchorSource: "received" | "reconstructed" | "" = "";

  for (const m of messages || []) {
    for (const r of m.references || []) {
      const id = normalizeMessageId(r);
      if (id && !known.includes(id)) known.push(id);
    }
    const own = normalizeMessageId(m.rfcMessageId || "");
    if (!own) continue;
    if (!known.includes(own)) known.push(own);
    anchor = own;
    anchorSource = m.rfcMessageIdSource || (m.direction === "inbound" ? "received" : "reconstructed");
  }

  if (!anchor) return { inReplyTo: "", references: "", confidence: "none" };

  return {
    inReplyTo: anchor,
    references: buildReferences(known.filter((id) => id !== anchor), anchor),
    confidence: anchorSource === "received" ? "exact" : "reconstructed",
  };
}

// ── Quoted history ──────────────────────────────────────────────────────────
//
// A reply arrives with the entire previous message pasted underneath it. Shown
// raw in the panel, a two-word answer ("no thanks") reads as a wall of text and
// the super admin has to hunt for the part the person actually wrote.
//
// Every marker below is a real one used by a real client. The raw body is kept
// alongside the trimmed one, because this heuristic can and will over-trim: a
// person who replies INLINE between quoted paragraphs loses everything after
// the first marker, and the only honest answer to that is to keep the original
// and let the reader expand it.

const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}/i,
  /^_{10,}$/,
  /^-{5,}\s*$/,
  /^on .{4,120}\bwrote:\s*$/i,
  /^on .{4,180}$/i, // Gmail folds "On <date>, <name>" and puts "wrote:" next line
  /^from:\s*.+$/i,
  /^sent from my /i,
  /^\s*>{1,}/,
  /^au[ßs]erdem am .+ schrieb/i,
  /^le .{4,120}a écrit\s*:/i,
];

/**
 * The part of a reply the person wrote, with the quoted original removed.
 *
 * Never returns "": a reply that is nothing but quoted text still has to be
 * readable, so in that case the whole thing comes back untouched.
 */
export function stripQuotedReply(text: string): string {
  const body = String(text || "").replace(/\r\n/g, "\n");
  if (!body.trim()) return "";

  const lines = body.split("\n");
  const firstFilled = lines.findIndex((l) => l.trim() !== "");

  // A marker on the FIRST written line means the whole message is quoted — a
  // reply with nothing above the quote, or a forward. There is nothing to trim
  // to, so it comes back whole.
  //
  // This guard was originally `i === 0`, which only skipped the literal first
  // line: a quote-only reply that began with a blank line, or whose second line
  // was also a quote marker, was cut down to its own first quoted line. The
  // first line WRITTEN is the thing that matters, not the first line stored.
  if (firstFilled >= 0 && QUOTE_MARKERS.some((re) => re.test(lines[firstFilled].trim()))) {
    return body.trim();
  }

  let cut = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i <= firstFilled) continue;

    const isMarker = QUOTE_MARKERS.some((re) => re.test(line));
    if (!isMarker) continue;

    // "On <something>" alone is only a quote header if "wrote:" follows within
    // a line or two — otherwise it is an ordinary sentence starting with "On".
    if (/^on /i.test(line) && !/\bwrote:\s*$/i.test(line)) {
      const next = (lines[i + 1] || "").trim() + " " + (lines[i + 2] || "").trim();
      if (!/\bwrote:/i.test(next)) continue;
    }

    cut = i;
    break;
  }

  if (cut <= 0) return body.trim();

  const kept = lines.slice(0, cut).join("\n").trim();
  return kept || body.trim();
}
