// ─── AI form-fill — the frozen contract ──────────────────────────────────────
//
// LEAD-OWNED AND FROZEN. Import from here; do not extend it.
//
// A template's editor holds its personalisation in one state slot (`mf`). This
// file describes, per template, WHICH leaves of that object the model is
// allowed to write and what belongs in each one. Everything downstream — the
// JSON schema handed to the model, the validation of what comes back, the
// client-side patch application, the "which fields are still empty" list — is
// derived from these declarations. There is exactly one source of truth and it
// lives on the server, so the two repos cannot drift.
//
// ── THE THREE RULES THAT DECIDE THIS FEATURE ─────────────────────────────────
//
//   1. THE MODEL NEVER WRITES MEDIA. Not a photo, not an audio clip, not an
//      avatar, not a URL of any kind. `FieldKind` has no member for it, so
//      there is no way to declare such a field, and `assertNoMediaPaths`
//      rejects any path that even looks like one. A hallucinated image URL
//      renders as a broken page, and a hallucinated audio URL renders as a
//      dead player — both are worse than an empty slot the sender fills in.
//
//   2. A FIELD THE MODEL LEAVES EMPTY IS NOT AN ERROR. It is reported back as
//      `missing` so the form can point the sender at it. The whole promise of
//      this feature is "AI fills what it can, you edit anything", so a partial
//      fill must be a normal outcome and not a failure state.
//
//   3. EVERY GENERATED STRING IS IN THE SENDER'S OWN LANGUAGE AND SCRIPT.
//      Hinglish stays Hinglish. This is inherited from the Court of Love
//      service, where it turned out to be the single thing that decides whether
//      the output reads as the sender's voice or as a machine's.

/**
 * The kinds a field may declare.
 *
 * Deliberately small, and deliberately missing a "media"/"url" member — see
 * rule 1 above. Adding one would let a schema author hand the model a slot for
 * a fabricated S3 link, and no amount of downstream validation recovers from a
 * page that renders a 404 where a photo should be.
 */
export type FieldKind = "text" | "longtext" | "list" | "date" | "number" | "enum";

/** Hard ceilings. A schema may ask for less, never for more. */
export const FILL_LIMITS = {
  /** Per template. Beyond this the single model call stops being reliable. */
  maxFields: 40,
  /**
   * `text` vs `longtext` signals INPUT-vs-TEXTAREA to the form, not length.
   *
   * This started at 120 and was wrong. Real single-value fields in these
   * templates run longer than a name: a search-result snippet is ~200
   * characters, a radio host's dedication line ~160, a caught-item line 140.
   * Three schema authors independently hit the old ceiling on fields that were
   * correctly typed, which is the signal that the number was arbitrary rather
   * than protective.
   */
  text: 240,
  longtext: 1200,
  /** Items in a list field. */
  listItems: 12,
  /** Chars per list item. */
  listItemChars: 240,
  /** The sender's own story. A prompt, not a novel. */
  story: 4000,
  /** Below this there is not enough material to write anything true from. */
  minStory: 20,
  /** The distilled, accumulated context carried between templates. */
  context: 3000,
  /** Names the sender types into the composer. */
  name: 40,
} as const;

export interface AiFillField {
  /**
   * Path to a leaf of the editor's `mf` object: `sender.name`,
   * `segments[0].caption`, `posts[2].caption`. Parsed by `parsePath`, which is
   * mirrored byte-for-byte on the client — the grammar is the interop surface,
   * so it is intentionally tiny: dot-separated keys and `[n]` integer indices.
   */
  path: string;
  /** Human label. Shown next to the field in the form and in the "still empty" list. */
  label: string;
  kind: FieldKind;
  /** Chars for text/longtext, items for list, ignored otherwise. Clamped to FILL_LIMITS. */
  max?: number;
  /** Chars per item, list only. */
  itemMax?: number;
  /** enum only. The model may return nothing, but never something off this list. */
  options?: readonly string[];
  /**
   * What belongs in this slot, addressed to the model.
   *
   * This is the highest-leverage string in the whole feature. "The recipient's
   * name" produces a name; "the name the sender actually calls her, as it
   * appears in their story — a pet name if they use one, never a formal name
   * they would not say out loud" produces the page they wanted.
   */
  guide: string;
  /**
   * A short example of the register, never of the content. The model is told
   * explicitly not to reuse it — it is there to pin tone and length, and an
   * example that leaks into output is worse than no example.
   */
  example?: string;
  /**
   * The page reads as broken without this one. Drives the "still needs you"
   * list in the form; it does NOT make a missing value an error. See rule 2.
   */
  required?: boolean;
}

export interface AiFillTemplateSchema {
  slug: string;
  /**
   * One or two sentences telling the model what this page IS, in the second
   * person, as if briefing a writer. The model has never seen the template, so
   * this is the only thing standing between "a love page" and the specific
   * conceit this particular template runs on.
   */
  premise: string;
  /** Drives pronouns, relationship words, and how much affection is appropriate. */
  audience: "partner" | "bestfriend" | "friend";
  fields: readonly AiFillField[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Path grammar — mirrored on the client, so keep the two in step
// ═══════════════════════════════════════════════════════════════════════════

export type PathSegment = { kind: "key"; key: string } | { kind: "index"; index: number };

const PATH_RE = /^[A-Za-z_$][\w$]*(\[\d+\])*(\.[A-Za-z_$][\w$]*(\[\d+\])*)*$/;

/**
 * Parse `a.b[0].c` into segments. Returns null for anything that is not a
 * plain, literal path.
 *
 * Rejecting by allow-list rather than by scanning for bad characters is the
 * point: `__proto__`, `constructor` and `prototype` are ordinary identifiers
 * and would sail through a blacklist of punctuation, so they are named and
 * refused explicitly below. A schema is server-authored, but the patch that
 * comes back from the model is not trusted, and it is checked against this same
 * function before anything is written.
 */
export function parsePath(path: string): PathSegment[] | null {
  if (typeof path !== "string" || !path || path.length > 200) return null;
  if (!PATH_RE.test(path)) return null;

  const segments: PathSegment[] = [];
  for (const part of path.split(".")) {
    const key = part.replace(/\[\d+\]/g, "");
    if (key === "__proto__" || key === "constructor" || key === "prototype") return null;
    segments.push({ kind: "key", key });
    for (const m of part.matchAll(/\[(\d+)\]/g)) {
      const index = Number(m[1]);
      // An index this large is a schema typo, and honouring it would have us
      // allocate a sparse array of that length while filling a form.
      if (!Number.isSafeInteger(index) || index > 50) return null;
      segments.push({ kind: "index", index });
    }
  }
  return segments;
}

// ═══════════════════════════════════════════════════════════════════════════
// Media refusal — rule 1, enforced rather than remembered
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Words that mean "a file lives here" on their own, wherever they appear in a
 * camelCase leaf name: `avatarUrl`, `coverImage`, `photos`, `audioClip`,
 * `thumbSrc`. Any one of these present and the field is media.
 */
const MEDIA_WORDS = new Set([
  "url", "urls", "uri", "href", "src", "photo", "photos", "image", "images",
  "img", "avatar", "audio", "video", "thumb", "thumbnail", "file", "files",
  "attachment", "asset",
]);

/**
 * Words that mean media only when they stand alone.
 *
 * `cover` is the whole reason this second tier exists. `coverImage` and a bare
 * `cover: string` are both files; `coverLine` is a line of text and has every
 * right to be AI-filled. The first version of this check matched these as bare
 * substrings and refused `coverLine` at boot — a schema author hit it, could
 * not declare a legitimate text field, and dropped it. A safety rule that
 * silently costs correct fields is miscalibrated, not merely strict.
 *
 * `media` is here for the same reason (`mediaUrl` yes, `mediaNote` no).
 */
const AMBIGUOUS_WORDS = new Set(["cover", "media", "picture", "pic"]);

/** Split `coverImageUrl` into ["cover","image","url"]; `photo_url` likewise. */
function leafWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+|\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

/**
 * True when the leaf names a file rather than text.
 *
 * Deliberately errs toward refusing: a false positive costs one field, which a
 * schema author will notice at boot and can work around. A false negative
 * hands the model a slot for a fabricated URL, which nobody notices until a
 * published page renders a broken image.
 */
export function isMediaLeaf(key: string): boolean {
  const words = leafWords(key);
  if (words.some((w) => MEDIA_WORDS.has(w))) return true;
  if (words.length === 1 && AMBIGUOUS_WORDS.has(words[0])) return true;
  return false;
}

/**
 * Returns the offending paths. Empty means the schema is clean.
 *
 * Run over every schema at server start by `index.ts`, so a schema that hands
 * the model a photo slot fails the boot rather than a user's page.
 */
export function assertNoMediaPaths(schema: AiFillTemplateSchema): string[] {
  const bad: string[] = [];
  for (const f of schema.fields) {
    const segs = parsePath(f.path);
    if (!segs) {
      bad.push(`${f.path} (unparseable)`);
      continue;
    }
    const lastKey = [...segs].reverse().find((s) => s.kind === "key");
    if (lastKey && lastKey.kind === "key" && isMediaLeaf(lastKey.key)) {
      bad.push(`${f.path} (media leaf)`);
    }
  }
  return bad;
}

/**
 * Full structural validation of a schema. Returns the problems found.
 *
 * Called at boot for every registered template. The checks are the boring ones
 * — duplicate paths, enum with no options, a `max` above the hard ceiling —
 * and every one of them is a mistake that would otherwise surface as a
 * confusing model response rather than as an obvious error.
 */
/**
 * Property names the response envelope owns.
 *
 * A template must not declare a top-level key equal to any of these. The
 * failure it prevents is not a clash that throws — it is far quieter and much
 * worse. `court-marriage` addresses a certificate whose form holds a `fields`
 * array, so its paths read `fields[0].label`; the envelope of the day also
 * called its answers object `fields`, and the model was handed a request for
 * `fields[0].label` INSIDE `fields`. It read that as recursion and emitted
 * ~4,400 lines of repetition for a form whose real answer is 400 characters,
 * every time, arriving as a 500 and then as a permanent 503 for that one
 * template.
 *
 * Nothing about that was visible in the schema, the types, or any unit test.
 * So the rule is enforced here, at boot, over every registered template.
 */
export const RESERVED_ENVELOPE_KEYS: readonly string[] = [
  "language",
  "languageName",
  "excludedKeywords",
  "filled_values",
];

export function validateSchema(schema: AiFillTemplateSchema): string[] {
  const problems: string[] = [...assertNoMediaPaths(schema)];

  for (const f of schema.fields) {
    const first = parsePath(f.path)?.[0];
    if (first?.kind === "key" && RESERVED_ENVELOPE_KEYS.includes(first.key)) {
      problems.push(
        `${f.path}: top-level key "${first.key}" collides with a response-envelope key — ` +
          `this makes the model recurse and run away (see RESERVED_ENVELOPE_KEYS)`
      );
    }
  }

  if (!schema.slug) problems.push("missing slug");
  if (!schema.premise || schema.premise.length < 20) {
    problems.push("premise is missing or too short to brief a writer with");
  }
  if (schema.fields.length === 0) problems.push("no fields");
  if (schema.fields.length > FILL_LIMITS.maxFields) {
    problems.push(`${schema.fields.length} fields exceeds maxFields=${FILL_LIMITS.maxFields}`);
  }

  const seen = new Set<string>();
  for (const f of schema.fields) {
    if (seen.has(f.path)) problems.push(`duplicate path ${f.path}`);
    seen.add(f.path);

    if (!f.guide || f.guide.length < 10) {
      problems.push(`${f.path}: guide is too thin to steer the model`);
    }
    if (f.kind === "enum" && (!f.options || f.options.length === 0)) {
      problems.push(`${f.path}: enum with no options`);
    }
    if (f.kind === "text" && (f.max ?? 0) > FILL_LIMITS.text) {
      problems.push(`${f.path}: max exceeds text ceiling`);
    }
    if (f.kind === "longtext" && (f.max ?? 0) > FILL_LIMITS.longtext) {
      problems.push(`${f.path}: max exceeds longtext ceiling`);
    }
    if (f.kind === "list" && (f.max ?? 0) > FILL_LIMITS.listItems) {
      problems.push(`${f.path}: max exceeds list ceiling`);
    }
  }

  return problems;
}

// ═══════════════════════════════════════════════════════════════════════════
// What crosses the wire
// ═══════════════════════════════════════════════════════════════════════════

/** The schema as the client sees it. Same shape, minus nothing — it is not secret. */
export type WireField = AiFillField;

export interface WireSchema {
  slug: string;
  audience: AiFillTemplateSchema["audience"];
  fields: readonly WireField[];
}

/**
 * The result of one fill, as the SERVER sees it.
 *
 * ── READ THE FIELD NAMES CAREFULLY ───────────────────────────────────────────
 *
 * `modelFilled` / `modelMissing` describe what the MODEL WROTE. They are NOT
 * what the form ends up showing, and they must never be rendered as though
 * they were.
 *
 * The client's `applyPatch` produces its own `filled` / `missing`, describing
 * what actually LANDED — which differs whenever the sender had already typed
 * something, because their text is protected and the model's value for that
 * slot is discarded. Rendering the server's list would credit the AI with
 * lines the sender wrote themselves, which is precisely the thing that makes
 * someone feel the page is not theirs.
 *
 * These two were originally both called `filled`/`missing`, one on each side
 * of the wire, with different meanings. That is a trap, so the wire pair is
 * named for its origin and the client pair keeps the plain names.
 */
export interface FillResult {
  patch: Record<string, unknown>;
  /** Paths the model returned a usable value for. Diagnostics, not UI. */
  modelFilled: string[];
  /** Paths the model declined or fumbled. Diagnostics, not UI. */
  modelMissing: string[];
  language: string;
  languageName: string;
}
