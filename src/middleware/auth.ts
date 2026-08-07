import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Not authenticated. Please log in.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: "Token expired or invalid. Please log in again.",
    });
  }
};

export const optionalAuth = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = verifyAccessToken(token);
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
    } catch {
      // Token invalid, continue without auth
    }
  }

  next();
};

/**
 * Optional auth for routes that must work for signed-out visitors.
 *
 * Same token parsing as `protect`, but a missing or invalid token is not an
 * error — the request simply continues with no `req.userId`, and the handler
 * decides what an anonymous caller gets. Used by the AI fill route, where
 * publishing is auth-deferred: the sender builds and fills the whole page
 * before they ever log in, so the anonymous path is the normal one.
 *
 * Deliberately an alias rather than a second copy of the same eight lines —
 * two independent implementations of "is this request authenticated" is exactly
 * the kind of thing that drifts apart and then diverges on a security fix.
 */
export const optionalProtect = optionalAuth;
