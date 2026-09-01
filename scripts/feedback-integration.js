/**
 * Integration checks for post-publish feedback and the super-admin reply panel.
 *
 * The repo has no test framework, so this is a standalone script rather than a
 * suite. It DROPS THE DATABASE it points at, so it must only ever be aimed at a
 * scratch one.
 *
 *   1. cp .env .env.satest
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database (e.g. .../gifts_fbtest)
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/feedback-integration.js
 *
 * ── WHAT THIS IS ACTUALLY FOR ───────────────────────────────────────────────
 *
 * Two properties, and they are the two that would cost real money or real
 * embarrassment if they broke:
 *
 *   · The tier gate. Reading a hundred customers' unfiltered opinions, and
 *     emailing them as SubhSandesh, must be super-admin only. An `admin` token
 *     reaching any of these routes is a finding, not a nitpick.
 *   · Generating and sending are separate acts. `draft-reply` must not send and
 *     must not change the ticket's status; `reply` must not need the model. If
 *     those ever fuse, a machine-written email goes to a customer unread.
 *
 * The draft route itself is exercised only for its GATE here, not its output:
 * calling it for real costs an OpenAI request per run and returns different
 * text every time. Its parsing and prompt-fencing rules are unit-tested in
 * src/services/feedbackReply.test.ts, which needs no key and no network.
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
  const PageFeedback = require("../dist/models/PageFeedback").default;
  const AdminAuditLog = require("../dist/models/AdminAuditLog").default;

  const creator = await User.create({ email: "creator@test.com", name: "Priya Sharma", provider: "local", password: "x1234567" });
  const other   = await User.create({ email: "other@test.com",   name: "Other",        provider: "local", password: "x1234567" });
  const admin   = await User.create({ email: "admin@test.com",   name: "Admin",        provider: "local", password: "x1234567", role: "admin" });
  const suFor   = await User.create({ email: "su@test.com",      name: "Super",        provider: "local", password: "x1234567", role: "superadmin" });

  const CREATOR = tok(String(creator._id), creator.email);
  const OTHER   = tok(String(other._id),   other.email);
  const ADMIN   = tok(String(admin._id),   admin.email);
  const SUPER   = tok(String(suFor._id),   suFor.email);

  const URL_A = "https://priya.subhsandesh.in/abc123";
  const URL_B = "https://priya.subhsandesh.in/def456";

  const submit = (payload, t = CREATOR) =>
    api("/feedback", { method: "POST", body: JSON.stringify(payload) }, t);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── submitting: who may ──");
  check("anonymous is refused", (await submit({ rating: 5 }, null)).status === 401);
  check("a signed-in creator may", (await submit({ rating: 5, pageUrl: URL_A, templateSlug: "holi" })).status === 201);

  console.log("\n── submitting: validation ──");
  check("no rating is refused",       (await submit({ pageUrl: URL_B })).status === 400);
  check("rating 0 is refused",        (await submit({ rating: 0, pageUrl: URL_B })).status === 400);
  check("rating 6 is refused",        (await submit({ rating: 6, pageUrl: URL_B })).status === 400);
  check("a fractional rating is refused", (await submit({ rating: 4.5, pageUrl: URL_B })).status === 400);
  check("a string rating is refused", (await submit({ rating: "five", pageUrl: URL_B })).status === 400);

  console.log("\n── one row per page, and edits land on it ──");
  const first = await PageFeedback.findOne({ pageUrl: URL_A });
  check("the first submission stored the rating", first && first.rating === 5);
  check("identity came from the session, not the payload",
    first && first.userEmail === "creator@test.com" && first.userName === "Priya Sharma");

  // Re-submitting the same page is an EDIT, not a duplicate. This is the case
  // that fires when somebody clears their browser storage or publishes the same
  // page from a second device.
  await submit({ rating: 2, comment: "the photos took forever", pageUrl: URL_A, templateSlug: "holi" });
  const afterEdit = await PageFeedback.find({ userId: creator._id, pageUrl: URL_A });
  check("re-submitting did not create a second row", afterEdit.length === 1);
  check("re-submitting updated the rating", afterEdit[0].rating === 2);
  check("re-submitting stored the new comment", afterEdit[0].comment === "the photos took forever");

  // A DIFFERENT page must get its own row — the whole point of asking per page.
  await submit({ rating: 4, pageUrl: URL_B, templateSlug: "raksha-bandhan" });
  check("a different page is a separate row",
    (await PageFeedback.countDocuments({ userId: creator._id })) === 2);

  console.log("\n── the label is resolved server-side ──");
  const labelled = await PageFeedback.findOne({ pageUrl: URL_B });
  check("a known slug resolved to a human label", Boolean(labelled && labelled.templateLabel));
  // The client sends a slug; the label must never be taken from the request.
  await submit({ rating: 5, pageUrl: "https://x.subhsandesh.in/zzz", templateSlug: "holi", templateLabel: "FREE MONEY" });
  const spoofed = await PageFeedback.findOne({ pageUrl: "https://x.subhsandesh.in/zzz" });
  check("a client-supplied label is ignored", spoofed && spoofed.templateLabel !== "FREE MONEY");

  console.log("\n── a junk URL does not collapse two ratings into one row ──");
  await submit({ rating: 1, pageUrl: "not a url", templateSlug: "holi" }, OTHER);
  await submit({ rating: 3, pageUrl: "javascript:alert(1)", templateSlug: "eid" }, OTHER);
  const junkRows = await PageFeedback.find({ userId: other._id });
  check("both unusable-URL ratings survived as separate rows", junkRows.length === 2);
  check("neither stored the unusable URL", junkRows.every((r) => !r.pageUrl.startsWith("javascript:")));

  console.log("\n── comment length is capped, not rejected ──");
  await submit({ rating: 5, comment: "x".repeat(9000), pageUrl: "https://x.subhsandesh.in/long" });
  const long = await PageFeedback.findOne({ pageUrl: "https://x.subhsandesh.in/long" });
  check("a 9000-character comment was truncated to 2000", long && long.comment.length === 2000);

  // ────────────────────────────────────────────────────────────────────────────
  console.log("\n── the admin panel is SUPER-admin only ──");
  const id = String(first._id);
  const adminRoutes = [
    ["GET",    "/admin/feedback",                      null],
    ["PATCH",  `/admin/feedback/${id}/status`,         { status: "read" }],
    ["PATCH",  `/admin/feedback/${id}/notes`,          { adminNotes: "hi" }],
    ["POST",   `/admin/feedback/${id}/draft-reply`,    null],
    ["POST",   `/admin/feedback/${id}/reply`,          { subject: "s", body: "x".repeat(40) }],
    ["DELETE", `/admin/feedback/${id}`,                null],
  ];
  for (const [method, path, payload] of adminRoutes) {
    const opts = { method, ...(payload ? { body: JSON.stringify(payload) } : {}) };
    check(`${method} ${path.replace(id, ":id")} — anonymous 401`,
      (await api(path, opts, null)).status === 401);
    check(`${method} ${path.replace(id, ":id")} — creator 403`,
      (await api(path, opts, CREATOR)).status === 403);
    // The finding that matters: `admin` is not enough for this surface.
    check(`${method} ${path.replace(id, ":id")} — plain admin 403`,
      (await api(path, opts, ADMIN)).status === 403);
  }

  console.log("\n── the list and its summary ──");
  const list = await api("/admin/feedback?limit=50", {}, SUPER);
  check("a super admin may read the list", list.status === 200 && list.body.success);
  const total = await PageFeedback.countDocuments({});
  check("the list returns every row", list.body.data.items.length === total);
  check("the summary counts every row", list.body.data.stats.count === total);
  check("the summary carries a star histogram",
    list.body.data.stats.starCounts && typeof list.body.data.stats.starCounts["5"] === "number");
  check("the summary carries an average", typeof list.body.data.stats.avg === "number");
  check("templates are grouped for the panel", Array.isArray(list.body.data.templates));

  console.log("\n── the summary ignores the filter ──");
  // An average that moves when you click "1 star" is not a reading of anything.
  const filtered = await api("/admin/feedback?filter=negative&limit=50", {}, SUPER);
  check("filtering narrowed the rows", filtered.body.data.items.length < total);
  check("but not the average", filtered.body.data.stats.avg === list.body.data.stats.avg);
  check("and not the total", filtered.body.data.stats.count === total);
  check("every filtered row is 3 stars or below",
    filtered.body.data.items.every((i) => i.rating <= 3));

  const withWords = await api("/admin/feedback?filter=with-comment&limit=50", {}, SUPER);
  check("the with-words filter returns only rows that have words",
    withWords.body.data.items.length > 0 && withWords.body.data.items.every((i) => i.comment));

  console.log("\n── status ──");
  check("an unknown status is refused",
    (await api(`/admin/feedback/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "banana" }) }, SUPER)).status === 400);
  // "replied" is a consequence of sending, never an assertion — otherwise the
  // panel can show a reply that no email backs up.
  check("'replied' cannot be set by hand before anything was sent",
    (await api(`/admin/feedback/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "replied" }) }, SUPER)).status === 400);
  check("'read' is accepted",
    (await api(`/admin/feedback/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "read" }) }, SUPER)).status === 200);

  console.log("\n── replying: validation ──");
  const reply = (payload) =>
    api(`/admin/feedback/${id}/reply`, { method: "POST", body: JSON.stringify(payload) }, SUPER);
  check("no subject is refused",     (await reply({ body: "x".repeat(40) })).status === 400);
  check("a too-short body is refused", (await reply({ subject: "Hi", body: "thanks" })).status === 400);
  check("a bad id is a 400",
    (await api("/admin/feedback/not-an-id/reply", { method: "POST", body: JSON.stringify({ subject: "s", body: "x".repeat(40) }) }, SUPER)).status === 400);
  check("an unknown id is a 404",
    (await api(`/admin/feedback/${new mongoose.Types.ObjectId()}/reply`, { method: "POST", body: JSON.stringify({ subject: "s", body: "x".repeat(40) }) }, SUPER)).status === 404);

  console.log("\n── replying: the send ──");
  const sent = await reply({
    subject: "Sorry about the photo uploads\r\nBcc: attacker@example.com",
    body: "Hi Priya,\n\nThat upload wait is on us and we are looking at it.\n\n— Team SubhSandesh",
    aiAssisted: true,
  });
  check("the reply was accepted", sent.status === 200 && sent.body.success);
  const replied = await PageFeedback.findById(id);
  check("the reply was recorded", replied.replies.length === 1);
  // A CRLF in a subject is header injection. It must be gone, not merely trimmed.
  check("the subject was stripped of CRLF", !/[\r\n]/.test(replied.replies[0].subject));
  check("the status became 'replied'", replied.status === "replied");
  check("the sender was recorded", replied.replies[0].sentByEmail === "su@test.com");
  check("aiAssisted was recorded", replied.replies[0].aiAssisted === true);

  console.log("\n── replying is audited ──");
  const audits = await AdminAuditLog.find({ action: "feedback.reply_sent" });
  check("an audit entry was written", audits.length === 1);
  check("the audit names the actor", audits[0] && audits[0].actorEmail === "su@test.com");
  check("the audit names the recipient", audits[0] && audits[0].targetUserEmail === "creator@test.com");

  console.log("\n── 'replied' may now be un-set by hand, having been earned ──");
  check("setting it back to 'read' is allowed",
    (await api(`/admin/feedback/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "read" }) }, SUPER)).status === 200);
  check("re-asserting 'replied' is allowed once a reply exists",
    (await api(`/admin/feedback/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: "replied" }) }, SUPER)).status === 200);

  console.log("\n── an edit does not undo a reply already sent ──");
  await submit({ rating: 1, comment: "still slow", pageUrl: URL_A, templateSlug: "holi" });
  const afterReplyEdit = await PageFeedback.findById(id);
  check("the rating was updated", afterReplyEdit.rating === 1);
  check("but the status stayed 'replied'", afterReplyEdit.status === "replied");
  check("and the sent reply is still there", afterReplyEdit.replies.length === 1);

  console.log("\n── generating a draft never sends and never advances a ticket ──");
  const fresh = await PageFeedback.findOne({ pageUrl: URL_B });
  const freshId = String(fresh._id);
  const before = { status: fresh.status, replies: fresh.replies.length };
  const draft = await api(`/admin/feedback/${freshId}/draft-reply`, { method: "POST" }, SUPER);
  // 200 with a key, 503 without one. Either is a pass: what is being asserted
  // is that the route did not MAIL anything and did not touch the ticket.
  check("the draft route answered 200 or 503 (not 500)", [200, 503].includes(draft.status),
    `got ${draft.status} ${JSON.stringify(draft.body)}`);
  if (draft.status === 200) {
    check("a draft came back with a subject and a body",
      Boolean(draft.body.data && draft.body.data.subject && draft.body.data.body));
    check("the draft body is long enough to be a real email",
      draft.body.data.body.length >= 40);
  } else {
    console.log("    (no OPENAI_API_KEY in .env.satest — output not asserted)");
  }
  const afterDraft = await PageFeedback.findById(freshId);
  check("generating sent nothing", afterDraft.replies.length === before.replies);
  check("generating did not change the status", afterDraft.status === before.status);

  console.log("\n── notes are internal ──");
  const noted = await api(`/admin/feedback/${freshId}/notes`, { method: "PATCH", body: JSON.stringify({ adminNotes: "chase this" }) }, SUPER);
  check("notes save", noted.status === 200);
  check("notes are stored", (await PageFeedback.findById(freshId)).adminNotes === "chase this");
  await api(`/admin/feedback/${freshId}/notes`, { method: "PATCH", body: JSON.stringify({ adminNotes: "y".repeat(5000) }) }, SUPER);
  check("notes are capped at 2000", (await PageFeedback.findById(freshId)).adminNotes.length === 2000);

  console.log("\n── delete ──");
  check("a super admin may delete",
    (await api(`/admin/feedback/${freshId}`, { method: "DELETE" }, SUPER)).status === 200);
  check("the row is gone", (await PageFeedback.findById(freshId)) === null);
  check("deleting it again is a 404",
    (await api(`/admin/feedback/${freshId}`, { method: "DELETE" }, SUPER)).status === 404);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) console.log("failed:\n  " + failures.join("\n  "));
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
