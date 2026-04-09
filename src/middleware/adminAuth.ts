import { Request, Response, NextFunction } from "express";
import User from "../models/User";

/**
 * Middleware: requires the user to have "admin" role.
 * Must be used AFTER the `protect` middleware.
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || user.role !== "admin") {
      res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
      return;
    }
    next();
  } catch {
    res.status(500).json({ success: false, error: "Authorization check failed" });
  }
};

/**
 * Middleware: requires the user to have "admin" or "member" role.
 * Must be used AFTER the `protect` middleware.
 */
export const requireMemberOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = await User.findById(req.userId).select("role");
    if (!user || (user.role !== "admin" && user.role !== "member")) {
      res.status(403).json({
        success: false,
        error: "Access denied. Member or Admin privileges required.",
      });
      return;
    }
    next();
  } catch {
    res.status(500).json({ success: false, error: "Authorization check failed" });
  }
};
