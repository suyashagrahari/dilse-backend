import { Request, Response } from "express";
import RechargePage, {
  IPlanCategory,
  IPlanRow,
  IPlan,
  IPaymentMethod,
} from "../models/RechargePage";
import { checkPublishAccess } from "../services/publishGate.service";
import { sanitizeLovePhotos, sanitizeLoveLetter, sanitizeLock, userPhotoFolder } from "../utils/loveMedia";

const MAX_CATEGORIES = 8;
const MAX_PLANS = 24;
const MAX_ROWS = 10;
const MAX_BENEFITS = 8;
const MAX_METHODS = 8;
const MAX_RECEIPT_LINES = 10;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** A slug-safe id. Ids reach React keys and category lookups, nothing else. */
const idOf = (v: unknown, fallback: string): string => {
  const raw = str(v, 48)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
};

const sanitizeCategories = (raw: unknown): IPlanCategory[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CATEGORIES)
    .map((c, i) => {
      const s = (c ?? {}) as Record<string, unknown>;
      return { id: idOf(s.id, `cat-${i + 1}`), label: str(s.label, 60).trim() };
    })
    // An unlabelled tab is a blank hit-area on the rail — drop it.
    .filter((c) => c.label.length > 0);
};

const sanitizeRows = (raw: unknown): IPlanRow[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_ROWS)
    .map((r) => {
      // The editor keeps rows as "Label: Value | note" lines (that is also
      // what the AI fill writes); older clients send objects. Both land here.
      if (typeof r === "string") {
        const [head, ...rest] = r.split("|");
        const at = head.indexOf(":");
        if (at < 0) return { label: "", value: "", note: "" };
        return {
          label: head.slice(0, at).trim().slice(0, 60),
          value: head.slice(at + 1).trim().slice(0, 80),
          note: rest.join("|").trim().slice(0, 200),
        };
      }
      const s = (r ?? {}) as Record<string, unknown>;
      const note = str(s.note, 200).trim();
      return { label: str(s.label, 60).trim(), value: str(s.value, 80).trim(), note };
    })
    // A row with a blank side renders as a hole in the card's table.
    .filter((r) => r.label.length > 0 && r.value.length > 0);
};

const sanitizeBenefits = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_BENEFITS)
    .map((b) => str(b, 200).trim())
    .filter((b) => b.length > 0);
};

const sanitizePlans = (raw: unknown): IPlan[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PLANS)
    .map((p, i) => {
      const s = (p ?? {}) as Record<string, unknown>;
      const disabled = s.disabled === true;
      const reason = str(s.disabledReason, 300).trim();
      return {
        id: idOf(s.id, `pl-${i + 1}`),
        // String in, string out. "∞" is a legal price and is never parsed here.
        price: str(s.price, 24).trim() || "—",
        categoryId: idOf(s.categoryId, ""),
        validity: str(s.validity, 48).trim(),
        badge: str(s.badge, 32).trim(),
        rows: sanitizeRows(s.rows),
        benefits: sanitizeBenefits(s.benefits),
        disabled,
        // A greyed card with no explanation is indistinguishable from a broken
        // one, so an unexplained disable gets a house line rather than silence.
        disabledReason: disabled ? reason || "Not available on this number." : "",
      };
    })
    // A card with no table and no benefits is an empty box with a price on it.
    .filter((p) => p.rows.length > 0 || p.benefits.length > 0);
};

const sanitizeMethods = (raw: unknown): IPaymentMethod[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_METHODS)
    .map((m, i) => {
      const s = (m ?? {}) as Record<string, unknown>;
      return {
        id: idOf(s.id, `pm-${i + 1}`),
        label: str(s.label, 60).trim(),
        sub: str(s.sub, 200).trim(),
      };
    })
    .filter((m) => m.label.length > 0);
};

const sanitizeOperator = (raw: unknown): { name: string; tagline: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { name: str(s.name, 60).trim(), tagline: str(s.tagline, 120).trim() };
};

const sanitizeSubscriber = (raw: unknown): { name: string; number: string; circle: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    name: str(s.name, 60).trim(),
    number: str(s.number, 32).trim(),
    circle: str(s.circle, 60).trim(),
  };
};

const sanitizeCurrentPlan = (raw: unknown): { expiresIn: string; note: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { expiresIn: str(s.expiresIn, 48).trim(), note: str(s.note, 240).trim() };
};

const sanitizePayment = (raw: unknown): { methods: IPaymentMethod[] } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { methods: sanitizeMethods(s.methods) };
};

const sanitizeReceipt = (raw: unknown): { message: string[] } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  const message = Array.isArray(s.message)
    ? s.message
        .slice(0, MAX_RECEIPT_LINES)
        .map((l) => str(l, 240).trim())
        .filter((l) => l.length > 0)
    : [];
  return { message };
};

const MAX_PROMOS = 6;

const sanitizeSender = (raw: unknown): { name: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { name: str(s.name, 60).trim() };
};

const sanitizePromos = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.slice(0, MAX_PROMOS).map((p) => str(p, 90).trim()).filter((p) => p.length > 0)
    : [];

const sanitizeCashback = (raw: unknown): { title: string; note: string } => {
  const s = (raw ?? {}) as Record<string, unknown>;
  return { title: str(s.title, 80).trim(), note: str(s.note, 200).trim() };
};

type RechargeBody = {
  sender?: unknown;
  promos?: unknown;
  cashback?: unknown;
  photos?: unknown;
  letter?: unknown;
  lockQuestion?: unknown;
  lockAnswer?: unknown;
  operator?: unknown;
  subscriber?: unknown;
  currentPlan?: unknown;
  categories?: unknown;
  plans?: unknown;
  payment?: unknown;
  receipt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
};

export const createRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as RechargeBody;

    const page = await RechargePage.create({
      userId: req.userId,
      operator: sanitizeOperator(b.operator),
      subscriber: sanitizeSubscriber(b.subscriber),
      currentPlan: sanitizeCurrentPlan(b.currentPlan),
      categories: sanitizeCategories(b.categories),
      plans: sanitizePlans(b.plans),
      payment: sanitizePayment(b.payment),
      receipt: sanitizeReceipt(b.receipt),
      sender: sanitizeSender(b.sender),
      promos: sanitizePromos(b.promos),
      cashback: sanitizeCashback(b.cashback),
      photos: await sanitizeLovePhotos(b.photos, userPhotoFolder("recharge", req.userId)),
      letter: sanitizeLoveLetter(b.letter),
      ...sanitizeLock(b),
      contributorsEnabled: b.contributorsEnabled === true,
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyRechargePages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await RechargePage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my recharge pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RechargePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as RechargeBody;

    const page = await RechargePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.operator            !== undefined) page.operator            = sanitizeOperator(b.operator);
    if (b.subscriber          !== undefined) page.subscriber          = sanitizeSubscriber(b.subscriber);
    if (b.currentPlan         !== undefined) page.currentPlan         = sanitizeCurrentPlan(b.currentPlan);
    if (b.categories          !== undefined) page.categories          = sanitizeCategories(b.categories);
    if (b.plans               !== undefined) page.plans               = sanitizePlans(b.plans);
    if (b.payment             !== undefined) page.payment             = sanitizePayment(b.payment);
    if (b.receipt             !== undefined) page.receipt             = sanitizeReceipt(b.receipt);
    if (b.sender              !== undefined) page.sender              = sanitizeSender(b.sender);
    if (b.promos              !== undefined) page.promos              = sanitizePromos(b.promos);
    if (b.cashback            !== undefined) page.cashback            = sanitizeCashback(b.cashback);
    if (b.photos              !== undefined) page.photos              = await sanitizeLovePhotos(b.photos, userPhotoFolder("recharge", req.userId));
    if (b.letter              !== undefined) page.letter              = sanitizeLoveLetter(b.letter);
    if (b.lockQuestion !== undefined || b.lockAnswer !== undefined) {
      const lock = sanitizeLock({ lockQuestion: b.lockQuestion ?? page.lockQuestion, lockAnswer: b.lockAnswer ?? page.lockAnswer });
      page.lockQuestion = lock.lockQuestion;
      page.lockAnswer = lock.lockAnswer;
    }
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = b.contributorsEnabled === true;
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RechargePage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({ req,
      userId: String(req.userId),
      templateType: "recharge",
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
    console.error("Publish recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RechargePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "recharge" });
  } catch (error) {
    console.error("Get shared recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyRechargePagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await RechargePage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify recharge page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteRechargePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await RechargePage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete recharge page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
