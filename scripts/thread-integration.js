/**
 * Integration checks for two-way email threading.
 *
 * DROPS THE DATABASE it points at. Only ever aim it at a scratch one.
 *
 *   1. cp .env .env.satest  —  then BLANK RESEND_API_KEY and the SES keys
 *   2. in .env.satest set APP_ENV=local, LOCAL_PORT=5099, and point
 *      LOCAL_MONGODB_URI at a throwaway database
 *   3. npm run build
 *   4. DOTENV_CONFIG_PATH=./.env.satest node -r dotenv/config dist/server.js &
 *   5. node scripts/thread-integration.js
 *
 * RESTART THE API between this and `draft-nudge-integration.js`. Both drop the
 * database, but template pricing is cached IN THE SERVER PROCESS, and each
 * script only invalidates the cache in its own. Running them back to back
 * leaves the second one asserting against prices the server no longer has —
 * which shows up as six unrelated-looking price failures.
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 *
 * Threading is the kind of feature that appears to work while being wrong. The
 * database can hold a tidy conversation while every message actually arrived in
 * the recipient's inbox as a separate email, and nothing anywhere reports it.
 * The unit tests cover the header arithmetic; this covers the parts that need a
 * database and a running server:
 *
 *   · The inbound webhook is CLOSED by default. With no SES_INBOUND_TOKEN it
 *     must 404 everything — it is the one publicly reachable route here, and
 *     what it writes appears in the panel as a customer's own words.
 *   · Matching an arriving reply to a conversation, down all four rungs of the
 *     ladder in threadStore.service, against real indexes.
 *   · The conversation routes are super-admin only. They hold private
 *     correspondence, not general staff reading.
 *   · Pasting a reply in by hand is audited, because it puts words in somebody
 *     else's mouth.
 *   · threadMode is validated, and "same" with no conversation refuses rather
 *     than silently opening a new one.
 */

require("dotenv").config({ path: "./.env.satest" });
process.env.APP_ENV = "local";
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

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
  const EmailThread = require("../dist/models/EmailThread").default;
  const AdminAuditLog = require("../dist/models/AdminAuditLog").default;
  const {
    matchInboundThread,
    openThread,
    appendMessage,
    latestThreadForPage,
  } = require("../dist/services/threadStore.service");
  const { threadingHeadersFor, rfcMessageIdFor } = require("../dist/services/emailThread.service");

  const creator = await User.create({ email: "asha@test.invalid", name: "Asha Rao", provider: "local", password: "x1234567" });
  const other   = await User.create({ email: "vikram@test.invalid", name: "Vikram", provider: "local", password: "x1234567" });
  const admin   = await User.create({ email: "admin@test.invalid", name: "Admin", provider: "local", password: "x1234567", role: "admin" });
  const su      = await User.create({ email: "su@test.invalid", name: "Super", provider: "local", password: "x1234567", role: "superadmin" });

  const CREATOR = tok(String(creator._id), creator.email);
  const ADMIN   = tok(String(admin._id), admin.email);
  const SUPER   = tok(String(su._id), su.email);

  const draft = await HoliPage.create({
    userId: creator._id, senderName: "Asha", recipientName: "Meera",
    message: "Happy Holi", isPublished: false,
  });

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── the inbound webhook is CLOSED unless configured ──");
  //
  // The single most important property in this file. This route is reachable by
  // anybody who guesses the path, and what it stores is displayed to a super
  // admin as a named customer's own words.
  {
    const shapes = [
      ["no token segment", "/webhooks/ses-inbound/"],
      ["an empty-looking token", "/webhooks/ses-inbound/%20"],
      ["a guessed token", "/webhooks/ses-inbound/letmein"],
      ["a long random token", `/webhooks/ses-inbound/${"a".repeat(64)}`],
    ];
    for (const [name, path] of shapes) {
      const r = await fetch(BASE + path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ Type: "Notification", Message: "{}" }),
      });
      check(
        `refused with ${name} (${r.status})`,
        r.status === 404 || r.status === 403,
        `got ${r.status}`
      );
    }
    check(
      "SES_INBOUND_TOKEN is unset in this environment, so the above is the closed-by-default path",
      !process.env.SES_INBOUND_TOKEN
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── conversation routes are SUPER-admin only ──");
  {
    const thread = await openThread(
      {
        kind: "draft", userId: String(creator._id), userName: creator.name,
        userEmail: creator.email, pageId: String(draft._id),
        templateType: "holi", templateLabel: "Holi",
      },
      "Your Holi page"
    );
    const id = String(thread._id);

    for (const [name, path, method] of [
      ["GET /threads", "/admin/threads", "GET"],
      ["GET /threads/:id", `/admin/threads/${id}`, "GET"],
      ["PATCH /threads/:id", `/admin/threads/${id}`, "PATCH"],
      ["POST /threads/:id/inbound", `/admin/threads/${id}/inbound`, "POST"],
    ]) {
      const asUser = await api(path, { method, body: method === "GET" ? undefined : "{}" }, CREATOR);
      const asAdmin = await api(path, { method, body: method === "GET" ? undefined : "{}" }, ADMIN);
      const anon = await api(path, { method, body: method === "GET" ? undefined : "{}" });
      check(`${name} refuses a plain user`, asUser.status === 403 || asUser.status === 401, `got ${asUser.status}`);
      check(`${name} refuses an admin`, asAdmin.status === 403, `got ${asAdmin.status}`);
      check(`${name} refuses anonymous`, anon.status === 401, `got ${anon.status}`);
    }
  }

  await EmailThread.deleteMany({});

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── the outbound chain: reconstructed, then exact ──");
  let mainThreadId;
  {
    const thread = await openThread(
      {
        kind: "draft", userId: String(creator._id), userName: creator.name,
        userEmail: creator.email, pageId: String(draft._id),
        templateType: "holi", templateLabel: "Holi",
      },
      "Your Holi page"
    );
    mainThreadId = String(thread._id);
    check("the thread key names the page and the sequence", thread.threadKey === `draft:${draft._id}:1`, thread.threadKey);
    check("the subject is stored without any Re:", thread.subject === "Your Holi page", thread.subject);

    // Message one, as the send route records it.
    const ses1 = "010001a05d94a634-aaaa-000000";
    await appendMessage(thread._id, {
      direction: "outbound", subject: "Your Holi page", body: "Hi Asha, your page is still saved.",
      byEmail: "su@test.invalid", providerMessageId: ses1,
      rfcMessageId: rfcMessageIdFor(ses1, process.env.SES_REGION || "us-east-1"),
      rfcMessageIdSource: "reconstructed", source: "ses",
    });

    let fresh = await EmailThread.findById(thread._id).lean();
    let h = threadingHeadersFor(fresh.messages);
    check("a reply to message one is anchored to our reconstructed id", h.inReplyTo === `<${ses1}@email.amazonses.com>`, h.inReplyTo);
    check("and reports itself as reconstructed, not exact", h.confidence === "reconstructed", h.confidence);
    check("the count and last direction rolled up", fresh.messageCount === 1 && fresh.lastDirection === "outbound");
    check("an outbound message does not mark the thread unread", fresh.unread === false);

    // Their reply arrives, carrying a real Message-ID.
    await appendMessage(thread._id, {
      direction: "inbound", subject: "Re: Your Holi page", body: "The price put me off honestly.",
      rfcMessageId: "<CAF1abc@mail.gmail.com>", rfcMessageIdSource: "received",
      inReplyTo: `<${ses1}@email.amazonses.com>`,
      references: [`<${ses1}@email.amazonses.com>`],
      source: "inbound-ses",
    });

    fresh = await EmailThread.findById(thread._id).lean();
    h = threadingHeadersFor(fresh.messages);
    check("once they reply, the chain becomes exact", h.confidence === "exact", h.confidence);
    check("the parent is their message, not ours", h.inReplyTo === "<CAF1abc@mail.gmail.com>", h.inReplyTo);
    check(
      "References carries both, oldest first",
      h.references === `<${ses1}@email.amazonses.com> <CAF1abc@mail.gmail.com>`,
      h.references
    );
    check("an inbound message marks the thread unread", fresh.unread === true);
    check("last direction flipped", fresh.lastDirection === "inbound");
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── inbound matching, all four rungs ──");
  {
    // Rung 1: the headers name an id we hold.
    let m = await matchInboundThread({
      fromEmail: "someone-else@test.invalid",
      subject: "completely different subject",
      inReplyTo: "<CAF1abc@mail.gmail.com>",
      references: "",
      messageId: "<new1@mail.gmail.com>",
    });
    check("rung 1 matches on In-Reply-To even from the wrong address", m.rung === "headers" && String(m.thread._id) === mainThreadId, m.rung);

    // Rung 1 via References, when In-Reply-To was stripped.
    m = await matchInboundThread({
      fromEmail: "", subject: "", inReplyTo: "",
      references: "<010001a05d94a634-aaaa-000000@email.amazonses.com> <CAF1abc@mail.gmail.com>",
      messageId: "<new2@mail.gmail.com>",
    });
    check("rung 1 matches on References alone", m.rung === "headers" && String(m.thread._id) === mainThreadId, m.rung);

    // Rung 2: no usable headers, but the person and subject line up. This is
    // the rung that saves us when the reconstructed id was wrong.
    m = await matchInboundThread({
      fromEmail: creator.email, subject: "RE: Re: Your Holi page",
      inReplyTo: "<unknown-to-us@x>", references: "", messageId: "<new3@x>",
    });
    check("rung 2 matches on sender plus base subject", m.rung === "subject" && String(m.thread._id) === mainThreadId, m.rung);

    // Rung 3: the subject was rewritten entirely.
    m = await matchInboundThread({
      fromEmail: creator.email, subject: "hey", inReplyTo: "", references: "", messageId: "<new4@x>",
    });
    check("rung 3 falls back to their newest open conversation", m.rung === "recent" && String(m.thread._id) === mainThreadId, m.rung);

    // Rung 3 must respect the window.
    await EmailThread.updateOne(
      { _id: mainThreadId },
      { $set: { lastMessageAt: new Date(Date.now() - 200 * 86400000) } }
    );
    m = await matchInboundThread({
      fromEmail: creator.email, subject: "hey", inReplyTo: "", references: "", messageId: "<new5@x>",
    });
    check("rung 3 will not staple a reply to a conversation from months ago", m.rung === "none", m.rung);
    await EmailThread.updateOne({ _id: mainThreadId }, { $set: { lastMessageAt: new Date() } });

    // Rung 3 must not cross people.
    m = await matchInboundThread({
      fromEmail: other.email, subject: "hey", inReplyTo: "", references: "", messageId: "<new6@x>",
    });
    check("rung 3 never matches a different person's conversation", m.rung === "none", m.rung);

    // Rung 4.
    m = await matchInboundThread({
      fromEmail: "stranger@nowhere.invalid", subject: "hello?", inReplyTo: "", references: "", messageId: "<new7@x>",
    });
    check("rung 4 reports no match rather than guessing", m.rung === "none" && m.thread === null, m.rung);

    // A closed conversation is out of rung 3's reach but still reachable by id.
    await EmailThread.updateOne({ _id: mainThreadId }, { $set: { status: "closed" } });
    m = await matchInboundThread({
      fromEmail: creator.email, subject: "hey", inReplyTo: "", references: "", messageId: "<new8@x>",
    });
    check("a closed conversation is not reopened by a loose match", m.rung === "none", m.rung);
    m = await matchInboundThread({
      fromEmail: creator.email, subject: "hey",
      inReplyTo: "<CAF1abc@mail.gmail.com>", references: "", messageId: "<new9@x>",
    });
    check("but a closed conversation still matches on its own headers", m.rung === "headers", m.rung);
    await EmailThread.updateOne({ _id: mainThreadId }, { $set: { status: "open" } });
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── reading a conversation ──");
  {
    const list = await api("/admin/threads", {}, SUPER);
    check("the list loads for a super admin", list.status === 200 && Array.isArray(list.body.data.threads), `${list.status}`);
    check("the unread badge counts everything, not the filter", typeof list.body.data.unreadTotal === "number");
    check("the unread badge sees the inbound message", list.body.data.unreadTotal === 1, String(list.body.data.unreadTotal));
    check(
      "the list does not ship raw bodies",
      list.body.data.threads.every((t) => t.messages.every((m) => !m.rawBody || m.trimmed))
    );

    const one = await api(`/admin/threads/${mainThreadId}`, {}, SUPER);
    check("one conversation loads in full", one.status === 200 && one.body.data.messages.length === 2, `${one.status}`);
    check("it names the person", one.body.data.userEmail === creator.email, one.body.data.userEmail);
    check("it reports confidence per message", one.body.data.messages[0].confidence === "reconstructed");

    // Opening it is reading it.
    const after = await EmailThread.findById(mainThreadId).select("unread").lean();
    check("opening a conversation marks it read", after.unread === false);

    const bad = await api("/admin/threads/not-an-id", {}, SUPER);
    check("a malformed id is refused, not 500", bad.status === 400, `${bad.status}`);
    const missing = await api(`/admin/threads/${new mongoose.Types.ObjectId()}`, {}, SUPER);
    check("an unknown id is a 404", missing.status === 404, `${missing.status}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── pasting a reply in by hand ──");
  {
    const pasted = await api(
      `/admin/threads/${mainThreadId}/inbound`,
      {
        method: "POST",
        body: JSON.stringify({
          text: "Yeah it was the price.\n\nOn Mon, 1 Sep 2026 at 10:04, SubhSandesh <feedback@subhsandesh.in> wrote:\n> Hi Asha",
        }),
      },
      SUPER
    );
    check("a pasted reply is accepted", pasted.status === 200, `${pasted.status}`);

    const fresh = await EmailThread.findById(mainThreadId).lean();
    const last = fresh.messages[fresh.messages.length - 1];
    check("it is stored as inbound", last.direction === "inbound");
    check("the quoted original is trimmed off", last.body === "Yeah it was the price.", JSON.stringify(last.body));
    check("the untrimmed original is kept", last.rawBody.includes("> Hi Asha"));
    check("it is marked trimmed, so the panel can offer to expand it", last.trimmed === true);
    check("it is marked as pasted, not received", last.source === "manual", last.source);
    check("it carries NO message id — nothing arrived", !last.rfcMessageId, last.rfcMessageId);
    check("it marks the conversation unread again", fresh.unread === true);

    const log = await AdminAuditLog.findOne({ action: "thread.inbound_pasted" }).lean();
    check("pasting is audited", !!log);
    check("the audit names who typed it", log && String(log.actorEmail || "").includes("su@test.invalid"), log && log.actorEmail);

    const empty = await api(`/admin/threads/${mainThreadId}/inbound`, { method: "POST", body: JSON.stringify({ text: " " }) }, SUPER);
    check("an empty paste is refused", empty.status === 400, `${empty.status}`);
    const future = await api(
      `/admin/threads/${mainThreadId}/inbound`,
      { method: "POST", body: JSON.stringify({ text: "hello", at: "2099-01-01" }) },
      SUPER
    );
    check("a date in the far future is refused", future.status === 400, `${future.status}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── threadMode on the send route ──");
  {
    const bad = await api(
      `/admin/drafts/holi/${draft._id}/send`,
      { method: "POST", body: JSON.stringify({ subject: "Hi", body: "x".repeat(60), threadMode: "sideways" }) },
      SUPER
    );
    check("a nonsense threadMode is refused before anything is sent", bad.status === 400, `${bad.status}`);

    // A page with no conversation at all.
    const lonely = await HoliPage.create({
      userId: creator._id, senderName: "Asha", recipientName: "Q", isPublished: false,
    });
    const noThread = await api(
      `/admin/drafts/holi/${lonely._id}/send`,
      { method: "POST", body: JSON.stringify({ subject: "Hi", body: "x".repeat(60), threadMode: "same" }) },
      SUPER
    );
    check(
      '"same" with no conversation refuses rather than quietly opening one',
      noThread.status === 409 && noThread.body.code === "NO_THREAD",
      `${noThread.status} ${noThread.body && noThread.body.code}`
    );

    const detail = await api(`/admin/drafts/holi/${draft._id}`, {}, SUPER);
    check("the detail route ships the conversation", detail.status === 200 && detail.body.data.threads.length === 1, `${detail.status}`);
    check("and defaults to continuing it", detail.body.data.defaultThreadMode === "same", detail.body.data.defaultThreadMode);

    const lonelyDetail = await api(`/admin/drafts/holi/${lonely._id}`, {}, SUPER);
    check("a draft with no conversation defaults to a new thread", lonelyDetail.body.data.defaultThreadMode === "new", lonelyDetail.body.data.defaultThreadMode);

    // With no SES credentials the send route stops at 503 — asserted here so
    // this script can never be the thing that puts mail in a real inbox.
    const send = await api(
      `/admin/drafts/holi/${draft._id}/send`,
      { method: "POST", body: JSON.stringify({ subject: "Hi", body: "x".repeat(60), threadMode: "same" }) },
      SUPER
    );
    check(
      "with no SES credentials the send stops at 503 and records nothing",
      send.status === 503 && send.body.code === "SES_NOT_CONFIGURED",
      `${send.status}`
    );
    const unchanged = await EmailThread.findById(mainThreadId).lean();
    check("the conversation gained no message from the refused send", unchanged.messageCount === 3, String(unchanged.messageCount));
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── a second conversation about the same page ──");
  {
    const second = await openThread(
      {
        kind: "draft", userId: String(creator._id), userName: creator.name,
        userEmail: creator.email, pageId: String(draft._id),
        templateType: "holi", templateLabel: "Holi",
      },
      "About the photo upload"
    );
    check("it takes the next sequence number", second.seq === 2, String(second.seq));
    check("and its own key", second.threadKey === `draft:${draft._id}:2`, second.threadKey);

    const latest = await latestThreadForPage(String(draft._id));
    check('"same thread" targets the newest one', String(latest._id) === String(second._id));

    const detail = await api(`/admin/drafts/holi/${draft._id}`, {}, SUPER);
    check("both conversations are shown", detail.body.data.threads.length === 2, String(detail.body.data.threads.length));
    check("newest first", detail.body.data.threads[0].seq === 2, String(detail.body.data.threads[0].seq));
  }

  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── closing and annotating ──");
  {
    const patch = await api(
      `/admin/threads/${mainThreadId}`,
      { method: "PATCH", body: JSON.stringify({ status: "closed", notes: "She said price. Logged for pricing review." }) },
      SUPER
    );
    check("a conversation can be closed with a note", patch.status === 200 && patch.body.data.status === "closed", `${patch.status}`);

    const badStatus = await api(`/admin/threads/${mainThreadId}`, { method: "PATCH", body: JSON.stringify({ status: "maybe" }) }, SUPER);
    check("an unknown status is refused", badStatus.status === 400, `${badStatus.status}`);
    const nothing = await api(`/admin/threads/${mainThreadId}`, { method: "PATCH", body: "{}" }, SUPER);
    check("an empty patch is refused rather than silently doing nothing", nothing.status === 400, `${nothing.status}`);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`thread-integration.js   ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("\nfailed:");
    for (const f of failures) console.log(`  · ${f}`);
  }
  await mongoose.disconnect();
  process.exit(fail > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error("\n✗ the script itself threw:", e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
