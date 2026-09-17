import { Request, Response } from "express";
import NutritionPage, { INutrient, IVitamin } from "../models/NutritionPage";
import { checkPublishAccess } from "../services/publishGate.service";
import { transformMediaPayload } from "../services/mediaProcessor.service";

// ─── Nutrition Facts — CRUD ──────────────────────────────────────────────────
//
// The house pattern, with one rule of its own: NOTHING in this file calls
// Number(), parseInt() or parseFloat() on a calorie count or a % Daily Value.
// They arrive as strings, they are trimmed and truncated, they are stored as
// strings. "∞" is a legal calorie count and "a lot" is a legal daily value.
//
// `indent` is the single exception — it is a layout depth, not copy, and it is
// clamped to 0..2 because anything else pushes a row off the 300px label.

const MAX_NUTRIENTS = 15;
const MAX_VITAMINS = 8;
const MAX_NOT_SIGNIFICANT = 10;
const MAX_INGREDIENTS = 20;
const MAX_MESSAGE_LINES = 8;

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

/** 0, 1 or 2. Anything else is a typo that would break the label's grid. */
const indentOf = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number.NaN;
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 0;
};

const sanitizeNutrients = (raw: unknown): INutrient[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_NUTRIENTS)
    .map((n) => {
      const s = (n ?? {}) as Record<string, unknown>;
      return {
        label: str(s.label, 60).trim(),
        // String in, string out — a nutrient amount may be "40g" or "a whole lot".
        amount: str(s.amount, 24).trim(),
        dv: str(s.dv, 24).trim(),
        bold: s.bold === true,
        indent: indentOf(s.indent),
        note: str(s.note, 300).trim(),
      };
    })
    // A row with no label is a blank line with a percentage floating on the
    // right — it reads as a rendering bug, not as a nutrient.
    .filter((n) => n.label.length > 0);
};

const sanitizeVitamins = (raw: unknown): IVitamin[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_VITAMINS)
    .map((v) => {
      const s = (v ?? {}) as Record<string, unknown>;
      return {
        label: str(s.label, 60).trim(),
        dv: str(s.dv, 24).trim(),
        note: str(s.note, 300).trim(),
      };
    })
    .filter((v) => v.label.length > 0);
};

const sanitizeLines = (raw: unknown, maxItems: number, maxChars: number): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, maxItems)
    .map((l) => str(l, maxChars).trim())
    .filter((l) => l.length > 0);
};

type NutritionBody = {
  productName?: unknown;
  servingSize?: unknown;
  servingsPerContainer?: unknown;
  calories?: unknown;
  caloriesNote?: unknown;
  nutrients?: unknown;
  vitamins?: unknown;
  notSignificantSource?: unknown;
  footnote?: unknown;
  ingredients?: unknown;
  allergen?: unknown;
  message?: unknown;
  photoUrl?: unknown;
  distributedBy?: unknown;
  password?: unknown;
};

export const createNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "nutrition", userId: req.userId })) as NutritionBody;

    const page = await NutritionPage.create({
      userId: req.userId,
      productName: str(b.productName, 80).trim(),
      servingSize: str(b.servingSize, 60).trim(),
      servingsPerContainer: str(b.servingsPerContainer, 80).trim(),
      // Never parsed. See the header note.
      calories: str(b.calories, 24).trim(),
      caloriesNote: str(b.caloriesNote, 80).trim(),
      nutrients: sanitizeNutrients(b.nutrients),
      vitamins: sanitizeVitamins(b.vitamins),
      notSignificantSource: sanitizeLines(b.notSignificantSource, MAX_NOT_SIGNIFICANT, 60),
      footnote: str(b.footnote, 400).trim(),
      ingredients: sanitizeLines(b.ingredients, MAX_INGREDIENTS, 80),
      allergen: str(b.allergen, 120).trim(),
      message: sanitizeLines(b.message, MAX_MESSAGE_LINES, 600),
      photoUrl: str(b.photoUrl, 600).trim(),
      distributedBy: str(b.distributedBy, 120).trim(),
      password: str(b.password, 128),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyNutritionPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await NutritionPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my nutrition pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await NutritionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (await transformMediaPayload(req.body || {}, { template: "nutrition", userId: req.userId })) as NutritionBody;

    const page = await NutritionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.productName          !== undefined) page.productName          = str(b.productName, 80).trim();
    if (b.servingSize          !== undefined) page.servingSize          = str(b.servingSize, 60).trim();
    if (b.servingsPerContainer !== undefined) page.servingsPerContainer = str(b.servingsPerContainer, 80).trim();
    if (b.calories             !== undefined) page.calories             = str(b.calories, 24).trim();
    if (b.caloriesNote         !== undefined) page.caloriesNote         = str(b.caloriesNote, 80).trim();
    if (b.nutrients            !== undefined) page.nutrients            = sanitizeNutrients(b.nutrients);
    if (b.vitamins             !== undefined) page.vitamins             = sanitizeVitamins(b.vitamins);
    if (b.notSignificantSource !== undefined) page.notSignificantSource = sanitizeLines(b.notSignificantSource, MAX_NOT_SIGNIFICANT, 60);
    if (b.footnote             !== undefined) page.footnote             = str(b.footnote, 400).trim();
    if (b.ingredients          !== undefined) page.ingredients          = sanitizeLines(b.ingredients, MAX_INGREDIENTS, 80);
    if (b.allergen             !== undefined) page.allergen             = str(b.allergen, 120).trim();
    if (b.message              !== undefined) page.message              = sanitizeLines(b.message, MAX_MESSAGE_LINES, 600);
    if (b.photoUrl             !== undefined) page.photoUrl             = str(b.photoUrl, 600).trim();
    if (b.distributedBy        !== undefined) page.distributedBy        = str(b.distributedBy, 120).trim();
    // Empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, 128) !== "") page.password = str(b.password, 128);

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await NutritionPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "nutrition",
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
    console.error("Publish nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await NutritionPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    const { password: _pw, passwordRaw: _pr, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "nutrition" });
  } catch (error) {
    console.error("Get shared nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyNutritionPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await NutritionPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify nutrition page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteNutritionPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await NutritionPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete nutrition page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
