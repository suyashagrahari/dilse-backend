import { Request, Response } from "express";
import Wishlist, { WISHLIST_CAMPAIGNS } from "../models/Wishlist";
import { invalidateAudience } from "../services/audience.service";

const SOURCE_RE = /^[a-z0-9-]{1,40}$/;

type Row = { campaign: string; discountPercent: number; createdAt: Date };

/** The row as the client sees it, plus where the user stands in line. */
async function view(row: Row) {
  const position = await Wishlist.countDocuments({ campaign: row.campaign, createdAt: { $lte: row.createdAt } });
  return { campaign: row.campaign, discountPercent: row.discountPercent, joinedAt: row.createdAt, position };
}

/** GET /wishlist/:campaign/count — public, for "N people are waiting". */
export const getWishlistCount = async (req: Request, res: Response): Promise<void> => {
  const campaign = String(req.params.campaign);
  if (!WISHLIST_CAMPAIGNS[campaign]) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  try {
    const count = await Wishlist.countDocuments({ campaign });
    res.set("Cache-Control", "public, max-age=60");
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error("Wishlist count error:", error);
    res.status(500).json({ success: false, error: "Failed to count" });
  }
};

/** GET /wishlist/:campaign/me — has the signed-in user joined? */
export const getMyWishlistEntry = async (req: Request, res: Response): Promise<void> => {
  const campaign = String(req.params.campaign);
  if (!WISHLIST_CAMPAIGNS[campaign]) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  try {
    const row = await Wishlist.findOne({ userId: req.userId!, campaign }).lean();
    res.json({ success: true, data: { joined: !!row, entry: row ? await view(row) : null } });
  } catch (error) {
    console.error("Wishlist status error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};

/** POST /wishlist/:campaign — join. Idempotent: joining twice returns the first row. */
export const joinWishlist = async (req: Request, res: Response): Promise<void> => {
  const campaign = String(req.params.campaign);
  const config = WISHLIST_CAMPAIGNS[campaign];
  if (!config) {
    res.status(404).json({ success: false, error: "Unknown campaign" });
    return;
  }
  const raw = typeof req.body?.source === "string" ? req.body.source : "";
  const source = SOURCE_RE.test(raw) ? raw : undefined;
  try {
    const userId = req.userId!;
    const existing = await Wishlist.findOne({ userId, campaign }).lean();
    if (existing) {
      res.json({ success: true, data: { joined: true, already: true, entry: await view(existing) } });
      return;
    }
    try {
      const row = await Wishlist.create({
        userId, campaign, source, email: req.userEmail, discountPercent: config.discountPercent,
      });
      // So the Outreach "joined the wishlist" filter sees them straight away.
      invalidateAudience();
      res.status(201).json({ success: true, data: { joined: true, already: false, entry: await view(row) } });
    } catch (err) {
      // Two taps racing past the findOne: the unique index decides, both succeed.
      if ((err as { code?: number }).code === 11000) {
        const row = await Wishlist.findOne({ userId, campaign }).lean();
        if (row) {
          res.json({ success: true, data: { joined: true, already: true, entry: await view(row) } });
          return;
        }
      }
      throw err;
    }
  } catch (error) {
    console.error("Wishlist join error:", error);
    res.status(500).json({ success: false, error: "Failed to join" });
  }
};

/** GET /wishlist/me — every campaign the user has joined, for the profile. */
export const getMyWishlists = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await Wishlist.find({ userId: req.userId! }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: { entries: await Promise.all(rows.map(view)) } });
  } catch (error) {
    console.error("Wishlist list error:", error);
    res.status(500).json({ success: false, error: "Failed to load" });
  }
};
