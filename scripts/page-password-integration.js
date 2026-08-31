/**
 * Integration checks for an owner changing their own page's share password.
 *
 * The repo has no test framework, so this is a standalone script rather than a
 * suite. It DROPS THE DATABASE it points at, so it must only ever be aimed at a
 * scratch one.
 *
 *   1. cp .env .env.satest
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database (e.g. .../gifts_pwtest)
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/page-password-integration.js
 *
 * The two checks worth having are the last two of each group: that what lands in
 * the database is a BCRYPT HASH and not the plaintext, and that the recipient's
 * own unlock route agrees with the change. Writing a password through
 * `updateOne` instead of assign-and-save stores the plaintext where a hash
 * belongs, and every later unlock then fails while the secret sits readable —
 * a failure that no amount of testing the endpoint's status code would catch.
 */

require("dotenv").config({ path: "./.env.satest" });
process.env.APP_ENV = "local";
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const BASE = `http://127.0.0.1:${process.env.LOCAL_PORT || 5099}/api`;
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name} ${extra}`); }
}

const tok = (id, email) =>
  jwt.sign({ userId: id, email, tv: 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });

const api = async (path, opts = {}, token) => {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
};

(async () => {
  await mongoose.connect(process.env.LOCAL_MONGODB_URI);
  await mongoose.connection.db.dropDatabase();

  const User = require("../dist/models/User").default;
  const HoliPage = require("../dist/models/HoliPage").default;

  const owner = await User.create({ email: "owner@test.com", name: "Owner", provider: "local", password: "x1234567" });
  const other = await User.create({ email: "other@test.com", name: "Other", provider: "local", password: "x1234567" });
  const OWNER = tok(String(owner._id), owner.email);
  const OTHER = tok(String(other._id), other.email);

  const page = await HoliPage.create({
    userId: owner._id, senderName: "S", recipientName: "R", password: "firstpass",
  });

  const setPw = (pw, t, tt = "holi", id = page._id) =>
    api(`/my-pages/${tt}/${id}/password`, { method: "PUT", body: JSON.stringify({ password: pw }) }, t);

  console.log("\n── who may change it ──");
  check("anonymous is refused", (await setPw("newpass", null)).status === 401);
  // 404 rather than 403 on purpose: a 403 would confirm the page id exists.
  check("a different user gets 404, not 403", (await setPw("newpass", OTHER)).status === 404);

  console.log("\n── validation ──");
  check("too short is refused", (await setPw("ab", OWNER)).status === 400);
  check("over 128 characters is refused", (await setPw("x".repeat(129), OWNER)).status === 400);
  check("an unknown template 404s", (await setPw("newpass", OWNER, "not-a-template")).status === 404);
  check("a malformed pageId 400s", (await setPw("newpass", OWNER, "holi", "nope")).status === 400);

  console.log("\n── changing it ──");
  {
    const r = await setPw("sunflower", OWNER);
    check("the owner changed it", r.status === 200, JSON.stringify(r.body));
    check("the response reports hasPassword", r.body?.data?.hasPassword === true);
    check("the response echoes the new plaintext", r.body?.data?.passwordRaw === "sunflower");

    const fresh = await HoliPage.findById(page._id).select("+passwordRaw");
    check("what is STORED is a bcrypt hash, not the plaintext",
      /^\$2[aby]\$/.test(fresh.password), fresh.password.slice(0, 14));
    check("passwordRaw tracks the new value", fresh.passwordRaw === "sunflower", fresh.passwordRaw);
    check("comparePassword accepts the new password", await fresh.comparePassword("sunflower"));
    check("comparePassword rejects the old one", !(await fresh.comparePassword("firstpass")));
  }

  console.log("\n── the recipient's unlock route agrees ──");
  {
    await HoliPage.findByIdAndUpdate(page._id, { isPublished: true });
    const live = await HoliPage.findById(page._id);
    const good = await api(`/holi-pages/share/${live.shareId}/verify`, { method: "POST", body: JSON.stringify({ password: "sunflower" }) });
    const bad = await api(`/holi-pages/share/${live.shareId}/verify`, { method: "POST", body: JSON.stringify({ password: "firstpass" }) });
    check("the new password unlocks the shared page", good.status === 200, JSON.stringify(good.body));
    check("the old password no longer unlocks it", bad.status === 401, JSON.stringify(bad.body));
  }

  console.log("\n── removing it ──");
  {
    const r = await setPw("", OWNER);
    check("the owner removed it", r.status === 200, JSON.stringify(r.body));
    check("it reports hasPassword false", r.body?.data?.hasPassword === false);

    const fresh = await HoliPage.findById(page._id).select("+passwordRaw");
    check("password is cleared", fresh.password === "");
    // The model's pre-save hook is `isModified("password") && this.password`, so
    // clearing skips it and passwordRaw would keep the OLD plaintext. The
    // controller clears it by hand; this is the check that it still does.
    check("passwordRaw is ALSO cleared — no stale plaintext left behind",
      fresh.passwordRaw === "", `got "${fresh.passwordRaw}"`);

    const live = await HoliPage.findById(page._id);
    const open = await api(`/holi-pages/share/${live.shareId}`);
    check("the shared page now opens without a password", open.status === 200, `got ${open.status}`);
  }

  console.log("\n── setting one on a page that had none ──");
  {
    check("added again", (await setPw("tulip123", OWNER)).status === 200);
    const fresh = await HoliPage.findById(page._id).select("+passwordRaw");
    check("hashed", /^\$2[aby]\$/.test(fresh.password));
    check("raw tracked", fresh.passwordRaw === "tulip123");
  }

  console.log("\n── a hidden template does not lock the owner out ──");
  {
    // The template gate guards create/update/publish. Managing the password of a
    // page you already own must keep working when the template is switched off,
    // which is why this endpoint is mounted outside that gate.
    const sa = await User.create({ email: "suyashagrahari2121@gmail.com", name: "Super", provider: "local", password: "x1234567" });
    const SA = tok(String(sa._id), sa.email);
    await api("/admin/template-visibility/holi", { method: "PATCH", body: JSON.stringify({ live: false }) }, SA);
    const r = await setPw("stillworks", OWNER);
    check("password still changeable while the template is hidden", r.status === 200, JSON.stringify(r.body));
    await api("/admin/template-visibility/holi", { method: "PATCH", body: JSON.stringify({ live: true }) }, SA);
  }

  console.log(`\n── ${pass} passed, ${fail} failed ──`);
  if (fail) console.log("failed:\n  " + failures.join("\n  "));
  console.log();
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
