import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, isImpersonation } from "../utils/jwt";
import { getAccountSnapshot, isCurrentlyBlocked } from "../services/accountStatus";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      /** Set only during an impersonation session: the super admin behind it. */
      impersonatorId?: string;
      impersonatorEmail?: string;
      userRole?: string;
    }
  }
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Not authenticated. Please log in.",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      success: false,
      error: "Token expired or invalid. Please log in again.",
    });
    return;
  }

  // A valid signature is no longer sufficient. The token says who the bearer
  // claims to be; the account says whether that identity is still allowed in.
  const snap = await getAccountSnapshot(decoded.userId);
  if (!snap) {
    res.status(401).json({ success: false, error: "Account no longer exists." });
    return;
  }

  // Tokens minted before `tv` existed carry no claim and read as 0, which is
  // the schema default — so this rejects revoked tokens without logging out
  // everyone who signed in before the field shipped.
  if ((decoded.tv ?? 0) !== snap.tokenVersion) {
    res.status(401).json({
      success: false,
      error: "Session has been revoked. Please log in again.",
      code: "SESSION_REVOKED",
    });
    return;
  }

  const blocked = isCurrentlyBlocked(snap);
  if (blocked) {
    res.status(403).json({
      success: false,
      error:
        blocked === "banned"
          ? "This account has been banned."
          : "This account is temporarily suspended.",
      code: blocked === "banned" ? "ACCOUNT_BANNED" : "ACCOUNT_SUSPENDED",
    });
    return;
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;
  req.userRole = snap.role;

  if (isImpersonation(decoded)) {
    req.impersonatorId = decoded.act;
    req.impersonatorEmail = decoded.actEmail;
  }

  next();
};

/**
 * Refuses anything an impersonated session must never do.
 *
 * Impersonation exists to reproduce what a user sees, not to act irreversibly
 * as them. Without this an admin could change the account's email and own it
 * outright, and the audit log would show only that the user did it themselves.
 * Mount on credential changes, account deletion, payments, and every admin
 * route — an impersonated session must not be able to impersonate onward.
 */
export const blockImpersonation = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.impersonatorId) {
    res.status(403).json({
      success: false,
      error: "This action is not available while viewing as another user.",
      code: "IMPERSONATION_FORBIDDEN",
    });
    return;
  }
  next();
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
 *
 * Note this path intentionally does NOT consult account status: it guards
 * anonymous-capable routes where the fallback for a blocked account is the
 * same as for a signed-out visitor. Anything that must refuse a banned user
 * uses `protect`.
 */
export const optionalProtect = optionalAuth;
