import { Request, Response } from "express";
import { RangeInputError } from "../services/revenueMath";
import { creationsReport } from "../services/creations.service";

/**
 * GET /api/admin/super/creations — who made which pages in a range.
 *
 * Mounted under /api/admin/super behind `protect` + `requireSuperAdmin`, so the
 * role is not re-checked here. Like the revenue reports, an aggregate read is
 * not audited; opening one person from it goes through their audited profile.
 */
export const getCreations = async (req: Request, res: Response): Promise<void> => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, data: await creationsReport(req.query as Record<string, unknown>) });
  } catch (error) {
    if (error instanceof RangeInputError || error instanceof RangeError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    console.error("Creations report error:", error);
    res.status(500).json({ success: false, error: "Failed to load pages created" });
  }
};
