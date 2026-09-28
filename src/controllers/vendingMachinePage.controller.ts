import { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import VendingMachinePage, {
  ICreditAnswer,
  ISlot,
  SLOT_KINDS,
  SlotKind,
  IVendingMachinePage,
} from "../models/VendingMachinePage";
import { checkPublishAccess } from "../services/publishGate.service";
import {
  sanitizeLoveGifs,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  sanitizeTheme,
  userPhotoFolder,
} from "../utils/loveMedia";

/** Mirrors client/app/(templates)/vending-machine/components/themes.ts. */
const VENDING_THEMES = ["arcade", "tokyo", "kawaii", "chrome"] as const;

// ─── Geometry, mirrored from the client contract (`components/types.ts`) ─────
const ROWS = ["A", "B", "C"];
const COLS = [1, 2, 3, 4, 5, 6];
const SLOT_CODES: string[] = ROWS.flatMap((r) => COLS.map((c) => `${r}${c}`));
const SLOT_COUNT = SLOT_CODES.length; // 18
/** A1 is the sender's own and never vends. */
const RESERVED_SLOT = "A1";

const MAX_CREDIT_PROMPTS = 8;
const MAX_IDLE_MESSAGES = 12;
/** Storage guardrail: the page is a gift, not a mailbox. */
const MAX_CREDIT_ANSWERS = 50;
/**
 * The recipient's answer is a one-liner on an LED-ish input, not an essay. The
 * cap exists in the editor too, but a hand-rolled POST must not be able to route
 * around it — this is the enforcement point.
 */
const ANSWER_MAX = 100;
const PROMPT_MAX = 200;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

const strArray = (raw: unknown, cap: number, max: number): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, cap).map((s) => str(s, max).trim()).filter(Boolean);
};

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const sanitizeKind = (raw: unknown): SlotKind =>
  typeof raw === "string" && SLOT_KINDS.includes(raw as SlotKind)
    ? (raw as SlotKind)
    : "compliment";

/**
 * Slots arriving from the OWNER. Two invariants are enforced here rather than
 * trusted from the client, because `dbToVendingData` also enforces them and the
 * two must not be able to disagree: A1 never vends, and at most ONE slot jams.
 * Two stuck items is a dead end the recipient cannot escape.
 */
const sanitizeSlots = (raw: unknown): ISlot[] => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  let seenSticky = false;

  const out: ISlot[] = [];
  for (const s of raw) {
    if (out.length >= SLOT_COUNT) break;
    const src = (s ?? {}) as Record<string, unknown>;
    const code = str(src.code, 4).toUpperCase();
    if (!SLOT_CODES.includes(code) || seen.has(code)) continue;
    seen.add(code);

    const sticks = src.sticks === true && !seenSticky && code !== RESERVED_SLOT;
    if (sticks) seenSticky = true;

    out.push({
      code,
      kind: sanitizeKind(src.kind),
      label: str(src.label, 60),
      payload: str(src.payload, 600),
      price: num(src.price, 1, 0, 9),
      soldOut: code === RESERVED_SLOT ? true : src.soldOut === true,
      sticks,
    });
  }
  return out;
};

// ─── Unlock token ────────────────────────────────────────────────────────────
/**
 * Proof that the caller cleared the password gate.
 *
 * `POST /share/:shareId/answer` has to be public — the recipient earns credit
 * without an account, that is the whole mechanic — but "public" must not mean
 * "unguarded". Without this, guessing a shareId would be enough to write into a
 * password-protected page, which quietly defeats the gate the sender set.
 *
 * Derived by HMAC over the shareId and the stored password HASH, so it is
 * stateless (no schema change, no session store) and self-invalidating: change
 * the password and every previously issued token stops matching. Same pattern
 * as `legalNoticePage.controller.ts`.
 */
const unlockToken = (shareId: string, passwordHash: string): string =>
  createHmac("sha256", process.env.JWT_SECRET || "vending-machine-unlock")
    .update(`${shareId}:${passwordHash}`)
    .digest("hex");

/** Constant-time compare that cannot throw on a length mismatch. */
const tokenMatches = (expected: string, given: unknown): boolean => {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

type VendingMachineBody = {
  machineName?: unknown;
  senderName?: unknown;
  recipientName?: unknown;
  slots?: unknown;
  creditPrompts?: unknown;
  displayIdleMessages?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  password?: unknown;
};

export const createVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as VendingMachineBody;

    const page = await VendingMachinePage.create({
      userId: req.userId,
      machineName: str(b.machineName, 60),
      senderName: str(b.senderName, 80),
      recipientName: str(b.recipientName, 80),
      slots: sanitizeSlots(b.slots),
      creditPrompts: strArray(b.creditPrompts, MAX_CREDIT_PROMPTS, PROMPT_MAX),
      displayIdleMessages: strArray(b.displayIdleMessages, MAX_IDLE_MESSAGES, 60),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("vending-machine", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: sanitizeLoveLetter(b.letter),
      theme: sanitizeTheme(b.theme, VENDING_THEMES),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

/**
 * OWNER view. `creditAnswers` is `select: false`, so it has to be asked for
 * explicitly — the sender is exactly the audience for it.
 */
export const getMyVendingMachinePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await VendingMachinePage.find({ userId: req.userId })
      .select("+creditAnswers")
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my vendingMachine pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await VendingMachinePage.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).select("+creditAnswers");
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

/**
 * Explicit allow-list. `req.body` is never spread onto the document: that is
 * what stops a crafted PUT from flipping `isPublished`, rewriting `userId`, or
 * injecting `creditAnswers` the recipient never wrote.
 */
export const updateVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as VendingMachineBody;

    // `creditAnswers` is selected even though it is never written here: an
    // unselected array path can be re-defaulted to [] on save, and silently
    // wiping the recipient's answers when the sender fixes a typo would be
    // unrecoverable.
    const page = await VendingMachinePage.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).select("+creditAnswers");
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.machineName         !== undefined) page.machineName         = str(b.machineName, 60);
    if (b.senderName          !== undefined) page.senderName          = str(b.senderName, 80);
    if (b.recipientName       !== undefined) page.recipientName       = str(b.recipientName, 80);
    if (b.slots               !== undefined) page.slots               = sanitizeSlots(b.slots);
    if (b.creditPrompts       !== undefined) page.creditPrompts       = strArray(b.creditPrompts, MAX_CREDIT_PROMPTS, PROMPT_MAX);
    if (b.displayIdleMessages !== undefined) page.displayIdleMessages = strArray(b.displayIdleMessages, MAX_IDLE_MESSAGES, 60);
    if (b.photos              !== undefined) page.photos              = await sanitizeLovePhotos(b.photos, userPhotoFolder("vending-machine", req.userId));
    if (b.gifs                !== undefined) page.gifs                = sanitizeLoveGifs(b.gifs);
    if (b.letter              !== undefined) page.letter              = sanitizeLoveLetter(b.letter);
    if (b.theme               !== undefined) page.theme               = sanitizeTheme(b.theme, VENDING_THEMES);
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await VendingMachinePage.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).select("+creditAnswers");
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "vending-machine",
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
    console.error("Publish vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

/**
 * PUBLIC read. `creditAnswers` is stripped entirely — it is `select: false` on
 * the schema so it is never loaded here in the first place, and deleted again
 * below so a future `.select("+creditAnswers")` added upstream cannot leak it.
 * The recipient must never be able to read what previous visitors wrote.
 */
export const getSharedVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    // `$inc` rather than load-mutate-save: the document is deliberately loaded
    // WITHOUT `creditAnswers`, and a full save from a partially-selected doc is
    // exactly how you lose them.
    const page = await VendingMachinePage.findOneAndUpdate(
      { shareId: String(req.params.shareId), isPublished: true },
      { $inc: { viewCount: 1 } },
      { new: true }
    );
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const pageObj = page.toObject();
    const {
      password: _pw,
      passwordRaw: _pr,
      creditAnswers: _ca,
      ...safeData
    } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "vending-machine" });
  } catch (error) {
    console.error("Get shared vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyVendingMachinePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await VendingMachinePage.findOne({
      shareId: String(req.params.shareId),
      isPublished: true,
    });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true, unlockToken: "" }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      // The token is what lets the recipient POST /answer afterwards.
      res.json({
        success: true,
        verified: true,
        unlockToken: unlockToken(String(req.params.shareId), page.password),
      });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify vendingMachine page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * PUBLIC WRITE — the recipient answers a prompt to earn a credit.
 *
 * Deliberately unauthenticated: the person who received the link types an answer
 * and the machine gives them a credit. They never signed up for anything.
 *
 * Safety envelope:
 *  - the page must exist AND be published;
 *  - if the page has a password, a valid `unlockToken` from `/verify` is
 *    required — knowing a shareId alone is not enough to write;
 *  - only `{ prompt, answer }` is accepted, both trimmed and hard-capped here
 *    rather than trusted from the editor;
 *  - the array is capped at MAX_CREDIT_ANSWERS so the page cannot be turned into
 *    unbounded storage;
 *  - nothing is echoed back. The response is a bare acknowledgement, because
 *    returning the list would hand the recipient exactly what they must not see.
 */
export const recordVendingMachineAnswer = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const prompt = str(b.prompt, PROMPT_MAX).trim();
    const answer = str(b.answer, ANSWER_MAX).trim();
    if (!answer) { res.status(400).json({ success: false, error: "answer required" }); return; }

    const shareId = String(req.params.shareId);
    const page = (await VendingMachinePage.findOne({ shareId, isPublished: true }).select(
      "+creditAnswers"
    )) as IVendingMachinePage | null;
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    // A password-protected machine may only be fed by someone who actually
    // cleared the gate. Knowing the share link is not enough.
    if (page.password && !tokenMatches(unlockToken(shareId, page.password), b.unlockToken)) {
      res.status(401).json({ success: false, error: "Machine is locked" });
      return;
    }

    if (page.creditAnswers.length >= MAX_CREDIT_ANSWERS) {
      res.status(429).json({ success: false, error: "This machine has taken all it can hold" });
      return;
    }

    const entry: ICreditAnswer = { prompt, answer, createdAt: new Date() };
    page.creditAnswers.push(entry);
    page.markModified("creditAnswers");
    await page.save();

    res.json({ success: true, data: { accepted: true, count: page.creditAnswers.length } });
  } catch (error) {
    console.error("Record vendingMachine answer error:", error);
    res.status(500).json({ success: false, error: "Failed to record answer" });
  }
};

export const deleteVendingMachinePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await VendingMachinePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete vendingMachine page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
