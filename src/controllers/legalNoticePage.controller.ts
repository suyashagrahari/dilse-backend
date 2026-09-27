import { Request, Response } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import LegalNoticePage, {
  IDemand,
  DemandResponse,
  NoticeState,
  ILegalNoticePage,
} from "../models/LegalNoticePage";
import { checkPublishAccess } from "../services/publishGate.service";
import {
  sanitizeLoveGifs,
  sanitizeLoveLetter,
  sanitizeLovePhotos,
  sanitizeTheme,
  userPhotoFolder,
  sanitizeLock,
} from "../utils/loveMedia";

/** Mirrors client/app/(templates)/legal-notice/components/themes.ts. */
const LEGAL_NOTICE_THEMES = ["nightcourt", "casefile", "pinkverdict", "noir"] as const;

/** Eight is the layout ceiling — nine demands overflow the page. */
const MAX_DEMANDS = 8;
const MAX_RECITALS = 10;
const MAX_FINE_PRINT = 8;
/**
 * The 60-character cap is a tone guardrail, not a storage limit: it is what
 * keeps this a petty-and-affectionate format instead of a place to file real
 * grievances. Enforced here as well as in the editor so a hand-rolled POST
 * cannot route around it.
 */
const DEMAND_TEXT_MAX = 60;
const GROUNDS_MAX = 80;

/**
 * Proof that the caller cleared the password gate.
 *
 * `respond` has to be public — the addressee records accept/contest without an
 * account, that is the whole mechanic — but "public" must not mean "unguarded".
 * Without this, knowing the share link was enough to mutate a password-protected
 * notice, which quietly defeats the gate: the sender set a password, and someone
 * who never entered it could still tick and contest their demands.
 *
 * So `verify` hands back an opaque token and `respond` demands it. Derived by
 * HMAC over the shareId and the stored password hash, which means it is
 * stateless (no schema change, no session store) and self-invalidating — change
 * the password and every previously issued token stops matching.
 */
const unlockToken = (shareId: string, passwordHash: string): string =>
  createHmac("sha256", process.env.JWT_SECRET || "legal-notice-unlock")
    .update(`${shareId}:${passwordHash}`)
    .digest("hex");

/** Constant-time compare that cannot throw on a length mismatch. */
const tokenMatches = (expected: string, given: unknown): boolean => {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

/** The line the fine print must always carry, whatever the sender typed. */
const REQUIRED_FINE_PRINT =
  "This notice has no legal effect and is not a substitute for a conversation.";

const RESPONSES: DemandResponse[] = ["pending", "accepted", "contested"];

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** Every recital in this format opens with "That " — normalise rather than reject. */
const normalizeRecital = (raw: string): string => {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (/^that\s/i.test(t)) return "That " + t.slice(5).trimStart();
  return "That " + t.charAt(0).toLowerCase() + t.slice(1);
};

const sanitizeRecitals = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_RECITALS)
    .map((r) => normalizeRecital(str(r, 400)))
    .filter((r) => r.length > "That ".length);
};

const sanitizeFinePrint = (raw: unknown): string[] => {
  const lines = Array.isArray(raw)
    ? raw.slice(0, MAX_FINE_PRINT).map((f) => str(f, 200).trim()).filter(Boolean)
    : [];
  // Re-insert the guardrail line if the sender stripped it out.
  const has = lines.some((l) => l.toLowerCase().includes("no legal effect"));
  return has ? lines : [...lines, REQUIRED_FINE_PRINT].slice(0, MAX_FINE_PRINT + 1);
};

const sanitizeResponse = (raw: unknown): DemandResponse =>
  typeof raw === "string" && RESPONSES.includes(raw as DemandResponse)
    ? (raw as DemandResponse)
    : "pending";

/**
 * Demands arriving from the OWNER (create/update). Response state is preserved
 * when the owner re-saves so editing a typo does not wipe what the addressee
 * already answered.
 */
const sanitizeDemands = (raw: unknown): IDemand[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_DEMANDS)
    .map((d) => {
      const src = (d ?? {}) as Record<string, unknown>;
      const response = sanitizeResponse(src.response);
      const complied = response === "accepted" && src.complied === true;
      return {
        id: str(src.id, 64) || randomUUID(),
        text: str(src.text, DEMAND_TEXT_MAX),
        response,
        // Grounds only mean anything on a contested demand.
        grounds: response === "contested" ? str(src.grounds, GROUNDS_MAX) : "",
        // Compliance is only reachable once accepted.
        complied,
        compliedOn: complied ? str(src.compliedOn, 32) : "",
      };
    })
    .filter((d) => d.text.trim().length > 0);
};

/**
 * A notice is resolved when every demand has been answered AND every accepted
 * demand has actually been complied with. A contested demand counts as
 * resolved — the addressee did respond, they just said no.
 */
const computeNoticeState = (demands: IDemand[], complianceDeadline: string): NoticeState => {
  if (demands.length === 0) return "served";
  const allResolved = demands.every(
    (d) => d.response === "contested" || (d.response === "accepted" && d.complied)
  );
  if (allResolved) return "complied";

  const deadlineMs = complianceDeadline ? Date.parse(complianceDeadline) : NaN;
  if (!Number.isNaN(deadlineMs) && Date.now() > deadlineMs) return "final";

  return demands.some((d) => d.response !== "pending") ? "responded" : "served";
};

type LegalNoticeBody = {
  senderName?: unknown;
  senderCity?: unknown;
  addresseeName?: unknown;
  addresseeCity?: unknown;
  advocateName?: unknown;
  advocateEnrollment?: unknown;
  advocateChamber?: unknown;
  refNo?: unknown;
  datedOn?: unknown;
  relationshipSince?: unknown;
  recitals?: unknown;
  demands?: unknown;
  complianceDeadline?: unknown;
  escalationClause?: unknown;
  finePrint?: unknown;
  photos?: unknown;
  gifs?: unknown;
  letter?: unknown;
  theme?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  password?: unknown;
};

export const createLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as LegalNoticeBody;
    const demands = sanitizeDemands(b.demands);
    const complianceDeadline = str(b.complianceDeadline, 32);

    const page = await LegalNoticePage.create({
      userId: req.userId,
      senderName: str(b.senderName, 80),
      senderCity: str(b.senderCity, 60),
      addresseeName: str(b.addresseeName, 80),
      addresseeCity: str(b.addresseeCity, 60),
      advocateName: str(b.advocateName, 80),
      advocateEnrollment: str(b.advocateEnrollment, 48),
      advocateChamber: str(b.advocateChamber, 120),
      refNo: str(b.refNo, 32),
      datedOn: str(b.datedOn, 32),
      relationshipSince: str(b.relationshipSince, 32),
      recitals: sanitizeRecitals(b.recitals),
      demands,
      complianceDeadline,
      escalationClause: str(b.escalationClause, 600),
      finePrint: sanitizeFinePrint(b.finePrint),
      noticeState: computeNoticeState(demands, complianceDeadline),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("legal-notice", req.userId)),
      gifs: sanitizeLoveGifs(b.gifs),
      letter: sanitizeLoveLetter(b.letter),
      theme: sanitizeTheme(b.theme, LEGAL_NOTICE_THEMES),
      ...sanitizeLock(b),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyLegalNoticePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await LegalNoticePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my legalNotice pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LegalNoticePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = req.body as LegalNoticeBody;

    const page = await LegalNoticePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.senderName         !== undefined) page.senderName         = str(b.senderName, 80);
    if (b.senderCity         !== undefined) page.senderCity         = str(b.senderCity, 60);
    if (b.addresseeName      !== undefined) page.addresseeName      = str(b.addresseeName, 80);
    if (b.addresseeCity      !== undefined) page.addresseeCity      = str(b.addresseeCity, 60);
    if (b.advocateName       !== undefined) page.advocateName       = str(b.advocateName, 80);
    if (b.advocateEnrollment !== undefined) page.advocateEnrollment = str(b.advocateEnrollment, 48);
    if (b.advocateChamber    !== undefined) page.advocateChamber    = str(b.advocateChamber, 120);
    if (b.refNo              !== undefined) page.refNo              = str(b.refNo, 32);
    if (b.datedOn            !== undefined) page.datedOn            = str(b.datedOn, 32);
    if (b.relationshipSince  !== undefined) page.relationshipSince  = str(b.relationshipSince, 32);
    if (b.recitals           !== undefined) page.recitals           = sanitizeRecitals(b.recitals);
    if (b.complianceDeadline !== undefined) page.complianceDeadline = str(b.complianceDeadline, 32);
    if (b.escalationClause   !== undefined) page.escalationClause   = str(b.escalationClause, 600);
    if (b.finePrint          !== undefined) page.finePrint          = sanitizeFinePrint(b.finePrint);
    if (b.photos             !== undefined) page.photos             = await sanitizeLovePhotos(b.photos, userPhotoFolder("legal-notice", req.userId));
    if (b.gifs               !== undefined) page.gifs               = sanitizeLoveGifs(b.gifs);
    if (b.letter             !== undefined) page.letter             = sanitizeLoveLetter(b.letter);
    if (b.theme              !== undefined) page.theme              = sanitizeTheme(b.theme, LEGAL_NOTICE_THEMES);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock({ lockQuestion: b.lockQuestion ?? page.lockQuestion, lockAnswer: b.lockAnswer ?? page.lockAnswer });
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }

    if (b.demands !== undefined) {
      // Carry over whatever the addressee has already answered: the owner
      // fixing a typo must not silently un-tick a demand.
      const existing = new Map(page.demands.map((d) => [d.id, d]));
      page.demands = sanitizeDemands(b.demands).map((d) => {
        const prev = existing.get(d.id);
        if (!prev) return d;
        const complied = prev.response === "accepted" && prev.complied;
        return {
          ...d,
          response: prev.response,
          grounds: prev.response === "contested" ? prev.grounds : "",
          complied,
          compliedOn: complied ? prev.compliedOn : "",
        };
      });
    }

    page.noticeState = computeNoticeState(page.demands, page.complianceDeadline);

    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LegalNoticePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "legal-notice",
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
    console.error("Publish legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LegalNoticePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    // Recompute so a reader arriving after the deadline gets the FINAL state
    // from the server, before any client JS has run.
    page.noticeState = computeNoticeState(page.demands, page.complianceDeadline);
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "legal-notice" });
  } catch (error) {
    console.error("Get shared legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyLegalNoticePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await LegalNoticePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true, unlockToken: "" }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      // The token is what lets the addressee POST /respond afterwards.
      res.json({
        success: true,
        verified: true,
        unlockToken: unlockToken(String(req.params.shareId), page.password),
      });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify legalNotice page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

/**
 * PUBLIC — the addressee records a response. Deliberately unauthenticated: the
 * whole point of this template is that the person served can accept, contest or
 * comply straight from the link, and the result has to survive a hard refresh on
 * another device.
 *
 * Safety: this endpoint can only mutate the three response fields of a demand
 * that already exists. It cannot add, remove or re-word a demand, and it cannot
 * touch any other field on the page. Knowing the (randomUUID) shareId is the
 * capability — the same secret that lets you read the notice at all.
 *
 * `notice: "counter"` routes into `counterNotice.demands`, which is where the
 * counter-notice will live. Empty today, wired now so it drops straight in.
 */
export const recordLegalNoticeResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const demandId = str(b.demandId, 64);
    if (!demandId) { res.status(400).json({ success: false, error: "demandId required" }); return; }

    const target = b.notice === "counter" ? "counter" : "primary";

    const page = (await LegalNoticePage.findOne({
      shareId: req.params.shareId,
      isPublished: true,
    })) as ILegalNoticePage | null;
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    // A password-protected notice may only be responded to by someone who
    // actually cleared the gate. Knowing the share link is not enough.
    if (page.password && !tokenMatches(unlockToken(String(req.params.shareId), page.password), b.unlockToken)) {
      res.status(401).json({ success: false, error: "Notice is locked" });
      return;
    }

    const list: IDemand[] = target === "counter" ? page.counterNotice.demands : page.demands;
    const demand = list.find((d) => d.id === demandId);
    if (!demand) { res.status(404).json({ success: false, error: "Demand not found" }); return; }

    if (b.response !== undefined) {
      demand.response = sanitizeResponse(b.response);
      // Leaving "contested" drops the grounds; leaving "accepted" drops compliance.
      if (demand.response !== "contested") demand.grounds = "";
      if (demand.response !== "accepted") { demand.complied = false; demand.compliedOn = ""; }
    }
    if (b.grounds !== undefined && demand.response === "contested") {
      demand.grounds = str(b.grounds, GROUNDS_MAX);
    }
    // Compliance is only reachable once a demand has been accepted. The date is
    // stamped here, once, and never re-derived from "now" at read time.
    if (b.complied !== undefined && demand.response === "accepted") {
      demand.complied = b.complied === true;
      demand.compliedOn = demand.complied ? (demand.compliedOn || new Date().toISOString()) : "";
    }

    page.markModified(target === "counter" ? "counterNotice.demands" : "demands");
    page.noticeState = computeNoticeState(page.demands, page.complianceDeadline);
    await page.save();

    res.json({
      success: true,
      data: {
        demands: page.demands,
        counterNotice: page.counterNotice,
        noticeState: page.noticeState,
      },
    });
  } catch (error) {
    console.error("Record legalNotice response error:", error);
    res.status(500).json({ success: false, error: "Failed to record response" });
  }
};

export const deleteLegalNoticePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await LegalNoticePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete legalNotice page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
