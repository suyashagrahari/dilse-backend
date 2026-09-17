import mongoose from "mongoose";

/**
 * Keep the plaintext of a page password the first time we ever see it proved
 * correct.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Every page saved today stores `passwordRaw` alongside the hash, so the sender
 * can be reminded of their own password and a super admin can read it for
 * support. Pages older than that field have the hash and nothing else, and
 * bcrypt is one way — so the admin panel can only say "it can be reset but not
 * recovered", which is true and useless to somebody trying to help a recipient
 * who is locked out.
 *
 * There is exactly one moment when the plaintext of such a page is known: when
 * a recipient types it and it verifies. That is what this captures. After the
 * first successful unlock the page is as recoverable as one created today, so
 * the old rows heal themselves as they are actually used, with nothing to run
 * and nobody to remember.
 *
 * ── WHY IT IS AN updateOne AND NOT doc.save() ───────────────────────────────
 *
 * `save()` would fire the model's `pre("save")` hook. That hook hashes
 * `password` whenever it is modified — and on a document loaded for a password
 * check, `password` already holds the HASH. Re-saving through the hook risks
 * hashing the hash, which would lock the page permanently. An update operator
 * skips hooks, which is precisely what is wanted here.
 *
 * ── WHY THE FILTER MATTERS ──────────────────────────────────────────────────
 *
 * `passwordRaw` is `select: false`, so the verify controllers load documents
 * without it: an in-memory check would say "missing" even for a page that has
 * it, and we would write on every single unlock. The filter does the test in
 * the database instead, so a page that already has its plaintext is not written
 * to at all, and a busy page costs one no-op update the first time and nothing
 * after.
 */
/**
 * Only what this actually touches.
 *
 * Deliberately NOT `mongoose.Document`: inside a schema method `this` is typed
 * from the schema's own generics and does not structurally satisfy the full
 * Document interface, so demanding it here fails to compile in all 43 models.
 * It also lets the unit tests call `comparePassword` with a synthetic `this`,
 * which is how they stay free of a database — such an object has no `schema`,
 * so the guard below returns before anything is written.
 */
type RecoverablePage = {
  _id?: unknown;
  passwordRaw?: string;
  schema?: { path?: (p: string) => unknown };
  constructor: unknown;
};

export async function rememberPagePassword(
  doc: RecoverablePage,
  plaintext: string
): Promise<void> {
  try {
    if (!plaintext) return;
    // Templates without the field, and the synthetic `this` the tests use.
    if (!doc.schema?.path?.("passwordRaw")) return;

    const model = doc.constructor as mongoose.Model<unknown>;
    await model.updateOne(
      {
        _id: doc._id,
        $or: [{ passwordRaw: { $exists: false } }, { passwordRaw: "" }, { passwordRaw: null }],
      },
      { $set: { passwordRaw: plaintext } }
    );

    // Keep the in-memory document consistent for the rest of this request.
    doc.passwordRaw = plaintext;
  } catch {
    // Never let a bookkeeping write stop a recipient opening their page. The
    // password was correct; that is the only thing the caller is waiting on.
  }
}
