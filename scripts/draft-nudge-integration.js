/**
 * Integration checks for /admin/drafts and the draft follow-up email.
 *
 * DROPS THE DATABASE it points at. Only ever aim it at a scratch one.
 *
 *   1. cp .env .env.satest   —  then BLANK both RESEND_API_KEY and the SES keys
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/draft-nudge-integration.js
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * This feature sends UNSOLICITED email, in the company's name, about somebody's
 * private unfinished document. Four properties matter more than the rest, and
 * they are what this asserts:
 *
 *   · Super admin only, on all four routes. An `admin` token getting in is a
 *     finding.
 *   · Generating never sends and never records. Sending never needs the model.
 *   · The anti-spam guards actually refuse: one follow-up per draft, one per
 *     person per week, and both overridable only on purpose.
 *   · A page that has since been published cannot be followed up on. Telling
 *     somebody "you never published this" minutes after they did is the worst
 *     single failure available here.
 */

require("dotenv").config({ path: "./.env.satest" });
process.env.APP_ENV = "local";
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

// Sending goes through SES. With no SES credentials the transport logs and
// reports "skipped", and the route answers 503 — which is what this script
// asserts against. With real credentials it would put mail in real inboxes.
if (process.env.SES_ACCESS_KEY_ID || process.env.SES_SECRET_ACCESS_KEY) {
  console.error(
    "\n✗ SES credentials are set in .env.satest.\n\n" +
    "  This script calls the send route. Blank SES_ACCESS_KEY_ID and\n" +
    "  SES_SECRET_ACCESS_KEY before running, or set\n" +
    "  DRAFT_ALLOW_REAL_EMAIL=1 if you genuinely mean to send.\n"
  );
  if (process.env.DRAFT_ALLOW_REAL_EMAIL !== "1") process.exit(1);
}

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
  const RakhiPage = require("../dist/models/RakshaBandhanPage").default;
  const PaymentOrder = require("../dist/models/PaymentOrder").default;
  const DraftNudge = require("../dist/models/DraftNudge").default;
  const TemplatePricing = require("../dist/models/TemplatePricing").default;
  const AdminAuditLog = require("../dist/models/AdminAuditLog").default;
  const { invalidatePricingCache } = require("../dist/config/templatePricing");

  const creator = await User.create({ email: "creator@test.invalid", name: "Priya Sharma", provider: "local", password: "x1234567" });
  const admin   = await User.create({ email: "admin@test.invalid",   name: "Admin", provider: "local", password: "x1234567", role: "admin" });
  const su      = await User.create({ email: "su@test.invalid",      name: "Super", provider: "local", password: "x1234567", role: "superadmin" });

  const CREATOR = tok(String(creator._id), creator.email);
  const ADMIN   = tok(String(admin._id), admin.email);
  const SUPER   = tok(String(su._id), su.email);

  // Price holi so one draft is genuinely price-blocked.
  await TemplatePricing.create({ slug: "holi", isFree: false, finalPricePaise: 9900, discountPercent: 80 });
  invalidatePricingCache();

  // A paid draft where checkout was opened and abandoned.
  const paidDraft = await HoliPage.create({
    userId: creator._id, senderName: "Priya", recipientName: "Rohit",
    message: "Wishing you all the colours this year, bhai", isPublished: false,
  });
  await PaymentOrder.create({
    userId: creator._id, templateType: "holi", pageId: paidDraft._id,
    amount: 9900, status: "created",
  });

  // A free draft, barely begun.
  const freeDraft = await RakhiPage.create({
    userId: creator._id, senderName: "Priya", isPublished: false,
  });

  // A published page, which must never appear.
  const published = await HoliPage.create({
    userId: creator._id, senderName: "Priya", recipientName: "X",
    isPublished: true, shareId: "already-live",
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── every route is SUPER-admin only ──");
  const routes = [
    ["GET",  "/admin/drafts", null],
    ["GET",  `/admin/drafts/holi/${paidDraft._id}`, null],
    ["POST", `/admin/drafts/holi/${paidDraft._id}/draft-email`, null],
    ["POST", `/admin/drafts/holi/${paidDraft._id}/send`, { subject: "s", body: "x".repeat(60) }],
  ];
  for (const [method, path, payload] of routes) {
    const opts = { method, ...(payload ? { body: JSON.stringify(payload) } : {}) };
    const label = path.replace(String(paidDraft._id), ":id");
    check(`${method} ${label} — anonymous 401`, (await api(path, opts, null)).status === 401);
    check(`${method} ${label} — creator 403`,   (await api(path, opts, CREATOR)).status === 403);
    check(`${method} ${label} — plain admin 403`, (await api(path, opts, ADMIN)).status === 403);
  }

  console.log("\n── the list ──");
  const list = await api("/admin/drafts?limit=50", {}, SUPER);
  check("a super admin may read it", list.status === 200 && list.body.success);
  const ids = list.body.data.items.map((i) => i.pageId);
  check("the paid draft is listed", ids.includes(String(paidDraft._id)));
  check("the free draft is listed", ids.includes(String(freeDraft._id)));
  // The single most important exclusion.
  check("the PUBLISHED page is NOT listed", !ids.includes(String(published._id)));
  check("it reports whether SES is configured", typeof list.body.data.sesConfigured === "boolean");
  check("it offers the template list for filtering", Array.isArray(list.body.data.templates) && list.body.data.templates.length > 40);

  console.log("\n── the reason is computed, not guessed ──");
  const paidRow = list.body.data.items.find((i) => i.pageId === String(paidDraft._id));
  check("an abandoned checkout is named as such", paidRow && paidRow.reason === "paywall_abandoned");
  check("it is marked as blocked by price", paidRow && paidRow.blockedByPrice === true);
  check("the price is carried through", paidRow && paidRow.finalPricePaise === 9900);
  check("the detail line names the rupee amount", paidRow && /₹99/.test(paidRow.reasonDetail));

  const freeRow = list.body.data.items.find((i) => i.pageId === String(freeDraft._id));
  check("a barely-started free draft is not blamed on price", freeRow && freeRow.blockedByPrice === false);
  check("it is classified by progress instead", freeRow && ["just_started", "unfinished"].includes(freeRow.reason));

  console.log("\n── the summary never carries their writing ──");
  const asText = JSON.stringify(list.body.data.items);
  check("the draft's message text is absent from the list",
    !asText.includes("Wishing you all the colours"));
  check("the recipient's name is absent from the list", !asText.includes("Rohit"));
  check("but progress IS reported", paidRow && typeof paidRow.completeness === "number" && paidRow.wordCount > 0);

  console.log("\n── filters ──");
  const priced = await api("/admin/drafts?filter=price-blocked&limit=50", {}, SUPER);
  check("price-blocked returns only price-blocked rows",
    priced.body.data.items.length > 0 && priced.body.data.items.every((i) => i.blockedByPrice));
  const free = await api("/admin/drafts?filter=free-stalled&limit=50", {}, SUPER);
  check("free-stalled returns only the rest",
    free.body.data.items.length > 0 && free.body.data.items.every((i) => !i.blockedByPrice));
  const byTemplate = await api("/admin/drafts?templateType=holi&limit=50", {}, SUPER);
  check("filtering by template narrows to it",
    byTemplate.body.data.items.every((i) => i.templateType === "holi"));
  check("an unknown template is a 400",
    (await api("/admin/drafts?templateType=nope", {}, SUPER)).status === 400);
  const searched = await api("/admin/drafts?search=creator@test.invalid&limit=50", {}, SUPER);
  check("search by email finds the rows", searched.body.data.items.length >= 2);

  console.log("\n── detail ──");
  const detail = await api(`/admin/drafts/holi/${paidDraft._id}`, {}, SUPER);
  check("detail loads", detail.status === 200 && detail.body.success);
  check("it carries the verdict", detail.body.data.verdict.reason === "paywall_abandoned");
  check("it carries the creator's email", detail.body.data.user.email === "creator@test.invalid");
  check("it names the From address", detail.body.data.fromEmail === "feedback@subhsandesh.in");
  check("it does not include the draft body",
    !JSON.stringify(detail.body.data).includes("Wishing you all the colours"));
  check("an unknown template is 404",
    (await api(`/admin/drafts/nope/${paidDraft._id}`, {}, SUPER)).status === 404);
  check("a bad pageId is 400",
    (await api("/admin/drafts/holi/not-an-id", {}, SUPER)).status === 400);
  check("an unknown pageId is 404",
    (await api(`/admin/drafts/holi/${new mongoose.Types.ObjectId()}`, {}, SUPER)).status === 404);

  console.log("\n── a page that has since been published cannot be nudged ──");
  for (const [method, suffix] of [["GET", ""], ["POST", "/draft-email"], ["POST", "/send"]]) {
    const r = await api(`/admin/drafts/holi/${published._id}${suffix}`, {
      method,
      ...(suffix === "/send" ? { body: JSON.stringify({ subject: "s", body: "x".repeat(60) }) } : {}),
    }, SUPER);
    check(`${method} …/${published._id}${suffix} answers 409`.replace(String(published._id), ":published"), r.status === 409,
      `got ${r.status}`);
  }

  console.log("\n── generating never sends and never records ──");
  const beforeNudges = await DraftNudge.countDocuments({});
  const gen = await api(`/admin/drafts/holi/${paidDraft._id}/draft-email`, { method: "POST" }, SUPER);
  check("the draft route answered 200, 422 or 503 (never 500)",
    [200, 422, 503].includes(gen.status), `got ${gen.status} ${JSON.stringify(gen.body)}`);
  if (gen.status === 200) {
    check("a subject and body came back", Boolean(gen.body.data.subject && gen.body.data.body));
    check("the body is long enough to send", gen.body.data.body.length >= 40);
    // The rule the whole feature turns on.
    check("the generated email promises nothing",
      !/discount|coupon|promo\s*code|refund|% ?off|free of charge|waive/i.test(
        `${gen.body.data.subject} ${gen.body.data.body}`
      ), gen.body.data.body);
  } else {
    console.log(`    (no OPENAI_API_KEY, or the draft was refused — output not asserted)`);
  }
  check("generating recorded nothing", (await DraftNudge.countDocuments({})) === beforeNudges);

  console.log("\n── sending: validation ──");
  const send = (payload) =>
    api(`/admin/drafts/holi/${paidDraft._id}/send`, { method: "POST", body: JSON.stringify(payload) }, SUPER);
  check("no subject is refused", (await send({ body: "x".repeat(60) })).status === 400);
  check("a too-short body is refused", (await send({ subject: "Hi", body: "short" })).status === 400);

  console.log("\n── sending with SES unconfigured is a clear 503, not a silent success ──");
  const attempt = await send({ subject: "About your Holi page", body: "y".repeat(80) });
  const sesOff = !process.env.SES_ACCESS_KEY_ID;
  if (sesOff) {
    check("it answers 503", attempt.status === 503, `got ${attempt.status}`);
    check("it names SES as the cause", /SES/i.test(attempt.body?.error || ""));
    check("and nothing was recorded as sent", (await DraftNudge.countDocuments({})) === 0);
  } else {
    check("it answers 200 with SES configured", attempt.status === 200);
  }

  console.log("\n── the guards refuse, and only an override gets past ──");
  // Simulate a follow-up already sent, so the guards can be tested without SES.
  await DraftNudge.create({
    userId: creator._id, userName: "Priya Sharma", userEmail: "creator@test.invalid",
    templateType: "holi", templateLabel: "Holi", pageId: paidDraft._id,
    stallReason: "paywall_abandoned", completeness: 40,
    subject: "earlier", body: "an earlier follow-up", sentAt: new Date(),
    sentByEmail: "su@test.invalid",
  });

  const dup = await send({ subject: "Again", body: "z".repeat(80) });
  check("a second follow-up on the same draft is refused", dup.status === 409);
  check("and it says why", dup.body?.code === "ALREADY_CONTACTED", JSON.stringify(dup.body));

  const other = await api(`/admin/drafts/raksha-bandhan/${freeDraft._id}/send`, {
    method: "POST", body: JSON.stringify({ subject: "Other draft", body: "w".repeat(80) }),
  }, SUPER);
  check("a different draft for the same person hits the weekly cooldown", other.status === 409);
  check("and the cooldown says so", other.body?.code === "USER_COOLDOWN", JSON.stringify(other.body));

  // Force must get past the guard and then be stopped only by SES being absent.
  const forced = await api(`/admin/drafts/raksha-bandhan/${freeDraft._id}/send`, {
    method: "POST", body: JSON.stringify({ subject: "Other draft", body: "w".repeat(80), force: true }),
  }, SUPER);
  check("force gets past the cooldown", forced.status !== 409, `got ${forced.status}`);
  if (sesOff) check("and then stops at SES being unconfigured", forced.status === 503);

  console.log("\n── the detail route reports the guard state to the panel ──");
  const detail2 = await api(`/admin/drafts/holi/${paidDraft._id}`, {}, SUPER);
  check("it reports the earlier follow-up", Boolean(detail2.body.data.alreadyContacted));
  check("it carries that email's subject", detail2.body.data.alreadyContacted.subject === "earlier");
  const detail3 = await api(`/admin/drafts/raksha-bandhan/${freeDraft._id}`, {}, SUPER);
  check("it reports the cooldown on a different draft", Boolean(detail3.body.data.cooldown));

  console.log("\n── the list marks contacted rows ──");
  const list2 = await api("/admin/drafts?limit=50", {}, SUPER);
  const marked = list2.body.data.items.find((i) => i.pageId === String(paidDraft._id));
  check("the contacted draft carries its sent date", Boolean(marked && marked.nudgedAt));
  const notContacted = await api("/admin/drafts?filter=not-contacted&limit=50", {}, SUPER);
  check("the not-contacted filter excludes it",
    !notContacted.body.data.items.some((i) => i.pageId === String(paidDraft._id)));

  console.log("\n── audit ──");
  // Only a real send writes an audit entry; with SES off there should be none,
  // which is itself the assertion that nothing was quietly recorded as sent.
  const audits = await AdminAuditLog.countDocuments({ action: "draft.followup_sent" });
  if (sesOff) check("no audit entry was written, because nothing was sent", audits === 0);
  else check("a send wrote an audit entry", audits >= 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log("failed:\n  " + failures.join("\n  "));
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
