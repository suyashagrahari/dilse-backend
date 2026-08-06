import { Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import StreakPage, {
  ICheckInDay,
  ICheckInEntry,
  IMicroLetter,
  IMilestone,
  IPerson,
  Side,
  STREAK_LIMITS,
} from "../models/StreakPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/** "a" or "b", or null. There is no third side and no default guess. */
const asSide = (v: unknown): Side | null => (v === "a" || v === "b" ? v : null);

/**
 * Every write goes through an explicit allow-list of the seven content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: `count`, `record`, `status`, `totalDays`, `longest` and
 * every other number on screen. They are derived from `checkIns` by
 * `deriveStreak`/`deriveStats` on read, so there is nothing here for a caller
 * to lie about — and nothing that can drift away from the ledger.
 */
type StreakBody = {
  pair?: unknown;
  startedOn?: unknown;
  timezone?: unknown;
  checkIns?: unknown;
  covers?: unknown;
  milestones?: unknown;
  microLetters?: unknown;
  password?: unknown;
};

// ─── Time — the same rules the client contract uses ──────────────────────────
//
// Duplicated here rather than imported because the client contract is frozen
// and lives in a different package. Every day boundary on this server goes
// through `dayKeyInZone` with the PAIR's timezone, never the process timezone —
// a couple in Bengaluru and Toronto must share a definition of "today".

/** "2026-08-07" for an instant, in the pair's zone. Falls back to UTC. */
const dayKeyInZone = (ms: number, timezone: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
};

/** "2026-08-07" + 3 → "2026-08-10". Pure calendar arithmetic, zone-free. */
const addDays = (dayKey: string, n: number): string => {
  const t = Date.parse(`${dayKey}T00:00:00Z`);
  if (Number.isNaN(t)) return dayKey;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
};

/** Whole days from `from` to `to`. Negative if `to` precedes `from`. */
const daysBetween = (from: string, to: string): number => {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
};

/** A day is COMPLETE when both checked in, or when one was covered for. */
const isComplete = (day: ICheckInDay | undefined): boolean => {
  if (!day) return false;
  if (day.covered) return Boolean(day.a || day.b);
  return Boolean(day.a && day.b);
};

// ─── Media ───────────────────────────────────────────────────────────────────

/**
 * Media arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and this document grows by a row every day.
 *
 * An upload failure is logged and yields an empty string rather than a 500.
 * Every photo in this template is optional and the contract is explicit that a
 * failed upload must still leave the check-in valid.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, STREAK_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `streak/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, STREAK_LIMITS.url);
  } catch (error) {
    console.error("Streak image upload error:", error);
    return "";
  }
};

// ─── Sanitisers ──────────────────────────────────────────────────────────────

const sanitizePerson = async (raw: unknown, userId: unknown, slot: string): Promise<IPerson> => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(src.id, STREAK_LIMITS.personId) || slot,
    name: str(src.name, STREAK_LIMITS.name),
    photoUrl: await resolveImageUrl(src.photoUrl, userId, `pair-${slot}`),
  };
};

const sanitizePair = async (
  raw: unknown,
  userId: unknown
): Promise<{ a: IPerson; b: IPerson }> => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    a: await sanitizePerson(src.a, userId, "a"),
    b: await sanitizePerson(src.b, userId, "b"),
  };
};

/**
 * One partner's entry for one day. Optional keys are omitted rather than set to
 * "" — `noteViewFor` treats a falsy note as "no note at all", and the share
 * projection below keys off presence.
 */
const sanitizeEntry = async (raw: unknown, userId: unknown): Promise<ICheckInEntry | undefined> => {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const entry: ICheckInEntry = {
    word: str(src.word, STREAK_LIMITS.word),
    at: str(src.at, STREAK_LIMITS.timestamp) || new Date().toISOString(),
  };
  const photoUrl = await resolveImageUrl(src.photoUrl, userId, "checkin");
  if (photoUrl) entry.photoUrl = photoUrl;
  const note = str(src.note, STREAK_LIMITS.note).trim();
  if (note) entry.note = note;
  return entry;
};

/**
 * The ledger. Deduplicated by date (a later duplicate wins per side) and sorted
 * chronologically, because every derivation on the client walks it in order.
 */
const sanitizeCheckIns = async (raw: unknown, userId: unknown): Promise<ICheckInDay[]> => {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<string, ICheckInDay>();
  for (const item of raw.slice(0, STREAK_LIMITS.maxRawItems)) {
    if (byDate.size >= STREAK_LIMITS.maxCheckInDays) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const date = str(src.date, STREAK_LIMITS.date).trim();
    if (!date) continue;
    const day: ICheckInDay = byDate.get(date) ?? { date };
    const a = await sanitizeEntry(src.a, userId);
    const b = await sanitizeEntry(src.b, userId);
    if (a) day.a = a;
    if (b) day.b = b;
    const covered = asSide(src.covered);
    if (covered) day.covered = covered;
    byDate.set(date, day);
  }
  return [...byDate.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
};

/** Capped and floored. Covers are a kindness, not a currency. */
const sanitizeCovers = (raw: unknown): { a: number; b: number } => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    a: int(src.a, 0, STREAK_LIMITS.maxCovers, 0),
    b: int(src.b, 0, STREAK_LIMITS.maxCovers, 0),
  };
};

const sanitizeMilestones = (raw: unknown): IMilestone[] => {
  if (!Array.isArray(raw)) return [];
  const out: IMilestone[] = [];
  for (const item of raw.slice(0, STREAK_LIMITS.maxRawItems)) {
    if (out.length >= STREAK_LIMITS.maxMilestones) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const letter = str(src.letter, STREAK_LIMITS.letter).trim();
    if (!letter) continue;
    const milestone: IMilestone = {
      atDay: int(src.atDay, 0, STREAK_LIMITS.maxCheckInDays, 0),
      letter,
    };
    // Set once, the first time it is opened. Never cleared.
    const openedOn = str(src.openedOn, STREAK_LIMITS.timestamp).trim();
    if (openedOn) milestone.openedOn = openedOn;
    out.push(milestone);
  }
  return out.sort((x, y) => x.atDay - y.atDay);
};

const sanitizeMicroLetters = (raw: unknown): IMicroLetter[] => {
  if (!Array.isArray(raw)) return [];
  const out: IMicroLetter[] = [];
  for (const item of raw.slice(0, STREAK_LIMITS.maxRawItems)) {
    if (out.length >= STREAK_LIMITS.maxMicroLetters) break;
    const src = (item ?? {}) as Record<string, unknown>;
    const line = str(src.line, STREAK_LIMITS.microLine).trim();
    if (!line) continue;
    out.push({ week: int(src.week, 1, STREAK_LIMITS.maxMicroLetters, 1), line });
  }
  return out.sort((x, y) => x.week - y.week);
};

// ─── The sealed note projection ──────────────────────────────────────────────

/** What a recipient is allowed to hold. Structurally the same as a stored day. */
export interface PublicCheckInDay {
  date: string;
  a?: ICheckInEntry;
  b?: ICheckInEntry;
  covered?: Side;
}

/**
 * SECURITY PROPERTY: a partner's sealed note must not reach the other side on
 * the current day until that side has checked in themselves.
 *
 * Someone inspecting the raw network response for today, before checking in,
 * must find no note text anywhere in it. That is achieved by BUILDING A NEW
 * OBJECT for the current day's entries and copying across only the fields a
 * viewer has earned — never by `delete`-ing a key off a loaded Mongoose
 * document (which leaves the value one `toObject()` away) and never by a
 * `select` string that a future refactor can widen without noticing.
 *
 * Only the CURRENT day is filtered. Every past day's notes are already earned
 * and are sent whole.
 *
 * `viewerSide` is null when the caller has not proved which half of the pair
 * they are. In that case NEITHER side's current-day note is sent — an unknown
 * viewer has, by definition, not checked in.
 *
 * `viewerSide` MUST come from `viewerSideFrom`, which resolves it from a
 * per-side token. It must never be taken from a self-declared parameter: an
 * earlier draft of this read `?side=a|b` straight off the query string, and a
 * partner who had not checked in could simply claim to be the side that had,
 * at which point the projection dutifully released the note it was written to
 * withhold. The gate is only as honest as the identity feeding it.
 *
 * TWO HONEST LIMITS, stated rather than glossed:
 *
 *   1. Anyone who obtains the OTHER partner's link can read as them. The token
 *      identifies a link, not a person, and these are unauthenticated share
 *      URLs — the same trust level as the password gate on every other
 *      template. Forwarding your link hands over your side. The tokens make
 *      the side unguessable; they do not make it unforwardable.
 *
 *   2. This is a CEREMONY, not a security boundary, and it is deliberately
 *      weaker than the Capsule seal. The capsule spec requires that sealed
 *      content be unreachable even by inspection, so a sealed capsule's text
 *      never leaves the process. Here the note does leave the process, for the
 *      holder of one of two links, and the protection is the unguessability of
 *      that link. Do not assume the two have equal guarantees; if a future
 *      feature needs the capsule's standard, it needs the capsule's design.
 */
export const projectSharedCheckIns = (
  days: ICheckInDay[],
  todayKey: string,
  viewerSide: Side | null
): PublicCheckInDay[] =>
  days.map((day) => {
    if (day.date !== todayKey) return day;

    // Earned only by having checked in yourself. Not by time, not by tapping.
    const viewerCheckedIn = viewerSide !== null && Boolean(day[viewerSide]);
    const out: PublicCheckInDay = { date: day.date };
    if (day.covered) out.covered = day.covered;

    for (const side of ["a", "b"] as Side[]) {
      const entry = day[side];
      if (!entry) continue;
      // The viewer's own note is theirs; they wrote it.
      const mayReadNote = viewerCheckedIn || side === viewerSide;
      const projected: ICheckInEntry = { word: entry.word, at: entry.at };
      if (entry.photoUrl) projected.photoUrl = entry.photoUrl;
      if (mayReadNote && entry.note) projected.note = entry.note;
      out[side] = projected;
    }
    return out;
  });

/** The two per-side tokens, as read off a document that asked for them. */
export interface SideTokens {
  sideTokenA?: string;
  sideTokenB?: string;
}

/**
 * Constant-time string compare.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length
 * check has to come first. That check is not itself constant-time, but all it
 * discloses is the length of a UUID, which is a published constant.
 */
const tokenMatches = (candidate: string, stored: string | undefined): boolean => {
  if (!stored || !candidate) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

/**
 * Resolve which half of the pair is reading, from `?k=<token>`.
 *
 * The token is matched against the two stored per-side tokens; anything that
 * matches neither yields `null`, which the projection treats as the strictest
 * case (no current-day note for either side). There is no fallback to a
 * self-declared `?side=` — see the long note on `projectSharedCheckIns` for
 * what that fallback cost.
 */
export const viewerSideFrom = (req: Request, tokens: SideTokens): Side | null => {
  const raw = req.query.k;
  const candidate = typeof raw === "string" ? raw : "";
  if (!candidate) return null;
  if (tokenMatches(candidate, tokens.sideTokenA)) return "a";
  if (tokenMatches(candidate, tokens.sideTokenB)) return "b";
  return null;
};

/**
 * The registry-facing form of the note gate.
 *
 * `share.controller`'s generic `/share/:shareId` resolver walks every template
 * model and returns whatever it finds, so without this hook today's sealed
 * notes would be readable through that route while this template's own route
 * held the line. A security property that depends on which URL the reader
 * happened to use is not a security property.
 *
 * The tokens are `select: false`, so a resolver that fetched the document
 * without naming them gets a second, narrow query rather than a silent
 * downgrade to "unknown viewer" — a bypass and a false negative are both wrong,
 * just in opposite directions.
 */
export const projectSharedStreakData = async (
  pageObj: Record<string, unknown>,
  req: Request,
  now = Date.now()
): Promise<Record<string, unknown>> => {
  let tokens: SideTokens = {
    sideTokenA: typeof pageObj.sideTokenA === "string" ? pageObj.sideTokenA : undefined,
    sideTokenB: typeof pageObj.sideTokenB === "string" ? pageObj.sideTokenB : undefined,
  };
  if (!tokens.sideTokenA && !tokens.sideTokenB && pageObj._id) {
    const doc = await StreakPage.findById(String(pageObj._id))
      .select("+sideTokenA +sideTokenB")
      .lean<SideTokens | null>();
    if (doc) tokens = { sideTokenA: doc.sideTokenA, sideTokenB: doc.sideTokenB };
  }

  const viewerSide = viewerSideFrom(req, tokens);
  const timezone = typeof pageObj.timezone === "string" ? pageObj.timezone : "";
  const days = Array.isArray(pageObj.checkIns) ? (pageObj.checkIns as ICheckInDay[]) : [];
  // The tokens are the reader's identity. They must not travel in the body —
  // one of them would hand the recipient the other side as well.
  const { sideTokenA: _a, sideTokenB: _b, ...rest } = pageObj;
  return {
    ...rest,
    checkIns: projectSharedCheckIns(days, dayKeyInZone(now, timezone), viewerSide),
  };
};

/**
 * The two links the sender sends out — one per partner. They are the only
 * way a recipient is identified, so a sender who forwards the wrong one hands
 * over the wrong side.
 */
export const buildSideShareUrls = (baseShareUrl: string, tokens: SideTokens) => {
  const join = (token: string | undefined) =>
    token ? `${baseShareUrl}${baseShareUrl.includes("?") ? "&" : "?"}k=${token}` : baseShareUrl;
  return { a: join(tokens.sideTokenA), b: join(tokens.sideTokenB) };
};

// ─── Handlers ────────────────────────────────────────────────────────────────

export const createStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as StreakBody;

    const page = await StreakPage.create({
      userId: req.userId,
      pair: await sanitizePair(b.pair, req.userId),
      startedOn: str(b.startedOn, STREAK_LIMITS.date),
      timezone: str(b.timezone, STREAK_LIMITS.timezone),
      checkIns: await sanitizeCheckIns(b.checkIns, req.userId),
      covers: sanitizeCovers(b.covers),
      milestones: sanitizeMilestones(b.milestones),
      microLetters: sanitizeMicroLetters(b.microLetters),
      password: str(b.password, STREAK_LIMITS.password),
    });

    // `select: false` governs queries, not the document `create` hands back, so
    // the freshly-minted tokens are stripped by hand here. They are handed out
    // as links at publish time, never as bare values.
    const { sideTokenA: _a, sideTokenB: _b, ...data } =
      page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;

    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error("Create streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyStreakPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await StreakPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my streak pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await StreakPage.findOne({ _id: req.params.id, userId: req.userId }).select(
      "+sideTokenA +sideTokenB"
    );
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const raw = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;
    // The owner gets the two LINKS, not the two raw tokens — there is nothing
    // they can do with a bare token that a link does not do better, and a token
    // loose in an editor payload is one copy-paste from the wrong inbox.
    const { sideTokenA: _a, sideTokenB: _b, ...pageObj } = raw;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
      pageObj.shareUrl = shareUrl;
      // One per partner. `pair.a` gets `shareUrlA`, `pair.b` gets `shareUrlB`.
      const urls = buildSideShareUrls(shareUrl, page);
      pageObj.shareUrlA = urls.a;
      pageObj.shareUrlB = urls.b;
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as StreakBody;

    const page = await StreakPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.pair         !== undefined) page.pair         = await sanitizePair(b.pair, req.userId);
    if (b.startedOn    !== undefined) page.startedOn    = str(b.startedOn, STREAK_LIMITS.date);
    if (b.timezone     !== undefined) page.timezone     = str(b.timezone, STREAK_LIMITS.timezone);
    if (b.checkIns     !== undefined) page.checkIns     = await sanitizeCheckIns(b.checkIns, req.userId);
    if (b.covers       !== undefined) page.covers       = sanitizeCovers(b.covers);
    if (b.milestones   !== undefined) page.milestones   = sanitizeMilestones(b.milestones);
    if (b.microLetters !== undefined) page.microLetters = sanitizeMicroLetters(b.microLetters);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, STREAK_LIMITS.password) !== "") {
      page.password = str(b.password, STREAK_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

/**
 * The daily write. IDEMPOTENT ON (pageId, date, side).
 *
 * The check-ins are embedded in the page document, so there is no compound
 * unique index available to lean on — the guard is this lookup. If that side
 * already has an entry for that date, the existing state is returned with a
 * 200 and `alreadyCheckedIn: true`. A double-submit, a retried request on a
 * flaky train connection, or two taps in the same second must all produce one
 * check-in and never an error: the recipient did the thing they were asked to
 * do, and telling them otherwise is the one failure this template cannot have.
 *
 * A photo URL that is absent, empty, or fails to upload still produces a valid
 * check-in. The word is the check-in; the photo is a bonus.
 */
export const checkInStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as Record<string, unknown>;
    const side = asSide(b.side);
    if (!side) { res.status(400).json({ success: false, error: "side must be 'a' or 'b'" }); return; }

    const page = await StreakPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    // The pair's day, never the server's or the device's.
    const date =
      str(b.date, STREAK_LIMITS.date).trim() || dayKeyInZone(Date.now(), page.timezone);

    const existingDay = page.checkIns.find((d) => d.date === date);
    if (existingDay?.[side]) {
      res.json({
        success: true,
        alreadyCheckedIn: true,
        data: page.toObject({ flattenMaps: true }),
      });
      return;
    }

    const entry: ICheckInEntry = {
      word: str(b.word, STREAK_LIMITS.word),
      at: new Date().toISOString(),
    };
    const photoUrl = await resolveImageUrl(b.photoUrl, req.userId, "checkin");
    if (photoUrl) entry.photoUrl = photoUrl;
    const note = str(b.note, STREAK_LIMITS.note).trim();
    if (note) entry.note = note;

    if (existingDay) {
      existingDay[side] = entry;
    } else {
      if (page.checkIns.length >= STREAK_LIMITS.maxCheckInDays) {
        res.status(409).json({ success: false, error: "Check-in log is full" });
        return;
      }
      page.checkIns.push({ date, [side]: entry } as ICheckInDay);
      page.checkIns.sort((x, y) => (x.date < y.date ? -1 : 1));
    }
    page.markModified("checkIns");

    await page.save();
    res.json({
      success: true,
      alreadyCheckedIn: false,
      data: page.toObject({ flattenMaps: true }),
    });
  } catch (error) {
    console.error("Streak check-in error:", error);
    res.status(500).json({ success: false, error: "Failed to check in" });
  }
};

/**
 * Spend one of `side`'s covers on the most recent day that got away.
 *
 * The balance is floored at 0 and can never go negative: a side with nothing to
 * spend is refused before anything is written, and the decrement itself is
 * clamped. `covered` records the side that SPENT, matching the contract's "set
 * when one partner spent a cover for the other".
 */
export const coverStreakDay = async (req: Request, res: Response): Promise<void> => {
  try {
    const side = asSide((req.body as Record<string, unknown>).side);
    if (!side) { res.status(400).json({ success: false, error: "side must be 'a' or 'b'" }); return; }

    const page = await StreakPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const available = Math.max(0, Math.min(STREAK_LIMITS.maxCovers, page.covers?.[side] ?? 0));
    if (available <= 0) {
      res.status(400).json({ success: false, error: "No covers available" });
      return;
    }

    const today = dayKeyInZone(Date.now(), page.timezone);
    const byDate = new Map(page.checkIns.map((d) => [d.date, d]));

    // Walk back from yesterday — today is still in progress and is never missed.
    let target = "";
    for (let i = 1; i <= STREAK_LIMITS.maxCheckInDays; i++) {
      const key = addDays(today, -i);
      if (page.startedOn && daysBetween(page.startedOn, key) < 0) break;
      if (!isComplete(byDate.get(key))) { target = key; break; }
    }

    if (!target) {
      res.status(400).json({ success: false, error: "Nothing to cover" });
      return;
    }

    const day = byDate.get(target);
    if (day) {
      day.covered = side;
    } else {
      page.checkIns.push({ date: target, covered: side });
      page.checkIns.sort((x, y) => (x.date < y.date ? -1 : 1));
    }
    page.covers[side] = Math.max(0, available - 1);
    page.markModified("checkIns");
    page.markModified("covers");

    await page.save();
    res.json({
      success: true,
      data: page.toObject({ flattenMaps: true }),
      coveredDate: target,
      coversLeft: page.covers[side],
    });
  } catch (error) {
    console.error("Streak cover error:", error);
    res.status(500).json({ success: false, error: "Failed to spend cover" });
  }
};

export const publishStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await StreakPage.findOne({ _id: req.params.id, userId: req.userId }).select(
      "+sideTokenA +sideTokenB"
    );
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "streak",
      pageId: String(page._id),
      isAlreadyPublished: !!page.isPublished,
    });

    if (!gate.allowed) {
      res.status(gate.httpStatus).json({ success: false, error: gate.error, pricing: gate.pricing });
      return;
    }

    page.isPublished = true;
    await page.save();

    const { buildShareUrl } = await import("../utils/shareUrl");
    const shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    // TWO links, one per partner. Sending the same link to both would make them
    // the same reader as far as the note gate is concerned.
    const urls = buildSideShareUrls(shareUrl, page);
    res.json({
      success: true,
      data: { shareId: page.shareId, shareUrl, shareUrlA: urls.a, shareUrlB: urls.b },
    });
  } catch (error) {
    console.error("Publish streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    // The tokens are `select: false`; this route needs them to identify the
    // reader, and strips them back out before responding.
    const page = await StreakPage.findOne({ shareId: req.params.shareId, isPublished: true }).select(
      "+sideTokenA +sideTokenB"
    );
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj;

    // The sealed-note gate. See `projectSharedCheckIns` — the current day's
    // entries are rebuilt field by field so an unearned note is never in the
    // response body at all, and the reader's side comes from `?k=`, never from
    // anything they can simply assert.
    const data = await projectSharedStreakData(safeData, req);

    res.json({ success: true, data, hasPassword: !!page.password, templateType: "streak" });
  } catch (error) {
    console.error("Get shared streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyStreakPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await StreakPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify streak page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteStreakPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await StreakPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete streak page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
