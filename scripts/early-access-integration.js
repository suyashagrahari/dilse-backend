/**
 * Integration checks for per-user early access to a hidden template.
 *
 * The repo has no test framework, so this is a standalone script rather than a
 * suite. It DROPS THE DATABASE it points at, so it must only ever be aimed at a
 * scratch one.
 *
 *   1. cp .env .env.satest
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database (e.g. .../gifts_eatest)
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/early-access-integration.js
 *
 * Covers the pair that matters: a hidden template refuses a normal user's
 * create/update/publish AND admits a granted user's, on the server, not just in
 * the gallery. Plus: the grant waives the paywall, revoking closes access,
 * /auth/me carries the list, and granting twice is one row.
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

const tok = (id, email, tv = 0) =>
  jwt.sign({ userId: id, email, tv }, process.env.JWT_SECRET, { expiresIn: "1h" });

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
  try { body = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status, body };
};

// The template held back for this run. `holi` is used because it is live by
// default, so hiding it here proves the mechanism rather than relying on a slug
// that DEFAULT_HIDDEN already covers.
const SLUG = "holi";
const BASEPATH = "/holi-pages";
const TT = "holi";

(async () => {
  await mongoose.connect(process.env.LOCAL_MONGODB_URI);
  await mongoose.connection.db.dropDatabase();

  const User = require("../dist/models/User").default;
  const HoliPage = require("../dist/models/HoliPage").default;
  const TemplateGrant = require("../dist/models/TemplateGrant").default;

  const sa = await User.create({ email: "suyashagrahari2121@gmail.com", name: "Super", provider: "local", password: "x1234567" });
  const admin = await User.create({ email: "admin@test.com", name: "Admin", provider: "local", password: "x1234567", role: "admin" });
  const client = await User.create({ email: "client@test.com", name: "Client", provider: "local", password: "x1234567", points: 500 });
  const stranger = await User.create({ email: "stranger@test.com", name: "Stranger", provider: "local", password: "x1234567", points: 500 });
  const banned = await User.create({ email: "banned@test.com", name: "Banned", provider: "local", password: "x1234567", status: "banned" });

  const saT = tok(String(sa._id), sa.email);
  const adminT = tok(String(admin._id), admin.email);
  const clientT = tok(String(client._id), client.email);
  const strangerT = tok(String(stranger._id), stranger.email);

  const newPage = (owner) => HoliPage.create({ userId: owner._id, senderName: "S", recipientName: "R" });

  console.log("\n── seeding ──");
  check("super admin auto-elevated", sa.role === "superadmin", `got ${sa.role}`);

  console.log("\n── who may grant ──");
  check("anonymous cannot read grants", (await api("/admin/template-grants")).status === 401);
  check("normal user cannot read grants", (await api("/admin/template-grants", {}, clientT)).status === 403);
  check("plain ADMIN cannot read grants", (await api("/admin/template-grants", {}, adminT)).status === 403);
  check("super admin can read grants", (await api("/admin/template-grants", {}, saT)).status === 200);
  check("plain ADMIN cannot create a grant",
    (await api("/admin/template-grants", { method: "POST", body: JSON.stringify({ userId: String(client._id), slug: SLUG }) }, adminT)).status === 403);

  console.log("\n── validation ──");
  const badGrant = async (body, why, expect = 400) => {
    const r = await api("/admin/template-grants", { method: "POST", body: JSON.stringify(body) }, saT);
    check(`rejects ${why}`, r.status === expect, `got ${r.status} ${JSON.stringify(r.body)}`);
  };
  await badGrant({ slug: SLUG }, "a missing userId");
  await badGrant({ userId: "nope", slug: SLUG }, "a malformed userId");
  await badGrant({ userId: String(client._id) }, "a missing slug");
  await badGrant({ userId: String(client._id), slug: "Not_A_Slug!" }, "a malformed slug");
  await badGrant({ userId: String(client._id), slug: "no-such-template" }, "a slug no template uses");
  await badGrant({ userId: String(new mongoose.Types.ObjectId()), slug: SLUG }, "a userId with no account", 404);
  await badGrant({ userId: String(banned._id), slug: SLUG }, "a banned account");
  await badGrant({ userId: String(client._id), slug: SLUG, note: "x".repeat(201) }, "a note over 200 chars");

  console.log("\n── while the template is LIVE, everyone can use it ──");
  {
    const p = await newPage(client);
    const r = await api(`${BASEPATH}/${p._id}/publish`, { method: "POST" }, clientT);
    check("a live template publishes for anyone", r.status === 200, JSON.stringify(r.body));
  }

  console.log("\n── hide it ──");
  {
    const r = await api(`/admin/template-visibility/${SLUG}`, { method: "PATCH", body: JSON.stringify({ live: false }) }, saT);
    check("super admin hid the template", r.status === 200, JSON.stringify(r.body));
    const pub = await api("/template-visibility");
    check("it appears in the public hidden list", (pub.body?.data?.hidden || []).includes(SLUG), JSON.stringify(pub.body?.data));
  }

  console.log("\n── a hidden template is closed to a normal user, on the SERVER ──");
  {
    const create = await api(BASEPATH, { method: "POST", body: JSON.stringify({ senderName: "S", recipientName: "R" }) }, strangerT);
    check("create is refused", create.status === 403, `got ${create.status}`);
    check("…with TEMPLATE_NOT_LIVE", create.body?.code === "TEMPLATE_NOT_LIVE", JSON.stringify(create.body));

    // A page made before the template was hidden, so update/publish can be tried.
    const p = await newPage(stranger);
    const upd = await api(`${BASEPATH}/${p._id}`, { method: "PUT", body: JSON.stringify({ senderName: "X" }) }, strangerT);
    check("update is refused", upd.status === 403, `got ${upd.status}`);
    const pubr = await api(`${BASEPATH}/${p._id}/publish`, { method: "POST" }, strangerT);
    check("publish is refused", pubr.status === 403, `got ${pubr.status}`);

    const fresh = await HoliPage.findById(p._id);
    check("the refused page did NOT go live", fresh.isPublished !== true);

    const me = await api("/auth/me", {}, strangerT);
    check("/auth/me carries an empty earlyAccess", Array.isArray(me.body?.data?.earlyAccess) && me.body.data.earlyAccess.length === 0, JSON.stringify(me.body?.data?.earlyAccess));
  }

  console.log("\n── grant the client early access ──");
  {
    const r = await api("/admin/template-grants", { method: "POST", body: JSON.stringify({ userId: String(client._id), slug: SLUG, note: "Sharma demo" }) }, saT);
    check("super admin granted access", r.status === 201, JSON.stringify(r.body));

    const me = await api("/auth/me", {}, clientT);
    check("/auth/me now lists the slug", (me.body?.data?.earlyAccess || []).includes(SLUG), JSON.stringify(me.body?.data?.earlyAccess));

    const create = await api(BASEPATH, { method: "POST", body: JSON.stringify({ senderName: "S", recipientName: "R" }) }, clientT);
    check("the granted user CAN create", create.status === 201 || create.status === 200, `got ${create.status} ${JSON.stringify(create.body)}`);
    const id = create.body?.data?._id;

    const upd = await api(`${BASEPATH}/${id}`, { method: "PUT", body: JSON.stringify({ senderName: "X" }) }, clientT);
    check("the granted user CAN update", upd.status === 200, `got ${upd.status}`);

    const pubr = await api(`${BASEPATH}/${id}/publish`, { method: "POST" }, clientT);
    check("the granted user CAN publish", pubr.status === 200, `got ${pubr.status} ${JSON.stringify(pubr.body)}`);

    // The other half of the pair: the stranger is still shut out.
    const other = await api(BASEPATH, { method: "POST", body: JSON.stringify({ senderName: "S", recipientName: "R" }) }, strangerT);
    check("a NON-granted user is still refused", other.status === 403, `got ${other.status}`);

    check("the template is still hidden from the public list",
      ((await api("/template-visibility")).body?.data?.hidden || []).includes(SLUG));
  }

  console.log("\n── granting twice is one row ──");
  {
    const again = await api("/admin/template-grants", { method: "POST", body: JSON.stringify({ userId: String(client._id), slug: SLUG, note: "updated note" }) }, saT);
    check("a second grant succeeds", again.status === 201, `got ${again.status}`);
    const n = await TemplateGrant.countDocuments({ userId: client._id, slug: SLUG });
    check("still exactly one grant row", n === 1, `found ${n}`);
  }

  console.log("\n── the grant waives payment (publish gate rule 4) ──");
  {
    const priced = await api(`/admin/template-pricing/${SLUG}`, { method: "PATCH", body: JSON.stringify({ isFree: false, finalPricePaise: 9900, discountPercent: 0 }) }, saT);
    check("super admin priced the hidden template", priced.status === 200, JSON.stringify(priced.body));

    // The granted client: allowed AND not charged.
    const mine = await api(BASEPATH, { method: "POST", body: JSON.stringify({ senderName: "S", recipientName: "R" }) }, clientT);
    const pubr = await api(`${BASEPATH}/${mine.body?.data?._id}/publish`, { method: "POST" }, clientT);
    check("a granted user publishes a PAID template free", pubr.status === 200, `got ${pubr.status} ${JSON.stringify(pubr.body)}`);
    const orders = await mongoose.connection.db.collection("paymentorders").countDocuments({ userId: client._id });
    check("no payment was taken from them", orders === 0, `found ${orders}`);

    // Reveal the template again so the stranger reaches the paywall rather than
    // the visibility gate — this asserts rule 4 and not rule 0.
    await api(`/admin/template-visibility/${SLUG}`, { method: "PATCH", body: JSON.stringify({ live: true }) }, saT);
    const sp = await newPage(stranger);
    const spub = await api(`${BASEPATH}/${sp._id}/publish`, { method: "POST" }, strangerT);
    check("a NON-granted user still hits the 402", spub.status === 402, `got ${spub.status} ${JSON.stringify(spub.body)}`);

    await api(`/admin/template-visibility/${SLUG}`, { method: "PATCH", body: JSON.stringify({ live: false }) }, saT);
  }

  console.log("\n── reading grants back ──");
  {
    const bySlug = await api(`/admin/template-grants/${SLUG}`, {}, saT);
    check("per-template list returns the grant", (bySlug.body?.data?.grants || []).length === 1, JSON.stringify(bySlug.body?.data));
    check("…with the user's email", bySlug.body?.data?.grants?.[0]?.email === client.email);
    check("…and who granted it", bySlug.body?.data?.grants?.[0]?.grantedByEmail === sa.email);

    const byUser = await api(`/admin/template-grants/user/${client._id}`, {}, saT);
    check("per-user list returns the grant", (byUser.body?.data?.grants || []).length === 1, JSON.stringify(byUser.body?.data));
    check("…and marks the slug known", byUser.body?.data?.grants?.[0]?.known === true);

    const counts = await api("/admin/template-grants", {}, saT);
    check("counts report one for the slug", counts.body?.data?.counts?.[SLUG] === 1, JSON.stringify(counts.body?.data?.counts));

    // `user` is a valid slug shape — the per-user route must not be swallowed.
    check("the /user/:id route is not shadowed by /:slug",
      byUser.body?.data?.userId === String(client._id), JSON.stringify(byUser.body?.data));
  }

  console.log("\n── revoke ──");
  {
    const r = await api(`/admin/template-grants/${SLUG}/${client._id}`, { method: "DELETE" }, saT);
    check("super admin revoked", r.status === 200, JSON.stringify(r.body));

    const again = await api(`/admin/template-grants/${SLUG}/${client._id}`, { method: "DELETE" }, saT);
    check("revoking a grant that is gone 404s", again.status === 404, `got ${again.status}`);

    const me = await api("/auth/me", {}, clientT);
    check("/auth/me no longer lists it", !(me.body?.data?.earlyAccess || []).includes(SLUG), JSON.stringify(me.body?.data?.earlyAccess));

    const create = await api(BASEPATH, { method: "POST", body: JSON.stringify({ senderName: "S", recipientName: "R" }) }, clientT);
    check("the client is refused again", create.status === 403, `got ${create.status}`);
  }

  console.log("\n── already-published pages survive all of it ──");
  {
    // The whole reason the gate guards writes only: a page somebody has already
    // sent must keep opening while its template is hidden.
    const live = await HoliPage.findOne({ isPublished: true });
    check("a published page exists to check", !!live);
    if (live) {
      const shared = await api(`${BASEPATH}/share/${live.shareId}`);
      check("its share route still answers while hidden", shared.status === 200, `got ${shared.status}`);
    }
  }

  console.log("\n── the audit trail ──");
  {
    const AdminAuditLog = require("../dist/models/AdminAuditLog").default;
    const granted = await AdminAuditLog.find({ action: "template.grant_access" }).lean();
    const revoked = await AdminAuditLog.find({ action: "template.revoke_access" }).lean();
    check("grants are audited", granted.length >= 1, `found ${granted.length}`);
    check("revokes are audited", revoked.length === 1, `found ${revoked.length}`);
    check("the audit names the actor", granted.every((e) => e.actorEmail === sa.email));
    check("the audit names the target user", granted.some((e) => e.targetUserEmail === client.email));
    check("the audit names the template", granted.some((e) => e.targetTemplateType === SLUG));
  }

  console.log(`\n── ${pass} passed, ${fail} failed ──`);
  if (fail) console.log("failed:\n  " + failures.join("\n  "));
  console.log();
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
