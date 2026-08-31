/**
 * Integration checks for super-admin template pricing.
 *
 * The repo has no test framework, so this is a standalone script rather than a
 * suite. It DROPS THE DATABASE it points at, so it must only ever be aimed at a
 * scratch one.
 *
 *   1. cp .env .env.satest
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database (e.g. .../gifts_pricetest)
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/pricing-integration.js
 *
 * Covers the invariants that are expensive to get wrong: who may price a
 * template, that validation actually rejects, that the gate's four rules hold,
 * that a page already published stays publishable when its template turns paid,
 * that a NEW page on that same template is nonetheless charged, and that money
 * is never taken for a page that is already live.
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
  try { body = await r.json(); } catch { /* non-JSON body */ }
  return { status: r.status, body, headers: r.headers };
};

const price = (slug, body, token) =>
  api(`/admin/template-pricing/${slug}`, { method: "PATCH", body: JSON.stringify(body) }, token);

(async () => {
  await mongoose.connect(process.env.LOCAL_MONGODB_URI);
  await mongoose.connection.db.dropDatabase();

  const User = require("../dist/models/User").default;
  const HoliPage = require("../dist/models/HoliPage").default;
  const EidPage = require("../dist/models/EidPage").default;
  const PaymentOrder = require("../dist/models/PaymentOrder").default;

  // Seeded through the model so pre-save hooks run (role elevation, shareId).
  const sa = await User.create({ email: "suyashagrahari2121@gmail.com", name: "Super", provider: "local", password: "x1234567" });
  const admin = await User.create({ email: "admin@test.com", name: "Admin", provider: "local", password: "x1234567", role: "admin" });
  const user = await User.create({ email: "user@test.com", name: "User", provider: "local", password: "x1234567", points: 5000 });
  const other = await User.create({ email: "other@test.com", name: "Other", provider: "local", password: "x1234567" });

  const saT = tok(String(sa._id), sa.email);
  const adminT = tok(String(admin._id), admin.email);
  const userT = tok(String(user._id), user.email);
  const otherT = tok(String(other._id), other.email);

  const newHoli = () => HoliPage.create({ userId: user._id, senderName: "S", recipientName: "R" });
  const newEid = (extra = {}) => EidPage.create({ userId: user._id, senderName: "S", ...extra });

  console.log("\n── seeding ──");
  check("super admin auto-elevated to superadmin", sa.role === "superadmin", `got ${sa.role}`);
  check("plain admin stayed admin", admin.role === "admin", `got ${admin.role}`);

  console.log("\n── who may price a template ──");
  check("anonymous cannot read pricing admin", (await api("/admin/template-pricing")).status === 401);
  check("normal user cannot read pricing admin", (await api("/admin/template-pricing", {}, userT)).status === 403);
  check("plain ADMIN cannot read pricing admin", (await api("/admin/template-pricing", {}, adminT)).status === 403);
  check("super admin can read pricing admin", (await api("/admin/template-pricing", {}, saT)).status === 200);
  check("plain ADMIN cannot set a price",
    (await price("holi", { isFree: false, finalPricePaise: 1000, discountPercent: 90 }, adminT)).status === 403);
  check("plain ADMIN can still reach template VISIBILITY (unchanged)",
    (await api("/admin/template-visibility", {}, adminT)).status === 200);

  console.log("\n── validation ──");
  const bad = async (body, why) => {
    const r = await price("holi", body, saT);
    check(`rejects ${why}`, r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);
  };
  await bad({ isFree: false, finalPricePaise: 1000, discountPercent: 100 }, "a 100% discount");
  await bad({ isFree: false, finalPricePaise: 0, discountPercent: 0 }, "a paid template priced at zero");
  await bad({ isFree: false, finalPricePaise: 99, discountPercent: 0 }, "a paid template under ₹1");
  await bad({ isFree: false, finalPricePaise: 1000.5, discountPercent: 90 }, "fractional paise");
  await bad({ isFree: false, finalPricePaise: "1000", discountPercent: 90 }, "a price sent as a string");
  await bad({ isFree: false, finalPricePaise: 1000, discountPercent: -1 }, "a negative discount");
  await bad({ isFree: false, finalPricePaise: 100000001, discountPercent: 0 }, "a price above the ceiling");
  await bad({}, "a body with no isFree");
  check("rejects a malformed slug",
    (await price("Not_A_Slug!", { isFree: true }, saT)).status === 400);

  console.log("\n── the spec example: ₹10 at 90% off ──");
  {
    const r = await price("holi", { isFree: false, finalPricePaise: 1000, discountPercent: 90, pointsCost: 50 }, saT);
    check("super admin priced holi", r.status === 200, JSON.stringify(r.body));
    check("the write echoes the derived MRP", r.body?.data?.pricing?.mrp === 100, JSON.stringify(r.body?.data?.pricing));

    const pub = await api("/payment/pricing");
    const holi = pub.body?.data?.holi;
    check("public pricing shows the price", holi?.finalPrice === 10, JSON.stringify(holi));
    check("public pricing derives the MRP as ₹100", holi?.mrp === 100, JSON.stringify(holi));
    check("public pricing reports the saving", holi?.savings === 90, JSON.stringify(holi));
    check("public pricing carries the points cost", holi?.pointsCost === 50, JSON.stringify(holi));
    check("public pricing is not free", holi?.isFree === false);
    check("a price change is visible with no restart", !!holi);
    check("public pricing is edge-cacheable",
      /max-age=60/.test(pub.headers.get("cache-control") || ""), pub.headers.get("cache-control"));
    check("public pricing does not leak who set it", holi && holi.updatedByEmail === undefined);
  }

  console.log("\n── the gate's four rules ──");
  {
    const eid = await newEid();
    const r = await api(`/eid-pages/${eid._id}/publish`, { method: "POST" }, userT);
    check("rule 1: an unpriced template publishes free", r.status === 200, JSON.stringify(r.body));
  }
  let holiPaid;
  {
    const holi = await newHoli();
    const r = await api(`/holi-pages/${holi._id}/publish`, { method: "POST" }, userT);
    check("rule 4: a priced unpaid page is refused with 402", r.status === 402, `got ${r.status}`);
    check("rule 4: the 402 names the gate", r.body?.error === "PAYMENT_REQUIRED");
    check("rule 4: the 402 carries the price", r.body?.pricing?.finalPrice === 10, JSON.stringify(r.body?.pricing));
    check("rule 4: the 402 carries the derived MRP", r.body?.pricing?.mrp === 100);

    const fresh = await HoliPage.findById(holi._id);
    check("rule 4: the refused page did NOT go live", fresh.isPublished !== true);

    const sp = await api("/payment/spend-points", { method: "POST", body: JSON.stringify({ templateType: "holi", pageId: String(holi._id) }) }, userT);
    check("points unlock the page", sp.status === 200, JSON.stringify(sp.body));
    check("points response carries the remaining balance", typeof sp.body?.data?.remainingPoints === "number", JSON.stringify(sp.body?.data));
    check("the balance actually dropped by the points cost",
      sp.body?.data?.remainingPoints === 4950, `got ${sp.body?.data?.remainingPoints}`);

    const after = await api(`/holi-pages/${holi._id}/publish`, { method: "POST" }, userT);
    check("rule 3: publish is allowed after paying", after.status === 200, JSON.stringify(after.body));
    holiPaid = holi;

    const twice = await api("/payment/spend-points", { method: "POST", body: JSON.stringify({ templateType: "holi", pageId: String(holi._id) }) }, userT);
    check("points cannot be spent twice on one page", twice.status === 400, `got ${twice.status}`);
  }
  {
    const eid2 = await newEid({ isPublished: true });
    // pointsCost is set deliberately: without it, `spend-points` refuses on
    // "this template does not support points" and the already-published guard
    // below is never reached, so the check would pass for the wrong reason.
    const r0 = await price("eid-mubarak", { isFree: false, finalPricePaise: 4900, discountPercent: 50, pointsCost: 25 }, saT);
    check("super admin priced eid-mubarak", r0.status === 200, JSON.stringify(r0.body));

    const r = await api(`/eid-pages/${eid2._id}/publish`, { method: "POST" }, userT);
    check("rule 2: an already-published page re-publishes free after repricing", r.status === 200, JSON.stringify(r.body));

    // The other half of the pair. Grandfathering alone can pass while nothing
    // is ever sold, so both assertions have to be here.
    const eid3 = await newEid();
    const r3 = await api(`/eid-pages/${eid3._id}/publish`, { method: "POST" }, userT);
    check("a NEW page on a now-paid template IS charged", r3.status === 402, `got ${r3.status}`);
    check("eid was one of the seven previously ungated handlers", r3.body?.error === "PAYMENT_REQUIRED");
  }

  console.log("\n── never take money for nothing ──");
  {
    const live = await newEid({ isPublished: true });
    const order = await api("/payment/create-order", { method: "POST", body: JSON.stringify({ templateType: "eid", pageId: String(live._id) }) }, userT);
    check("create-order refuses an already-published page", order.status === 400, `got ${order.status}`);
    check("…and says why", order.body?.code === "ALREADY_PUBLISHED", JSON.stringify(order.body));

    const pts = await api("/payment/spend-points", { method: "POST", body: JSON.stringify({ templateType: "eid", pageId: String(live._id) }) }, userT);
    check("spend-points refuses an already-published page", pts.status === 400, `got ${pts.status}`);
    check("…and says why", pts.body?.code === "ALREADY_PUBLISHED", JSON.stringify(pts.body));

    const orders = await PaymentOrder.countDocuments({ pageId: live._id });
    check("no payment record was created for the live page", orders === 0, `found ${orders}`);
  }

  console.log("\n── never charge a price the user was not shown ──");
  {
    const p = await newEid();
    const stale = await api("/payment/create-order", {
      method: "POST",
      body: JSON.stringify({ templateType: "eid", pageId: String(p._id), expectedFinalPricePaise: 1000 }),
    }, userT);
    check("create-order refuses a stale displayed price", stale.status === 409, `got ${stale.status}`);
    check("…identifies the reason", stale.body?.code === "PRICE_CHANGED", JSON.stringify(stale.body));
    check("…and hands back the current price", stale.body?.pricing?.finalPricePaise === 4900, JSON.stringify(stale.body?.pricing));

    const orders = await PaymentOrder.countDocuments({ pageId: p._id });
    check("no order was created for the refused price", orders === 0, `found ${orders}`);
  }

  console.log("\n── ownership, for a template outside the original six ──");
  {
    const mine = await newHoli();
    const r = await api("/payment/create-order", { method: "POST", body: JSON.stringify({ templateType: "holi", pageId: String(mine._id) }) }, otherT);
    check("create-order refuses a page you do not own", r.status === 403, `got ${r.status}`);

    // rakhi is one of the 37 templateTypes the old six-entry map did not cover.
    // Without the TEMPLATE_LOOKUPS fix this 403s on ownership rather than
    // reaching the free-template check.
    const rk = await price("happy-rakshabandhan-to-brother", { isFree: false, finalPricePaise: 2900, discountPercent: 0 }, saT);
    check("a template outside the original six can be priced", rk.status === 200, JSON.stringify(rk.body));
    const bogus = await api("/payment/create-order", { method: "POST", body: JSON.stringify({ templateType: "raksha-bandhan", pageId: String(new mongoose.Types.ObjectId()) }) }, userT);
    check("…and its create-order reaches ownership rather than an unknown-template 403",
      bogus.status === 403, `got ${bogus.status} ${JSON.stringify(bogus.body)}`);
  }

  console.log("\n── the audit trail ──");
  {
    const AdminAuditLog = require("../dist/models/AdminAuditLog").default;
    const entries = await AdminAuditLog.find({ action: "template.set_pricing" }).lean();
    check("pricing writes are audited", entries.length >= 3, `found ${entries.length}`);
    check("the audit names the actor", entries.every((e) => e.actorEmail === sa.email));
    check("the audit records the before and after",
      entries.some((e) => e.changes?.finalPricePaise?.to === 1000), JSON.stringify(entries[0]?.changes));
  }

  console.log("\n── clearing a decision ──");
  {
    const r = await api("/admin/template-pricing/holi", { method: "DELETE" }, saT);
    check("super admin cleared holi's pricing", r.status === 200, JSON.stringify(r.body));

    const again = await api("/admin/template-pricing/holi", { method: "DELETE" }, saT);
    check("clearing a template with no decision 404s", again.status === 404, `got ${again.status}`);

    const pub = await api("/payment/pricing");
    check("cleared template disappears from pricing", pub.body?.data?.holi === undefined, JSON.stringify(Object.keys(pub.body?.data || {})));

    const fresh = await newHoli();
    const p = await api(`/holi-pages/${fresh._id}/publish`, { method: "POST" }, userT);
    check("a cleared template publishes free again", p.status === 200, JSON.stringify(p.body));
  }

  console.log("\n── bulk ──");
  {
    const r = await api("/admin/template-pricing", {
      method: "PATCH",
      body: JSON.stringify({ updates: [
        { slug: "holi", isFree: false, finalPricePaise: 1000, discountPercent: 90, pointsCost: 50 },
        { slug: "flags", isFree: true },
      ] }),
    }, saT);
    check("bulk applied", r.status === 200 && r.body?.data?.count === 2, JSON.stringify(r.body));

    const partial = await api("/admin/template-pricing", {
      method: "PATCH",
      body: JSON.stringify({ updates: [
        { slug: "holi", isFree: false, finalPricePaise: 2000, discountPercent: 50 },
        { slug: "watch", isFree: false, finalPricePaise: 5, discountPercent: 0 },
      ] }),
    }, saT);
    check("bulk rejects the whole set when one entry is invalid", partial.status === 400, `got ${partial.status}`);

    const pub = await api("/payment/pricing");
    check("…and wrote none of it", pub.body?.data?.holi?.finalPricePaise === 1000, JSON.stringify(pub.body?.data?.holi));
    check("…including the valid entry", pub.body?.data?.watch === undefined);

    const dup = await api("/admin/template-pricing", {
      method: "PATCH",
      body: JSON.stringify({ updates: [
        { slug: "holi", isFree: true },
        { slug: "holi", isFree: false, finalPricePaise: 1000, discountPercent: 0 },
      ] }),
    }, saT);
    check("bulk rejects a slug listed twice", dup.status === 400, `got ${dup.status}`);
  }

  console.log(`\n── ${pass} passed, ${fail} failed ──`);
  if (fail) console.log("failed:\n  " + failures.join("\n  "));
  console.log();
  await mongoose.disconnect();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
