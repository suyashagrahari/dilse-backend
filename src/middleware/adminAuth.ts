import { Request, Response, NextFunction } from "express";
import { roleAtLeast, type UserRole } from "../config/roles";
import { getAccountSnapshot } from "../services/accountStatus";

/**
 * Role gates.
 *
 * These read from the same cached snapshot `protect` already fetched, so an
 * admin route costs no extra query beyond what authentication already paid.
 *
 * Gates compare by rank, not equality: `requireAdmin` admits a superadmin
 * because superadmin outranks admin. The previous `role !== "admin"` check
 * would have locked the super admin out of every existing admin surface the
 * moment the new role was assigned to them.
 *
 * All three refuse impersonated sessions. Privilege must never be reachable
 * through a session that is only borrowing an identity — and since a super
 * admin can impersonate anyone, the reverse would let an impersonated session
 * of an admin reach admin routes with the audit trail pointing at the wrong
 * person.
 */
function gate(min: UserRole, label: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.impersonatorId) {
        res.status(403).json({
          success: false,
          error: "Admin actions are not available while viewing as another user.",
          code: "IMPERSONATION_FORBIDDEN",
        });
        return;
      }

      const role = req.userRole ?? (await getAccountSnapshot(String(req.userId)))?.role;

      if (!roleAtLeast(role, min)) {
        res.status(403).json({
          success: false,
          error: `Access denied. ${label} privileges required.`,
        });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: "Authorization check failed" });
    }
  };
}

/** Requires "admin" or above. Must be used AFTER `protect`. */
export const requireAdmin = gate("admin", "Admin");

/** Requires "member" or above. Must be used AFTER `protect`. */
export const requireMemberOrAdmin = gate("member", "Member or Admin");

/**
 * Requires "superadmin". Must be used AFTER `protect`.
 *
 * Gates the capabilities that read personal data or cannot be undone: reading a
 * recipient's password, deleting somebody's page, adjusting points, banning an
 * account, and impersonation.
 */
export const requireSuperAdmin = gate("superadmin", "Super Admin");
