import { Request, Response } from "express";
import CapsulePage, {
  AMEND_WINDOW_MS,
  CAPSULE_LIMITS,
  Confidence,
  CapsuleStatus,
  ICapsuleContext,
  IPerson,
  IPrediction,
  PAYLOAD_VERSION,
  Resolution,
  Side,
  Verdict,
} from "../models/CapsulePage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";
import {
  sanitizeLock,
  sanitizeLoveGifs,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  sanitizeTheme,
  userPhotoFolder,
} from "../utils/loveMedia";

/** Mirrors client/app/(templates)/capsule/components/themes.ts. */
const CAPSULE_THEMES = ["rust", "chrome", "garden", "stardust"] as const;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const asSide = (v: unknown): Side | null => (v === "a" || v === "b" ? v : null);

const asConfidence = (v: unknown): Confidence => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 3;
  const clamped = Math.min(5, Math.max(1, Math.trunc(n)));
  return clamped as Confidence;
};

const asVerdict = (v: unknown): Verdict | undefined =>
  v === "right" || v === "wrong" ? v : undefined;

const asResolution = (v: unknown): Resolution | undefined =>
  v === "right" || v === "wrong" || v === "disputed" ? v : undefined;

const asStatus = (v: unknown): CapsuleStatus =>
  v === "writing" || v === "sealed" || v === "opening" || v === "judged" ? v : "writing";

/**
 * Every write goes through an explicit allow-list of the nine content fields.
 * `req.body` is never spread into the document, so a caller cannot smuggle in
 * `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 *
 * Note what is absent: the scorecard, the countdown, the wear stage. All of it
 * is derived from `predictions` and `opensOn` on read.
 */
type CapsuleBody = {
  version?: unknown;
  pair?: unknown;
  sealedOn?: unknown;
  opensOn?: unknown;
  timezone?: unknown;
  stake?: unknown;
  context?: unknown;
  predictions?: unknown;
  status?: unknown;
  openedAt?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

/**
 * Media arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and this document has to survive until 2027.
 *
 * An upload failure is logged and yields an empty string rather than a 500:
 * the portrait is optional, and a bad file must not stop a capsule sealing.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (!value.startsWith("data:")) return value.slice(0, CAPSULE_LIMITS.url);
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `capsule/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, CAPSULE_LIMITS.url);
  } catch (error) {
    console.error("Capsule image upload error:", error);
    return "";
  }
};

const sanitizePerson = async (raw: unknown, userId: unknown, slot: string): Promise<IPerson> => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(src.id, CAPSULE_LIMITS.personId) || slot,
    name: str(src.name, CAPSULE_LIMITS.name),
    photoUrl: await resolveImageUrl(src.photoUrl, userId, `pair-${slot}`),
  };
};

const sanitizePair = async (raw: unknown, userId: unknown): Promise<{ a: IPerson; b: IPerson }> => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    a: await sanitizePerson(src.a, userId, "a"),
    b: await sanitizePerson(src.b, userId, "b"),
  };
};

const sanitizeContextSide = (raw: unknown): ICapsuleContext => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    city: str(src.city, CAPSULE_LIMITS.city),
    writtenAt: str(src.writtenAt, CAPSULE_LIMITS.timestamp),
    oneLineAboutNow: str(src.oneLineAboutNow, CAPSULE_LIMITS.oneLine),
  };
};

const sanitizeContext = (raw: unknown): { a: ICapsuleContext; b: ICapsuleContext } => {
  const src = (raw ?? {}) as Record<string, unknown>;
  return { a: sanitizeContextSide(src.a), b: sanitizeContextSide(src.b) };
};

/**
 * At most `maxPredictions` PER AUTHOR — the cap in the contract is per side,
 * and a caller sending 200 for one side must not crowd the other out.
 */
const sanitizePredictions = (raw: unknown): IPrediction[] => {
  if (!Array.isArray(raw)) return [];
  const counts: Record<Side, number> = { a: 0, b: 0 };
  const used = new Set<string>();
  const out: IPrediction[] = [];
  for (const item of raw.slice(0, CAPSULE_LIMITS.maxRawItems)) {
    const src = (item ?? {}) as Record<string, unknown>;
    const author = asSide(src.author);
    if (!author) continue;
    if (counts[author] >= CAPSULE_LIMITS.maxPredictions) continue;
    const text = str(src.text, CAPSULE_LIMITS.predictionText).trim();
    if (!text) continue;
    // Ids are how the judging screen tracks a card across a re-render, so a
    // duplicate would make two cards indistinguishable.
    const candidate = str(src.id, CAPSULE_LIMITS.predictionId).trim();
    let id = candidate && !used.has(candidate) ? candidate : `p${out.length + 1}`;
    let n = out.length + 1;
    while (used.has(id)) id = `p${++n}`;
    used.add(id);

    const prediction: IPrediction = {
      id,
      author,
      text,
      confidence: asConfidence(src.confidence),
      isWildcard: src.isWildcard === true,
    };
    const verdictA = asVerdict(src.verdictA);
    const verdictB = asVerdict(src.verdictB);
    const resolved = asResolution(src.resolved);
    if (verdictA) prediction.verdictA = verdictA;
    if (verdictB) prediction.verdictB = verdictB;
    if (resolved) prediction.resolved = resolved;

    counts[author]++;
    out.push(prediction);
  }
  return out;
};

// ─── The seal ────────────────────────────────────────────────────────────────

/** Server time, and only server time, decides eligibility. Never the device. */
const isOpenable = (opensOn: string, now = Date.now()): boolean => {
  const t = Date.parse(opensOn);
  return !Number.isNaN(t) && now >= t;
};

/**
 * The 24h amend window. Mirrors `canAmend` in the client contract, INCLUDING
 * its edge case: when `opensOn` is sooner than 24h from sealing the window is
 * clamped to `opensOn`, so edits can never run past the open date.
 *
 * A capsule that has not been sealed yet (no `sealedOn`, or `status: "writing"`)
 * is still being written and is freely editable — that is what "writing" means.
 * Once sealed, this is the ONLY gate, and there is no admin bypass.
 */
export const canAmendCapsule = (
  c: { sealedOn: string; opensOn: string; status: CapsuleStatus },
  now = Date.now()
): boolean => {
  if (c.status === "writing" || !c.sealedOn) return true;
  const sealed = Date.parse(c.sealedOn);
  const opens = Date.parse(c.opensOn);
  if (Number.isNaN(sealed)) return false;
  const closes = Number.isNaN(opens)
    ? sealed + AMEND_WINDOW_MS
    : Math.min(sealed + AMEND_WINDOW_MS, opens);
  return now < closes;
};

/**
 * The parameter type is deliberately narrow. `predictions` is typed as nothing
 * but `{ author }[]` and there is no `context` key at all, so the compiler will
 * not even hand this function a prediction's `text` to accidentally forward.
 */
export interface SealableCapsule {
  version: number;
  pair: { a: IPerson; b: IPerson };
  sealedOn: string;
  opensOn: string;
  timezone: string;
  stake: string;
  predictions: { author: Side }[];
  status?: CapsuleStatus;
  /** The outside of the capsule. Public by design. */
  theme: string;
  /** How much is inside — numbers only. Never a URL, caption, note or letter. */
  keepsakes: { photos: number; gifs: number; letter: boolean };
}

export interface SealedCapsuleProjection {
  state: "sealed";
  version: number;
  pair: { a: IPerson; b: IPerson };
  sealedOn: string;
  opensOn: string;
  timezone: string;
  stake: string;
  counts: { a: number; b: number };
  theme: string;
  keepsakes: { photos: number; gifs: number; letter: boolean };
  /** Whether the 24h amend window is still open, and until when. */
  amendUntil?: string;
}

/**
 * SECURITY PROPERTY — THE SEAL IS REAL. This is the whole product.
 *
 * Someone inspecting the raw network response for a capsule before its open
 * date must find NO PREDICTION TEXT ANYWHERE IN IT. Not in a field they have
 * to expand, not in a `context` blob, not behind a flag the client is trusted
 * to honour. There is nothing to decode because nothing was sent.
 *
 * That is achieved by CONSTRUCTING A NEW OBJECT with exactly the seven public
 * keys below, plus counts. It is deliberately NOT:
 *   - a `delete page.predictions` on a loaded document (the value is still in
 *     the process, one accidental `toObject()`/`console.log` from the wire),
 *   - nor a Mongoose `.select("-predictions.text")` projection string (a future
 *     refactor widens or drops it in a one-line diff and nothing fails loudly).
 *
 * `counts` and `stake` are the only things a waiting screen gets, and that is
 * intentional: "Arjun has written 4 predictions" rewards the visit without
 * giving anything away.
 */
export const projectSealedCapsule = (
  capsule: SealableCapsule,
  now = Date.now()
): SealedCapsuleProjection => {
  let a = 0;
  let b = 0;
  for (const p of capsule.predictions) {
    if (p.author === "a") a++;
    else if (p.author === "b") b++;
  }

  const projection: SealedCapsuleProjection = {
    state: "sealed",
    version: capsule.version || PAYLOAD_VERSION,
    pair: {
      a: { id: capsule.pair.a.id, name: capsule.pair.a.name, photoUrl: capsule.pair.a.photoUrl },
      b: { id: capsule.pair.b.id, name: capsule.pair.b.name, photoUrl: capsule.pair.b.photoUrl },
    },
    sealedOn: capsule.sealedOn,
    opensOn: capsule.opensOn,
    timezone: capsule.timezone,
    stake: capsule.stake,
    counts: { a, b },
    theme: capsule.theme,
    keepsakes: {
      photos: capsule.keepsakes.photos,
      gifs: capsule.keepsakes.gifs,
      letter: capsule.keepsakes.letter,
    },
  };

  const sealed = Date.parse(capsule.sealedOn);
  const opens = Date.parse(capsule.opensOn);
  if (!Number.isNaN(sealed)) {
    const closes = Number.isNaN(opens)
      ? sealed + AMEND_WINDOW_MS
      : Math.min(sealed + AMEND_WINDOW_MS, opens);
    if (now < closes) projection.amendUntil = new Date(closes).toISOString();
  }

  return projection;
};

/**
 * Rebuilds a `SealableCapsule` from a loose `toObject()` result by copying only
 * the public keys across — and, crucially, copying nothing but `author` out of
 * each prediction. A cast would have been shorter and would have carried the
 * whole prediction (text and all) into the projection's reach; this walks the
 * array instead so the text is never on the object being handed onward.
 */
const asSealable = (o: Record<string, unknown>): SealableCapsule => {
  const takePerson = (raw: unknown): IPerson => {
    const p = (raw ?? {}) as Record<string, unknown>;
    return {
      id: typeof p.id === "string" ? p.id : "",
      name: typeof p.name === "string" ? p.name : "",
      photoUrl: typeof p.photoUrl === "string" ? p.photoUrl : "",
    };
  };
  const pair = (o.pair ?? {}) as Record<string, unknown>;
  const rawPredictions = Array.isArray(o.predictions) ? o.predictions : [];
  return {
    version: typeof o.version === "number" ? o.version : PAYLOAD_VERSION,
    pair: { a: takePerson(pair.a), b: takePerson(pair.b) },
    sealedOn: typeof o.sealedOn === "string" ? o.sealedOn : "",
    opensOn: typeof o.opensOn === "string" ? o.opensOn : "",
    timezone: typeof o.timezone === "string" ? o.timezone : "",
    stake: typeof o.stake === "string" ? o.stake : "",
    predictions: rawPredictions.map((p) => ({
      author: (p as { author?: unknown })?.author === "b" ? ("b" as Side) : ("a" as Side),
    })),
    theme: typeof o.theme === "string" ? o.theme : "",
    // Lengths and a boolean, read here and nowhere else — the photo objects,
    // GIF links and letter text never reach the object handed onward.
    keepsakes: {
      photos: Array.isArray(o.photos) ? o.photos.length : 0,
      gifs: Array.isArray(o.gifs) ? o.gifs.length : 0,
      letter: typeof o.letter === "string" && o.letter.trim().length > 0,
    },
  };
};

/**
 * The registry-facing form of the seal.
 *
 * `share.controller`'s generic `/share/:shareId` resolver walks every template
 * model and returns whatever it finds, so without this hook a capsule would be
 * fully readable through that route while its own route held the line. A
 * security property that depends on which URL the reader happened to use is
 * not a security property.
 */
export const projectSharedCapsuleData = (
  pageObj: Record<string, unknown>,
  now = Date.now()
): Record<string, unknown> => {
  const opensOn = typeof pageObj.opensOn === "string" ? pageObj.opensOn : "";
  if (isOpenable(opensOn, now)) return { ...pageObj, state: "open" };
  return projectSealedCapsule(asSealable(pageObj), now) as unknown as Record<string, unknown>;
};

// ─── Handlers ────────────────────────────────────────────────────────────────

export const createCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CapsuleBody;

    const page = await CapsulePage.create({
      userId: req.userId,
      // The stored payload carries its own version. A capsule sealed at v1 must
      // still open at v4 — a client-supplied version is honoured so a re-save
      // never silently upgrades an old capsule's shape claim.
      version: typeof b.version === "number" && b.version >= 1 ? Math.trunc(b.version) : PAYLOAD_VERSION,
      pair: await sanitizePair(b.pair, req.userId),
      sealedOn: str(b.sealedOn, CAPSULE_LIMITS.timestamp),
      opensOn: str(b.opensOn, CAPSULE_LIMITS.timestamp),
      timezone: str(b.timezone, CAPSULE_LIMITS.timezone),
      stake: str(b.stake, CAPSULE_LIMITS.stake),
      context: sanitizeContext(b.context),
      predictions: sanitizePredictions(b.predictions),
      status: asStatus(b.status),
      openedAt: str(b.openedAt, CAPSULE_LIMITS.timestamp),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("capsule", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: sanitizeLoveLetter(b.letter),
      theme: sanitizeTheme(b.theme, CAPSULE_THEMES),
      ...sanitizeLock(b),
      password: str(b.password, CAPSULE_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyCapsulePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await CapsulePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my capsule pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CapsulePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;
    pageObj.canAmend = canAmendCapsule(page);

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as CapsuleBody;

    const page = await CapsulePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    /**
     * Once the 24h amend window has closed, the sealed content is final. This
     * is the only gate and there is no admin bypass — "locked. that was the
     * point." Owning the page is not a bypass either: the author is precisely
     * the person this rule exists to bind.
     *
     * THE PRINCIPLE, for whoever adds the next field: a field is LOCKED if it
     * is part of what the two of them agreed to and will later be judged
     * against. `predictions` and `stake` are both that — the stake is a mutual
     * agreement about what the loser owes, so one partner quietly rewriting it
     * a year later, with the scorecard about to be computed, defeats the seal
     * exactly as thoroughly as editing a prediction would. `context` is in the
     * same family and is locked with them: it is a claim about who they were
     * at sealing time, and the whole payload is the gap between then and now.
     *
     * A field stays EDITABLE if it is cosmetic identity that carries no claim
     * about the past — `pair` names and photos. Someone should be able to fix
     * a misspelled name in 2027 without that being an integrity question, and
     * nothing in `scoreCapsule` reads a name.
     *
     * If you cannot tell which side a new field falls on, ask whether changing
     * it after the fact could alter who wins or what they owe. If yes, lock it.
     *
     * THE KEEPSAKES lock too, for the other reason a field locks: they are
     * inside the capsule. Photos, their notes, the GIFs and the letter are
     * sealed content (the public projection carries counts only), and "sealed"
     * means the author cannot slip a new letter in a year later any more than
     * they can rewrite a prediction. `theme` is the colour of the OUTSIDE of
     * the capsule — cosmetic, public, and editable forever, like the names.
     */
    const locked: string[] = [];
    if (b.predictions !== undefined) locked.push("predictions");
    if (b.stake !== undefined) locked.push("stake");
    if (b.context !== undefined) locked.push("context");
    if (b.photos !== undefined) locked.push("photos");
    if (b.gifs !== undefined) locked.push("gifs");
    if (b.letter !== undefined) locked.push("letter");
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) locked.push("lock");
    if (locked.length > 0 && !canAmendCapsule(page)) {
      res.status(403).json({
        success: false,
        error: "AMEND_WINDOW_CLOSED",
        message: `This capsule is sealed. ${locked.join(", ")} can no longer be changed.`,
        lockedFields: locked,
      });
      return;
    }

    if (b.pair        !== undefined) page.pair        = await sanitizePair(b.pair, req.userId);
    if (b.sealedOn    !== undefined) page.sealedOn    = str(b.sealedOn, CAPSULE_LIMITS.timestamp);
    if (b.opensOn     !== undefined) page.opensOn     = str(b.opensOn, CAPSULE_LIMITS.timestamp);
    if (b.timezone    !== undefined) page.timezone    = str(b.timezone, CAPSULE_LIMITS.timezone);
    if (b.stake       !== undefined) page.stake       = str(b.stake, CAPSULE_LIMITS.stake);
    if (b.context     !== undefined) page.context     = sanitizeContext(b.context);
    if (b.predictions !== undefined) page.predictions = sanitizePredictions(b.predictions);
    if (b.status      !== undefined) page.status      = asStatus(b.status);
    if (b.openedAt    !== undefined) page.openedAt    = str(b.openedAt, CAPSULE_LIMITS.timestamp);
    if (b.photos      !== undefined) page.photos      = await sanitizeLovePhotos(b.photos, userPhotoFolder("capsule", req.userId));
    if (b.gifs        !== undefined) page.gifs        = sanitizeLoveGifs(b.gifs);
    if (b.letter      !== undefined) page.letter      = sanitizeLoveLetter(b.letter);
    if (b.theme       !== undefined) page.theme       = sanitizeTheme(b.theme, CAPSULE_THEMES);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock(b);
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, CAPSULE_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, CAPSULE_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CapsulePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "capsule",
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
    res.json({ success: true, data: { shareId: page.shareId, shareUrl } });
  } catch (error) {
    console.error("Publish capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CapsulePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    // THE SEAL. Server time, and only server time, decides. If `opensOn` has
    // not passed the response body is built from scratch by
    // `projectSealedCapsule` and contains counts and authorship only — no
    // prediction text and no context, anywhere in it.
    const pageObj = page.toObject({ flattenMaps: true }) as unknown as Record<string, unknown>;
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj;
    const data = projectSharedCapsuleData(safeData);

    res.json({ success: true, data, hasPassword: !!page.password, templateType: "capsule" });
  } catch (error) {
    console.error("Get shared capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyCapsulePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await CapsulePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify capsule page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteCapsulePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await CapsulePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete capsule page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
