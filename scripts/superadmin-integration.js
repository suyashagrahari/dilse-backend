/**
 * Integration checks for the super-admin surfaces.
 *
 * The repo has no test framework, so this is a standalone script rather than a
 * suite. It DROPS THE DATABASE it points at, so it must only ever be aimed at a
 * scratch one.
 *
 *   1. cp .env .env.satest
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database (e.g. .../gifts_satest)
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/superadmin-integration.js
 *
 * Covers the invariants that are expensive to get wrong: role gating, that an
 * admin cannot promote themselves, that a password reset stores a HASH and the
 * recipient can still unlock, that a ban actually ends live sessions, what an
 * impersonated session is refused, and that no plaintext password reaches the
 * audit log.
 */

require("dotenv").config({ path: "./.env.satest" });
process.env.APP_ENV = "local";
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = "http://127.0.0.1:5099/api";
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}
const tok = (id, email, tv = 0) =>
  jwt.sign({ userId: id, email, tv }, process.env.JWT_SECRET, { expiresIn: "1h" });
const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

(async () => {
  await mongoose.connect(process.env.LOCAL_MONGODB_URI);
  const db = mongoose.connection.db;
  await db.dropDatabase();

  const User = require("./dist/models/User").default;
  const BirthdayGfPage = require("./dist/models/BirthdayGfPage").default;

  // Seeded through the model so pre-save hooks run (role elevation, hashing).
  const sa = await User.create({ email: "suyashagrahari2121@gmail.com", name: "Super", provider: "local", password: "x1234567" });
  const admin = await User.create({ email: "admin@test.com", name: "Admin", provider: "local", password: "x1234567", role: "admin" });
  const victim = await User.create({ email: "victim@test.com", name: "Victim", provider: "local", password: "x1234567", points: 100 });

  const page = await BirthdayGfPage.create({
    userId: victim._id, recipientName: "R", senderName: "S",
    shareId: "satest-share-1", isPublished: true, password: "opensesame",
  });

  console.log("\n── seeding ──");
  check("super admin auto-elevated to superadmin role", sa.role === "superadmin", `got ${sa.role}`);
  check("page password hashed by pre-save hook", /^\$2[aby]\$/.test(page.password));
  check("passwordRaw captured", page.passwordRaw === "opensesame");

  const saT = tok(String(sa._id), sa.email);
  const adminT = tok(String(admin._id), admin.email);
  const victimT = tok(String(victim._id), victim.email);

  console.log("\n── backward compatibility ──");
  // The riskiest path in this release. Every already-signed-in user holds a
  // token with no `tv` claim, against a document with no `tokenVersion` or
  // `status` field. If either side failed to default to 0/"active", the deploy
  // would sign out every user on the platform at once.
  const legacyUser = await User.create({ email: "legacy@test.com", name: "Legacy", provider: "local", password: "x1234567" });
  await db.collection("users").updateOne({ _id: legacyUser._id }, { $unset: { tokenVersion: "", status: "" } });
  const legacyTok = jwt.sign({ userId: String(legacyUser._id), email: legacyUser.email }, process.env.JWT_SECRET, { expiresIn: "5m" });
  check("pre-deploy token + pre-deploy document still authenticates", (await api(`/auth/me`, {}, legacyTok)).status === 200);

  console.log("\n── access control ──");
  check("superadmin route rejects normal user", (await api(`/admin/super/users/${victim._id}/profile`, {}, victimT)).status === 403);
  check("superadmin route rejects plain admin", (await api(`/admin/super/users/${victim._id}/profile`, {}, adminT)).status === 403);
  check("superadmin route rejects anonymous", (await api(`/admin/super/users/${victim._id}/profile`)).status === 401);
  const prof = await api(`/admin/super/users/${victim._id}/profile`, {}, saT);
  check("superadmin can load full profile", prof.status === 200 && prof.body?.success, `status ${prof.status}`);
  check("profile lists the user's page", prof.body?.data?.pages?.length === 1);
  check("profile reports hasPassword without leaking it", prof.body?.data?.pages?.[0]?.hasPassword === true && !JSON.stringify(prof.body).includes("opensesame"));
  check("plain admin cannot grant superadmin", (await api(`/admin/users/${victim._id}/role`, { method: "PATCH", body: JSON.stringify({ role: "superadmin" }) }, adminT)).status === 400);

  // The superadmin must still reach every PRE-EXISTING admin surface. The role
  // sits above `admin`, so any gate written as `role === "admin"` silently
  // excludes it — which is how the Admin link vanished from the nav.
  for (const p of ["/admin/users", "/admin/analytics/overview", "/admin/contacts", "/admin/template-visibility"]) {
    check(`superadmin can reach ${p}`, (await api(p, {}, saT)).status === 200);
  }
  const meSa = await api(`/auth/me`, {}, saT);
  check("/auth/me reports superadmin so the nav can gate on it",
    (meSa.body?.data?.role ?? meSa.body?.data?.user?.role) === "superadmin");

  console.log("\n── password reveal + reset ──");
  const rev = await api(`/admin/super/pages/birthday-gf/${page._id}/password`, {}, saT);
  check("reveal returns the real password", rev.body?.data?.password === "opensesame", JSON.stringify(rev.body));
  const set = await api(`/admin/super/pages/birthday-gf/${page._id}/password`, { method: "PUT", body: JSON.stringify({ password: "newpass99" }) }, saT);
  check("password reset accepted", set.status === 200, JSON.stringify(set.body));
  const after = await BirthdayGfPage.findById(page._id).select("+passwordRaw");
  check("reset stored a bcrypt HASH, not plaintext", /^\$2[aby]\$/.test(after.password), `got ${after.password}`);
  check("reset password actually verifies", await after.comparePassword("newpass99"));
  check("old password no longer works", !(await after.comparePassword("opensesame")));
  const verify = await api(`/birthday-gf-pages/share/satest-share-1/verify`, { method: "POST", body: JSON.stringify({ password: "newpass99" }) });
  check("recipient can unlock with the new password", verify.body?.verified === true, JSON.stringify(verify.body));

  console.log("\n── points ──");
  check("points adjustment requires a reason", (await api(`/admin/super/users/${victim._id}/points`, { method: "POST", body: JSON.stringify({ delta: 50 }) }, saT)).status === 400);
  const pts = await api(`/admin/super/users/${victim._id}/points`, { method: "POST", body: JSON.stringify({ delta: 50, reason: "goodwill" }) }, saT);
  check("points adjusted to 150", pts.body?.data?.points === 150, JSON.stringify(pts.body));
  const ledger = await db.collection("pointtransactions").findOne({ type: "admin_grant" });
  check("ledger row written with reason", ledger?.delta === 50 && ledger?.meta?.reason === "goodwill");
  const neg = await api(`/admin/super/users/${victim._id}/points`, { method: "POST", body: JSON.stringify({ delta: -999, reason: "clawback" }) }, saT);
  check("balance floors at 0 instead of going negative", neg.body?.data?.points === 0, JSON.stringify(neg.body));

  console.log("\n── suspend / ban ──");
  check("victim can call an API before suspension", (await api(`/auth/me`, {}, victimT)).status === 200);
  const susp = await api(`/admin/super/users/${victim._id}/status`, { method: "POST", body: JSON.stringify({ status: "suspended", reason: "abuse" }) }, saT);
  check("suspend accepted", susp.status === 200, JSON.stringify(susp.body));
  const meAfter = await api(`/auth/me`, {}, victimT);
  check("old token now rejected (session revoked)", meAfter.status === 401 || meAfter.status === 403, `status ${meAfter.status}`);
  const freshVictim = await User.findById(victim._id);
  const victimT2 = tok(String(victim._id), victim.email, freshVictim.tokenVersion);
  const me2 = await api(`/auth/me`, {}, victimT2);
  check("even a correctly-versioned token is refused while suspended", me2.status === 403 && me2.body?.code === "ACCOUNT_SUSPENDED", JSON.stringify(me2.body));
  check("suspended user's page still opens for recipients", (await api(`/birthday-gf-pages/share/satest-share-1`)).status === 200);

  await api(`/admin/super/users/${victim._id}/status`, { method: "POST", body: JSON.stringify({ status: "banned", reason: "spam" }) }, saT);
  check("banned user's page is now hidden (404)", (await api(`/birthday-gf-pages/share/satest-share-1`)).status === 404);
  await api(`/admin/super/users/${victim._id}/status`, { method: "POST", body: JSON.stringify({ status: "active" }) }, saT);
  check("reinstating restores the page", (await api(`/birthday-gf-pages/share/satest-share-1`)).status === 200);

  console.log("\n── impersonation ──");
  const imp = await api(`/admin/super/users/${victim._id}/impersonate`, { method: "POST", body: JSON.stringify({ reason: "debug" }) }, saT);
  check("impersonation token issued", !!imp.body?.data?.token, JSON.stringify(imp.body));
  const impT = imp.body?.data?.token;
  const impMe = await api(`/auth/me`, {}, impT);
  check("impersonated session resolves AS the victim", impMe.body?.data?.email === "victim@test.com" || impMe.body?.data?.user?.email === "victim@test.com", JSON.stringify(impMe.body).slice(0, 160));
  check("impersonator cannot change the account password", (await api(`/auth/password`, { method: "PUT", body: JSON.stringify({ currentPassword: "x1234567", newPassword: "hijacked1" }) }, impT)).status === 403);
  check("impersonator cannot change the profile", (await api(`/auth/profile`, { method: "PUT", body: JSON.stringify({ name: "Hijacked" }) }, impT)).status === 403);
  check("impersonator cannot reach admin routes", (await api(`/admin/users`, {}, impT)).status === 403);
  check("impersonator cannot chain-impersonate", (await api(`/admin/super/users/${admin._id}/impersonate`, { method: "POST" }, impT)).status === 403);
  check("ending impersonation works from inside the session", (await api(`/admin/impersonate/end`, { method: "POST" }, impT)).status === 200);
  check("super admin account cannot be impersonated", (await api(`/admin/super/users/${sa._id}/impersonate`, { method: "POST" }, saT)).status === 403);
  check("super admin account cannot be banned", (await api(`/admin/super/users/${sa._id}/status`, { method: "POST", body: JSON.stringify({ status: "banned", reason: "x" }) }, saT)).status === 403);

  console.log("\n── force logout ──");
  const fresh2 = await User.findById(victim._id);
  const goodT = tok(String(victim._id), victim.email, fresh2.tokenVersion);
  check("token valid before force-logout", (await api(`/auth/me`, {}, goodT)).status === 200);
  await api(`/admin/super/users/${victim._id}/force-logout`, { method: "POST" }, saT);
  const afterFL = await api(`/auth/me`, {}, goodT);
  check("force-logout revokes the session", afterFL.status === 401 && afterFL.body?.code === "SESSION_REVOKED", JSON.stringify(afterFL.body));

  console.log("\n── page delete + audit ──");
  check("page deleted", (await api(`/admin/super/pages/birthday-gf/${page._id}`, { method: "DELETE" }, saT)).status === 200);
  check("deleted page 404s for recipients", (await api(`/birthday-gf-pages/share/satest-share-1`)).status === 404);
  const auditRes = await api(`/admin/super/audit?limit=100`, {}, saT);
  const actions = (auditRes.body?.data?.entries || []).map((e) => e.action);
  for (const a of ["user.view_profile", "user.reveal_password", "page.reset_password", "user.adjust_points", "user.suspend", "user.ban", "user.reinstate", "impersonation.start", "impersonation.end", "user.force_logout", "page.delete"]) {
    check(`audited: ${a}`, actions.includes(a));
  }
  const revealEntry = (auditRes.body?.data?.entries || []).find((e) => e.action === "page.reset_password");
  check("audit log never stores a plaintext password", !JSON.stringify(auditRes.body).includes("newpass99") && !JSON.stringify(auditRes.body).includes("opensesame"));

  await mongoose.disconnect();
  console.log(`\n${"=".repeat(50)}\nPASS ${pass}   FAIL ${fail}\n${"=".repeat(50)}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(1); });
