import User from "../models/User";
import { SUPER_ADMIN_EMAIL } from "../config/roles";

/**
 * Guarantees the super-admin account actually holds the superadmin role.
 *
 * The role is asserted in a `pre("save")` hook, which only fires when the
 * document is saved. An account that already existed before this feature
 * shipped therefore keeps `role: "admin"` until something happens to save it —
 * so on the deploy that introduced the tier, the super-admin surfaces would
 * have been unreachable by the one account meant to reach them.
 *
 * Running at boot also makes the deployment self-healing: restore an older
 * database, promote the wrong person by accident, and the next restart puts it
 * back. `updateOne` is correct here rather than the usual save-so-hooks-run
 * rule, because the hook is exactly what this is standing in for.
 */
export async function ensureSuperAdmin(): Promise<void> {
  try {
    const res = await User.updateOne(
      { email: SUPER_ADMIN_EMAIL, role: { $ne: "superadmin" } },
      { $set: { role: "superadmin", status: "active" } }
    );
    if (res.modifiedCount > 0) {
      console.log(`[boot] promoted ${SUPER_ADMIN_EMAIL} to superadmin`);
    }
  } catch (err) {
    console.error("[boot] ensureSuperAdmin failed", err);
  }
}
