import { Request, Response } from "express";
import ProductPage, {
  IAboutSection,
  IBundleItem,
  IProductPrice,
  IProductSender,
  IProductSubject,
  IQA,
  IReview,
  ISpec,
  PRODUCT_LIMITS,
  ReviewStatus,
  StarRating,
} from "../models/ProductPage";
import { uploadImageDataUrl } from "../services/mediaProcessor.service";
import { checkPublishAccess } from "../services/publishGate.service";
import { applyPagePassword } from "../services/pagePassword";

/**
 * NOTHING IN THIS FILE PARSES MONEY. `price.amount`, `price.original` and
 * `bundle[].price` go through `str()` and only `str()` — the demo amount is "∞"
 * and a Number()/parseInt()/parseFloat() anywhere on that path renders "NaN" in
 * the buy box. `discountPct`, `votes`, `helpful` and `stars` are the only
 * numbers here, and they are all genuinely numbers.
 */

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max).trim() : "";

const clampNum = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** A non-negative integer. Guards every rendered count against floats and negatives. */
const count = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

/** Clamps to 1…5 and rounds, because the star histogram buckets on this. */
const starsOf = (v: unknown): StarRating =>
  clampNum(
    v,
    PRODUCT_LIMITS.starsDefault,
    PRODUCT_LIMITS.starsMin,
    PRODUCT_LIMITS.starsMax
  ) as StarRating;

/**
 * A review the sender has not explicitly marked as published stays pending.
 * The review box on the shared page is open to anybody holding the link, so an
 * unknown status must never default its way onto the recipient's page.
 */
const statusOf = (v: unknown): ReviewStatus => (v === "published" ? "published" : "pending");

/**
 * Artwork arrives either as an ordinary URL or as an inline base64 data URL
 * straight out of the file picker. A data URL is uploaded to S3 and only the
 * resulting link is stored — persisting the base64 would bloat the document
 * toward Mongo's 16MB ceiling, and this template carries a gallery rail, a
 * bundle strip and one image per review.
 *
 * Anything that is neither http(s) nor a data URL — `javascript:` most of all —
 * becomes the empty string, which the renderer draws as the grey fallback cell.
 * An upload failure is logged and yields an empty string rather than a 500:
 * every image here has a text fallback, so one bad file must not block the save.
 */
const resolveImageUrl = async (raw: unknown, userId: unknown, slot: string): Promise<string> => {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.slice(0, PRODUCT_LIMITS.url);
  if (!/^data:image\//i.test(value)) return "";
  try {
    const uploaded = await uploadImageDataUrl(
      value,
      `product/users/${String(userId || "anonymous")}/${slot}`
    );
    return uploaded.url.slice(0, PRODUCT_LIMITS.url);
  } catch (error) {
    console.error("Product image upload error:", error);
    return "";
  }
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const asArray = (v: unknown): unknown[] =>
  Array.isArray(v) ? v.slice(0, PRODUCT_LIMITS.maxRawItems) : [];

/**
 * Every write goes through an explicit allow-list of the fifteen content
 * fields. `req.body` is never spread into the document, so a caller cannot
 * smuggle in `userId`, `isPublished`, `shareId`, `viewCount` or `passwordRaw`.
 */
type ProductBody = {
  subject?: unknown;
  sender?: unknown;
  title?: unknown;
  storeName?: unknown;
  price?: unknown;
  stockLine?: unknown;
  deliveryLine?: unknown;
  bullets?: unknown;
  specs?: unknown;
  bundle?: unknown;
  qa?: unknown;
  reviews?: unknown;
  aboutSection?: unknown;
  contributorPrompt?: unknown;
  contributorsEnabled?: unknown;
  password?: unknown;
};

const sanitizeSubject = async (raw: unknown, userId: unknown): Promise<IProductSubject> => {
  const src = asRecord(raw);
  const photos: string[] = [];
  let slot = 0;
  for (const entry of asArray(src.photos)) {
    if (photos.length >= PRODUCT_LIMITS.maxPhotos) break;
    const url = await resolveImageUrl(entry, userId, `photo-${slot++}`);
    if (url) photos.push(url);
  }
  return {
    firstName: str(src.firstName, PRODUCT_LIMITS.name),
    lastName: str(src.lastName, PRODUCT_LIMITS.name),
    photos,
  };
};

const sanitizeSender = (raw: unknown): IProductSender => ({
  firstName: str(asRecord(raw).firstName, PRODUCT_LIMITS.name),
});

const sanitizePrice = (raw: unknown): IProductPrice => {
  const src = asRecord(raw);
  return {
    // str() keeps the string a string. "∞" survives, and so does "₹4,99,999".
    amount: str(src.amount, PRODUCT_LIMITS.price),
    original: str(src.original, PRODUCT_LIMITS.price),
    discountPct: clampNum(
      src.discountPct,
      PRODUCT_LIMITS.discountMin,
      PRODUCT_LIMITS.discountMin,
      PRODUCT_LIMITS.discountMax
    ),
  };
};

/** A bullet that is only whitespace renders as a stray dot, so it is dropped. */
const sanitizeBullets = (raw: unknown): string[] =>
  asArray(raw)
    .map((b) => str(b, PRODUCT_LIMITS.bullet))
    .filter(Boolean)
    .slice(0, PRODUCT_LIMITS.maxBullets);

/** A spec row with a blank side renders as a hole in the table. */
const sanitizeSpecs = (raw: unknown): ISpec[] => {
  const out: ISpec[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= PRODUCT_LIMITS.maxSpecs) break;
    const src = asRecord(entry);
    const label = str(src.label, PRODUCT_LIMITS.specLabel);
    const value = str(src.value, PRODUCT_LIMITS.specValue);
    if (!label || !value) continue;
    out.push({ label, value });
  }
  return out;
};

const sanitizeBundle = async (raw: unknown, userId: unknown): Promise<IBundleItem[]> => {
  const out: IBundleItem[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= PRODUCT_LIMITS.maxBundle) break;
    const src = asRecord(entry);
    const name = str(src.name, PRODUCT_LIMITS.title);
    // An unnamed tile is an unlabelled rectangle.
    if (!name) continue;
    out.push({
      name,
      // String. Untouched by any numeric parse — see the header of this file.
      price: str(src.price, PRODUCT_LIMITS.price),
      imageUrl: await resolveImageUrl(src.imageUrl, userId, `bundle-${out.length}`),
      note: str(src.note, PRODUCT_LIMITS.line),
    });
  }
  return out;
};

/** Half a Q&A entry is not a Q&A entry. */
const sanitizeQA = (raw: unknown): IQA[] => {
  const out: IQA[] = [];
  for (const entry of asArray(raw)) {
    if (out.length >= PRODUCT_LIMITS.maxQA) break;
    const src = asRecord(entry);
    const question = str(src.question, PRODUCT_LIMITS.question);
    const answer = str(src.answer, PRODUCT_LIMITS.answer);
    if (!question || !answer) continue;
    out.push({
      question,
      answer,
      by: str(src.by, PRODUCT_LIMITS.name) || "Anonymous",
      ago: str(src.ago, PRODUCT_LIMITS.ago),
      votes: count(src.votes),
    });
  }
  return out;
};

/**
 * Duplicate ids break React keys on the client and make moderation ambiguous
 * here — "publish rv3" has to mean exactly one row — so they are renumbered.
 */
const sanitizeReviews = async (raw: unknown, userId: unknown): Promise<IReview[]> => {
  const out: IReview[] = [];
  const seen = new Set<string>();
  for (const entry of asArray(raw)) {
    if (out.length >= PRODUCT_LIMITS.maxReviews) break;
    const src = asRecord(entry);
    const title = str(src.title, PRODUCT_LIMITS.reviewTitle);
    const body = str(src.body, PRODUCT_LIMITS.reviewBody);
    // A review with neither a headline nor a body is not a review.
    if (!title && !body) continue;

    let id = str(src.id, PRODUCT_LIMITS.reviewId) || `rv${out.length + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);

    out.push({
      id,
      author: str(src.author, PRODUCT_LIMITS.name) || "Anonymous",
      stars: starsOf(src.stars),
      title,
      body,
      ago: str(src.ago, PRODUCT_LIMITS.ago),
      verified: !!src.verified,
      helpful: count(src.helpful),
      imageUrl: await resolveImageUrl(src.imageUrl, userId, `review-${out.length}`),
      status: statusOf(src.status),
    });
  }
  return out;
};

const sanitizeAbout = async (raw: unknown, userId: unknown): Promise<IAboutSection> => {
  const src = asRecord(raw);
  return {
    heading: str(src.heading, PRODUCT_LIMITS.heading),
    body: str(src.body, PRODUCT_LIMITS.aboutBody),
    imageUrl: await resolveImageUrl(src.imageUrl, userId, "about"),
  };
};

export const createProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as ProductBody;

    const page = await ProductPage.create({
      userId: req.userId,
      subject: await sanitizeSubject(b.subject, req.userId),
      sender: sanitizeSender(b.sender),
      title: str(b.title, PRODUCT_LIMITS.title),
      storeName: str(b.storeName, PRODUCT_LIMITS.storeName),
      price: sanitizePrice(b.price),
      stockLine: str(b.stockLine, PRODUCT_LIMITS.line),
      deliveryLine: str(b.deliveryLine, PRODUCT_LIMITS.line),
      bullets: sanitizeBullets(b.bullets),
      specs: sanitizeSpecs(b.specs),
      bundle: await sanitizeBundle(b.bundle, req.userId),
      qa: sanitizeQA(b.qa),
      reviews: await sanitizeReviews(b.reviews, req.userId),
      aboutSection: await sanitizeAbout(b.aboutSection, req.userId),
      contributorPrompt: str(b.contributorPrompt, PRODUCT_LIMITS.prompt),
      contributorsEnabled: b.contributorsEnabled === undefined ? true : !!b.contributorsEnabled,
      password: str(b.password, PRODUCT_LIMITS.password),
    });

    res.status(201).json({ success: true, data: page });
  } catch (error) {
    console.error("Create product page error:", error);
    res.status(500).json({ success: false, error: "Failed to create page" });
  }
};

export const getMyProductPages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pages = await ProductPage.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.json({ success: true, data: pages });
  } catch (error) {
    console.error("Get my product pages error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pages" });
  }
};

export const getProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProductPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    const pageObj = page.toObject() as unknown as Record<string, unknown>;

    if (page.isPublished) {
      const { buildShareUrl } = await import("../utils/shareUrl");
      pageObj.shareUrl = await buildShareUrl(page.shareId, String(req.userId));
    }

    res.json({ success: true, data: pageObj });
  } catch (error) {
    console.error("Get product page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const updateProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const b = (req.body || {}) as ProductBody;

    const page = await ProductPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    if (b.subject             !== undefined) page.subject             = await sanitizeSubject(b.subject, req.userId);
    if (b.sender              !== undefined) page.sender              = sanitizeSender(b.sender);
    if (b.title               !== undefined) page.title               = str(b.title, PRODUCT_LIMITS.title);
    if (b.storeName           !== undefined) page.storeName           = str(b.storeName, PRODUCT_LIMITS.storeName);
    if (b.price               !== undefined) page.price               = sanitizePrice(b.price);
    if (b.stockLine           !== undefined) page.stockLine           = str(b.stockLine, PRODUCT_LIMITS.line);
    if (b.deliveryLine        !== undefined) page.deliveryLine        = str(b.deliveryLine, PRODUCT_LIMITS.line);
    if (b.bullets             !== undefined) page.bullets             = sanitizeBullets(b.bullets);
    if (b.specs               !== undefined) page.specs               = sanitizeSpecs(b.specs);
    if (b.bundle              !== undefined) page.bundle              = await sanitizeBundle(b.bundle, req.userId);
    if (b.qa                  !== undefined) page.qa                  = sanitizeQA(b.qa);
    if (b.reviews             !== undefined) page.reviews             = await sanitizeReviews(b.reviews, req.userId);
    if (b.aboutSection        !== undefined) page.aboutSection        = await sanitizeAbout(b.aboutSection, req.userId);
    if (b.contributorPrompt   !== undefined) page.contributorPrompt   = str(b.contributorPrompt, PRODUCT_LIMITS.prompt);
    if (b.contributorsEnabled !== undefined) page.contributorsEnabled = !!b.contributorsEnabled;
    // Absent or empty password on update means "unchanged", not "remove the gate".
    if (b.password !== undefined && str(b.password, PRODUCT_LIMITS.password) !== "") {
      applyPagePassword(page, b.password, PRODUCT_LIMITS.password);
    }

    await page.save();
    res.json({ success: true, data: page });
  } catch (error) {
    console.error("Update product page error:", error);
    res.status(500).json({ success: false, error: "Failed to update page" });
  }
};

export const publishProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProductPage.findOne({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    const gate = await checkPublishAccess({
      userId: String(req.userId),
      templateType: "product",
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
    console.error("Publish product page error:", error);
    res.status(500).json({ success: false, error: "Failed to publish page" });
  }
};

export const getSharedProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProductPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }

    page.viewCount = (page.viewCount || 0) + 1;
    await page.save();

    const pageObj = page.toObject();
    // contribToken is the friends' WRITE link — never on the recipient's read.
    const { password: _pw, passwordRaw: _pr, contribToken: _ct, ...safeData } = pageObj as unknown as Record<string, unknown>;
    res.json({ success: true, data: safeData, hasPassword: !!page.password, templateType: "product" });
  } catch (error) {
    console.error("Get shared product page error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch page" });
  }
};

export const verifyProductPagePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const page = await ProductPage.findOne({ shareId: req.params.shareId, isPublished: true });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    if (!page.password) { res.json({ success: true, verified: true }); return; }
    const match = await page.comparePassword(typeof password === "string" ? password : "");
    if (match) {
      res.json({ success: true, verified: true });
    } else {
      res.status(401).json({ success: false, verified: false, error: "Wrong password" });
    }
  } catch (error) {
    console.error("Verify product page password error:", error);
    res.status(500).json({ success: false, error: "Verification failed" });
  }
};

export const deleteProductPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await ProductPage.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!page) { res.status(404).json({ success: false, error: "Page not found" }); return; }
    res.json({ success: true, message: "Page deleted successfully" });
  } catch (error) {
    console.error("Delete product page error:", error);
    res.status(500).json({ success: false, error: "Failed to delete page" });
  }
};
