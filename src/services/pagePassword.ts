/**
 * Apply an incoming page password from a builder request.
 *
 * ── THE BUG THIS REPLACES ───────────────────────────────────────────────────
 *
 * Controllers wrote one of these:
 *
 *     page.password = str(b.password, LIMITS.password);   // unconditional
 *     if (password !== undefined) page.password = password;
 *
 * Both hand the model an empty string on an ordinary edit — the first on EVERY
 * save whose body does not mention a password at all, the second whenever the
 * builder sends `""` because the sender did not retype it. The `pre("save")`
 * hook only hashes when `this.password` is truthy, so an empty value is not
 * rejected: it is stored as-is and the gate is gone.
 *
 * Reproduced against a real database on two templates: create a protected page,
 * edit an unrelated field, and the page opens for anyone with the link while
 * `passwordRaw` still shows the original password — so the admin panel displays
 * a password for a page that no longer has one.
 *
 * That is a private page becoming public because its owner renamed something.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * Absent, not a string, or blank  → leave the stored password exactly as it is.
 * Anything else                   → set it, and let the model's hook hash it and
 *                                   record the readable copy.
 *
 * Removing a password is deliberately NOT expressible here. "The sender left the
 * box empty" and "the sender wants the gate gone" look identical on the wire,
 * and only one of them is safe to guess. Clearing is an explicit action on its
 * own endpoint (`superAdmin.controller.setPagePassword`), where it is audited.
 */
export function applyPagePassword(
  page: { password?: string },
  incoming: unknown,
  max = 128
): void {
  if (typeof incoming !== "string") return;
  const trimmed = incoming.trim();
  if (!trimmed) return;
  // Assignment, so the model's pre-save hook hashes it and stores `passwordRaw`.
  // The hook trims too; this trims first so `max` counts real characters.
  page.password = trimmed.slice(0, max);
}
