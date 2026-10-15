// ─── Prospect outreach: the rules that keep it out of spam ──────────────────
//
// No Mongo, no SES, no OpenAI: the model is a stub returning fixed JSON, the
// transport records what it was given, and model statics are patched where a
// DB call is unavoidable. Real email is never sent from here.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  canEmailProspect,
  classifyProspectReply,
  estimateFinish,
  lintOutreach,
  nextSendDecision,
  parseProspectCsv,
  parseProspectInput,
  parseSesFeedback,
  prospectFirstName,
  prospectHeaders,
  prospectJobKind,
  prospectMailHtml,
  prospectMailText,
  publicApiBase,
  renderMergeFields,
  unknownMergeFields,
  unsubscribeUrl,
} from "./prospectMail.service";
import {
  PROSPECT_SYSTEM_PROMPT,
  buildProspectPrompt,
  draftProspectMail,
  draftProspectMailWithRetry,
  ThreadAiRefusedError,
  type ProspectDraftContext,
} from "./prospectAi.service";
import { sendInfluencerMail } from "./influencerMail.service";
import { matchInfluencerInbound, type InfluencerMatchDeps } from "./threadStore.service";
import { markProspectJoined, unsubscribeByToken, type JoinDeps } from "./prospect.service";
import InfluencerProspect from "../models/InfluencerProspect";
import ProspectMailJob from "../models/ProspectMailJob";
import type { IEmailThread } from "../models/EmailThread";
import type { SesEmail } from "./ses.service";

const JOIN = "https://subhsandesh.in/influencer";

const GOOD_TEMPLATE = `Hi {{firstName}},

I run SubhSandesh, a small Indian site where people make personalised pages for someone they love, like birthday surprises, proposal pages and Diwali or Rakhi greetings.

I'm inviting a few creators to our creator programme. You get your own link and a live dashboard. Anyone who signs up through it stays linked to you, and you earn 30% of every payment they make. Short Reels of a page being opened tend to do well.

Joining takes a couple of minutes and costs nothing:
${JOIN}

Would it be worth a look for {{instagram}}?`;

const lint = (s: string, b: string, kind: "initial" | "followup" | "reply" = "initial") =>
  lintOutreach(renderMergeFields(s, { name: "Priya Sharma", instagram: "priya.reels" }), renderMergeFields(b, { name: "Priya Sharma", instagram: "priya.reels" }), {
    commissionPercent: 30,
    template: { subject: s, body: b },
    kind,
  });

describe("prospect input", () => {
  it("normalises email and Instagram (handle or profile URL)", () => {
    const r = parseProspectInput({ name: "  Priya  Sharma ", email: " Priya@Gmail.COM ", instagram: "https://www.instagram.com/Priya.Reels/?igsh=abc" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.value.name, "Priya Sharma");
      assert.equal(r.value.email, "priya@gmail.com");
      assert.equal(r.value.instagram, "priya.reels");
    }
    const at = parseProspectInput({ name: "Ravi", email: "r@x.in", instagram: "@ravi_k" });
    assert.ok(at.ok && at.value.instagram === "ravi_k");
  });

  it("rejects a bad email, a post URL, and a missing name with the field named", () => {
    const e = parseProspectInput({ name: "Ravi", email: "ravi@" });
    assert.ok(!e.ok && e.field === "email");
    const ig = parseProspectInput({ name: "Ravi", email: "ravi@x.in", instagram: "instagram.com/p/xyz" });
    assert.ok(!ig.ok && ig.field === "instagram");
    const n = parseProspectInput({ name: "", email: "ravi@x.in" });
    assert.ok(!n.ok && n.field === "name");
  });

  it("parses a CSV / spreadsheet paste, skipping the header and reporting bad lines", () => {
    const { rows, errors } = parseProspectCsv("name,email,instagram\nPriya,priya@x.in,@priya\nBad,not-an-email,\nRavi\travi@y.in\travi.k\tdance");
    assert.equal(rows.length, 2);
    assert.equal(rows[1].instagram, "ravi.k");
    assert.equal(rows[1].note, "dance");
    assert.deepEqual(errors.map((e) => e.line), [3]);
  });
});

describe("merge fields", () => {
  it("fills firstName / instagram / name per person, with honest fallbacks", () => {
    const t = "Hi {{firstName}}, about {{ instagram }} — {{name}}";
    assert.equal(renderMergeFields(t, { name: "Dr. Asha Verma", instagram: "asha" }), "Hi Asha, about @asha — Dr. Asha Verma");
    assert.equal(renderMergeFields(t, { name: "", instagram: "" }), "Hi there, about your profile — there");
    assert.equal(prospectFirstName("priya sharma"), "Priya");
  });
  it("leaves unknown fields in place and reports them", () => {
    assert.equal(renderMergeFields("{{link}}", { name: "A", instagram: "" }), "{{link}}");
    assert.deepEqual(unknownMergeFields("Hi {{firstName}} {{link}} {{city}}"), ["{{link}}", "{{city}}"]);
  });
});

describe("the outreach linter", () => {
  it("passes a short, plain, single-link personal note", () => {
    const r = lint("Your own link on SubhSandesh", GOOD_TEMPLATE);
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
    assert.ok(r.words >= 80 && r.words <= 150, `words ${r.words}`);
    assert.deepEqual(r.links, [JOIN]);
  });

  const blocked: [string, string, string, string][] = [
    ["spam phrase", "A quick idea", GOOD_TEMPLATE.replace("tend to do well", "are guaranteed to do well"), "spam_phrase"],
    ["click here", "A quick idea", GOOD_TEMPLATE.replace("Joining takes", "Click here, joining takes"), "spam_phrase"],
    ["ALL CAPS", "A quick idea", GOOD_TEMPLATE.replace("costs nothing", "costs NOTHING"), "all_caps"],
    ["!!", "A quick idea", GOOD_TEMPLATE.replace("tend to do well.", "tend to do well!!"), "bangs"],
    ["shortener", "A quick idea", GOOD_TEMPLATE.replace(JOIN, "https://bit.ly/abc"), "shortener"],
    ["foreign link", "A quick idea", GOOD_TEMPLATE.replace(JOIN, "https://example.com/join"), "foreign_link"],
    ["second link", "A quick idea", GOOD_TEMPLATE + "\nhttps://subhsandesh.in/templates", "too_many_links"],
    ["http", "A quick idea", GOOD_TEMPLATE.replace("https://", "http://"), "insecure_link"],
    ["wrong %", "A quick idea", GOOD_TEMPLATE.replace("30%", "50%"), "wrong_percent"],
    ["₹ twice", "A quick idea", GOOD_TEMPLATE.replace("costs nothing", "costs ₹0 and pays ₹500"), "money_symbols"],
    ["fake Re:", "Re: our chat", GOOD_TEMPLATE, "subject_fake_reply"],
    ["too short", "Hi", "Hi {{firstName}}, join us: " + JOIN, "too_short"],
    ["unknown merge", "A quick idea", GOOD_TEMPLATE.replace("{{instagram}}", "{{handle}}"), "merge_unknown"],
    ["html", "A quick idea", GOOD_TEMPLATE.replace("Joining", "<b>Joining</b>"), "html"],
    ["long subject", "x".repeat(80), GOOD_TEMPLATE, "subject_long"],
  ];
  for (const [name, s, b, code] of blocked) {
    it(`blocks: ${name}`, () => {
      const r = lint(s, b);
      assert.ok(!r.ok, `${name} should block`);
      assert.ok(r.errors.some((e) => e.code === code), `${name}: expected ${code}, got ${r.errors.map((e) => e.code).join(",")}`);
    });
  }

  it("does not read an email address's domain as a link", () => {
    const r = lint("Your own link on SubhSandesh", GOOD_TEMPLATE.replace("costs nothing:", "costs nothing (questions: me@gmail.com):"));
    assert.deepEqual(r.links, [JOIN]);
  });

  it("allows Re: and a shorter body for a follow-up", () => {
    const body = `Hi {{firstName}},\n\nJust floating my note from last week back up in case it got buried. The creator programme pays 30% of what the people you bring in spend, and joining is quick:\n${JOIN}\n\nA one-word reply is plenty if you're curious. No worries at all if not.`;
    const r = lint("Re: Your own link on SubhSandesh", body, "followup");
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  });
});

describe("the rendered email", () => {
  const content = { body: renderMergeFields(GOOD_TEMPLATE, { name: "Priya", instagram: "priya.reels" }), signature: "Suyash\nSubhSandesh", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/api/public/prospects/unsubscribe/tok", token: "INF-7K2Q9MXA" };
  it("text: signature, why-line, unsubscribe, business address, ref", () => {
    const t = prospectMailText(content);
    assert.match(t, /Suyash\nSubhSandesh/);
    assert.match(t, /came across your Instagram \(@priya\.reels\)/);
    assert.match(t, /Unsubscribe: https:\/\/api\.subhsandesh\.in\/api\/public\/prospects\/unsubscribe\/tok/);
    assert.match(t, /Ward No\. 06, Indira Nagar, Dumariyaganj/);
    assert.match(t, /Ref: INF-7K2Q9MXA/);
  });
  it("html mirrors it: no images, no pixel, links shown as themselves", () => {
    const h = prospectMailHtml(content);
    assert.ok(!/<img|<table|background-image/i.test(h));
    assert.match(h, new RegExp(`<a href="${JOIN}">${JOIN}</a>`));
    assert.match(h, /Unsubscribe<\/a>/);
    assert.match(h, /272189/);
  });
  it("RFC 8058 headers", () => {
    const h = prospectHeaders("https://api.subhsandesh.in/u/x", "influencer@reply.subhsandesh.in");
    assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.equal(h["List-Unsubscribe"], "<https://api.subhsandesh.in/u/x>, <mailto:influencer@reply.subhsandesh.in?subject=unsubscribe>");
  });
  it("public API base follows the site host", () => {
    assert.equal(publicApiBase("", "https://subhsandesh.in"), "https://api.subhsandesh.in");
    assert.equal(publicApiBase("", "https://stag.subhsandesh.in"), "https://stag-api.subhsandesh.in");
    assert.equal(publicApiBase("", "http://localhost:3000", 5181), "http://localhost:5181");
    assert.equal(publicApiBase("https://x.example/", "https://subhsandesh.in"), "https://x.example");
    assert.equal(unsubscribeUrl("abc", "https://api.subhsandesh.in"), "https://api.subhsandesh.in/api/public/prospects/unsubscribe/abc");
  });

  it("sends one recipient per SES call with our rendering, display name and headers", async () => {
    const seen: SesEmail[] = [];
    const r = await sendInfluencerMail(
      {
        to: "priya@x.in",
        subject: "Your own link on SubhSandesh",
        body: content.body,
        token: content.token,
        render: () => ({ text: prospectMailText(content), html: prospectMailHtml(content) }),
        fromName: "Suyash from SubhSandesh",
        extraHeaders: prospectHeaders(content.unsubscribeUrl, "influencer@reply.subhsandesh.in"),
      },
      async (e) => { seen.push(e); return { outcome: "sent", messageId: "m-1" }; }
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].to, "priya@x.in");
    assert.equal(seen[0].fromName, "Suyash from SubhSandesh");
    assert.match(String(seen[0].replyTo), /^Suyash from SubhSandesh </);
    assert.equal(seen[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(seen[0].text.includes("Unsubscribe:"));
    assert.equal(r.providerMessageId, "m-1");
  });
});

describe("contact rules", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  const day = 86_400_000;
  it("one first email, one follow-up after N days, then nothing until they reply", () => {
    assert.deepEqual(canEmailProspect({ status: "new" }, now, 4), { ok: true, kind: "initial" });
    const sent = { status: "contacted" as const, initialSentAt: new Date(now.getTime() - day), lastContactedAt: new Date(now.getTime() - day) };
    const early = canEmailProspect(sent, now, 4);
    assert.ok(!early.ok && /in 3 days/.test(early.reason));
    const due = { ...sent, lastContactedAt: new Date(now.getTime() - 5 * day) };
    assert.deepEqual(canEmailProspect(due, now, 4), { ok: true, kind: "followup" });
    const both = { ...due, followUpSentAt: new Date(now.getTime() - 5 * day) };
    assert.ok(!canEmailProspect(both, now, 4).ok);
    assert.equal(prospectJobKind({ ...both, status: "replied" }), "reply");
  });
  it("never: unsubscribed, bounced, not interested, joined, deleted", () => {
    for (const status of ["unsubscribed", "bounced", "not_interested", "joined"] as const) {
      assert.ok(!canEmailProspect({ status }, now).ok, status);
    }
    assert.ok(!canEmailProspect({ status: "new", deletedAt: now }, now).ok);
  });
});

describe("pacing and the daily cap", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  const base = { sentLast24h: 0, oldestInWindow: null, lastSentAt: null, cap: 30, minGapMs: 90_000, now };
  it("sends when under the cap and past the gap", () => {
    assert.deepEqual(nextSendDecision(base), { send: true });
  });
  it("waits out the per-send gap", () => {
    const d = nextSendDecision({ ...base, lastSentAt: new Date(now.getTime() - 30_000) });
    assert.ok(!d.send && d.reason === "gap" && d.until.getTime() === now.getTime() + 60_000);
  });
  it("stops at the cap until the oldest send leaves the 24h window", () => {
    const oldest = new Date(now.getTime() - 20 * 3_600_000);
    const d = nextSendDecision({ ...base, sentLast24h: 30, oldestInWindow: oldest });
    assert.ok(!d.send && d.reason === "cap" && d.until.getTime() === oldest.getTime() + 86_400_000);
  });
  it("cap 0 switches sending off", () => {
    const d = nextSendDecision({ ...base, cap: 0 });
    assert.ok(!d.send && d.reason === "off");
  });
  it("50 queued under a 30/day cap finish the next day, not in an hour", () => {
    const end = estimateFinish(50, base);
    assert.ok(end.getTime() - now.getTime() > 86_400_000, end.toISOString());
    const small = estimateFinish(5, base);
    assert.equal(small.getTime() - now.getTime(), 4 * 90_000);
  });
});

describe("feedback", () => {
  it("parses permanent bounces and complaints, both notification styles", () => {
    const b = parseSesFeedback({ notificationType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "Gone@X.in" }] } });
    assert.deepEqual(b, { type: "bounce", permanent: true, recipients: ["gone@x.in"] });
    const t = parseSesFeedback({ eventType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "full@x.in" }] } });
    assert.equal(t?.permanent, false);
    const c = parseSesFeedback({ eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "a@b.in" }] } });
    assert.equal(c?.type, "complaint");
    assert.equal(parseSesFeedback({ notificationType: "Received" }), null);
    assert.equal(parseSesFeedback({ eventType: "Delivery" }), null);
  });
  it("classifies short opt-out replies, leaves conversations for a human", () => {
    assert.equal(classifyProspectReply("unsubscribe", ""), "unsubscribe");
    assert.equal(classifyProspectReply("Re: Your own link", "Please remove me from your list"), "unsubscribe");
    assert.equal(classifyProspectReply("Re: x", "Stop"), "unsubscribe");
    assert.equal(classifyProspectReply("Re: x", "No thanks, not for me."), "not_interested");
    assert.equal(classifyProspectReply("Re: x", "Sounds interesting! How do payouts work?"), "reply");
    assert.equal(classifyProspectReply("Re: x", "Stop me if I'm wrong, but " + "this is a long and genuine question about the programme ".repeat(4)), "reply");
  });
});

describe("drafting (stubbed model)", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  const person = { name: "Priya Sharma", instagram: "priya.reels", niche: "couple comedy reels", note: "Saw her Karwa Chauth reel" };
  const reply = (o: { subject?: string; body: string }) => async () => JSON.stringify({ reading: "r", subject: o.subject ?? "Your own link on SubhSandesh", body: o.body });
  const personal: ProspectDraftContext = { mode: "personal", person, programme };
  const personalBody = GOOD_TEMPLATE.replace("{{firstName}}", "Priya").replace("{{instagram}}", "your couple comedy reels");

  it("accepts a grounded personal draft", async () => {
    const d = await draftProspectMail(personal, reply({ body: personalBody }));
    assert.equal(d.mode, "personal");
    assert.ok(d.body.startsWith("Hi Priya"));
  });
  it("strips a sign-off the model added (the signature is automatic)", async () => {
    const d = await draftProspectMail(personal, reply({ body: personalBody + "\n\nBest,\nSuyash" }));
    assert.ok(!/Suyash\s*$/.test(d.body));
  });
  it("rejects invented money, other percentages, foreign links and spam wording", async () => {
    for (const bad of [
      personalBody.replace("costs nothing", "could earn you ₹5,000 a month"),
      personalBody.replace("30%", "40%"),
      personalBody.replace(JOIN, "https://linktr.ee/subh"),
      personalBody.replace("tend to do well", "are a guaranteed hit"),
    ]) {
      await assert.rejects(draftProspectMail(personal, reply({ body: bad })), ThreadAiRefusedError);
    }
  });
  it("a template must greet by {{firstName}}; a personal one must not contain {{ }}", async () => {
    const tpl: ProspectDraftContext = { mode: "template", recipients: 5, programme };
    await assert.rejects(draftProspectMail(tpl, reply({ body: personalBody })), /firstName/);
    const ok = await draftProspectMail(tpl, reply({ body: GOOD_TEMPLATE }));
    assert.match(ok.body, /\{\{firstName\}\}/);
    await assert.rejects(draftProspectMail(personal, reply({ body: GOOD_TEMPLATE })), /merge fields/);
  });
  it("retries a rejected draft and keeps the good one", async () => {
    let n = 0;
    const flaky = async () => JSON.stringify({ reading: "r", subject: "Your own link on SubhSandesh", body: n++ === 0 ? personalBody.replace("30%", "45%") : personalBody });
    const d = await draftProspectMailWithRetry(personal, flaky);
    assert.equal(n, 2);
    assert.ok(d.body.includes("30%"));
  });
  it("the prompt carries only admin-entered facts, the real %, the join link — and names no banned phrase", () => {
    const p = buildProspectPrompt(personal, "english");
    assert.match(p, /couple comedy reels/);
    assert.match(p, /30%/);
    assert.match(p, /https:\/\/subhsandesh\.in\/influencer/);
    for (const banned of ["guaranteed", "click here", "limited time", "act now", "earn money fast"]) {
      assert.ok(!PROSPECT_SYSTEM_PROMPT.toLowerCase().includes(banned) && !p.toLowerCase().includes(banned), banned);
    }
  });
  it("a reply needs something to reply to", async () => {
    await assert.rejects(draftProspectMail({ mode: "reply", person, programme, messages: [] }, reply({ body: personalBody })), /nothing to reply to/);
  });
});

describe("inbound: prospect replies land in their thread", () => {
  const PT = { _id: "pt1", kind: "prospect", userEmail: "priya@x.in", threadToken: "INF-PRSP2345" } as unknown as IEmailThread;
  const deps = (over: Partial<InfluencerMatchDeps> = {}): InfluencerMatchDeps => ({
    byMessageId: async () => null,
    byToken: async (t) => (t === "INF-PRSP2345" ? PT : null),
    latestForEmail: async (e) => (e === "priya@x.in" ? PT : null),
    influencerUserByEmail: async () => null,
    prospectByEmail: async (e) => (e === "new@x.in" ? { _id: "p9", name: "Neha", email: e } : null),
    ...over,
  });
  const ev = (o: Record<string, string>) => ({ fromEmail: "", subject: "", inReplyTo: "", references: "", messageId: "", token: "", ...o });

  it("by the footer token, even from another address", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "other@y.in", token: "INF-PRSP2345" }), deps());
    assert.equal(m.rung, "token");
    assert.equal(m.thread, PT);
  });
  it("by sender address when headers and token are gone", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya@x.in" }), deps());
    assert.equal(m.rung, "sender");
    assert.equal(m.thread, PT);
  });
  it("a prospect with no thread yet → returned so the caller opens one", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "new@x.in" }), deps());
    assert.equal(m.thread, null);
    assert.equal(m.prospect?.name, "Neha");
  });
  it("a stranger still falls through to Unmatched", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "who@z.in" }), deps());
    assert.equal(m.rung, "none");
  });
});

describe("join → prospect joined", () => {
  function fake(found: { _id: unknown; threadId?: unknown }[]) {
    const calls: string[] = [];
    const d: JoinDeps & { calls: string[]; asked: string[] } = {
      calls,
      asked: [],
      findProspects: async (email, ig) => { d.asked.push(`${email}|${ig}`); return found; },
      markJoined: async (ids, userId) => { calls.push(`joined:${ids.join(",")}:${userId}`); },
      convertThread: async (t, userId) => { calls.push(`thread:${t}->${userId}`); },
      cancel: async (ids) => { calls.push(`cancel:${ids.join(",")}`); },
    };
    return d;
  }
  it("matches on email or Instagram, marks joined, cancels queued mail, moves the thread", async () => {
    const d = fake([{ _id: "p1", threadId: "t1" }, { _id: "p2" }]);
    const n = await markProspectJoined({ _id: "u1", email: " Priya@X.in ", instagram: "@Priya.Reels" }, d);
    assert.equal(n, 2);
    assert.deepEqual(d.asked, ["priya@x.in|priya.reels"]);
    assert.deepEqual(d.calls, ["joined:p1,p2:u1", "cancel:p1,p2", "thread:t1->u1"]);
  });
  it("no match → nothing happens; a DB error never fails the join", async () => {
    assert.equal(await markProspectJoined({ _id: "u1", email: "a@b.in" }, fake([])), 0);
    const broken = fake([]);
    broken.findProspects = async () => { throw new Error("db down"); };
    assert.equal(await markProspectJoined({ _id: "u1", email: "a@b.in" }, broken), 0);
  });
});

describe("unsubscribe endpoint logic", () => {
  // Model statics patched so no Mongo is needed.
  const origFind = InfluencerProspect.findOne;
  const origUpdate = InfluencerProspect.updateOne;
  const origJobs = ProspectMailJob.updateMany;
  let row: { _id: string; status: string } | null;
  const writes: unknown[] = [];
  beforeEach(() => {
    writes.length = 0;
    (InfluencerProspect as unknown as { findOne: unknown }).findOne = () => ({ select: async () => row });
    (InfluencerProspect as unknown as { updateOne: unknown }).updateOne = async (_q: unknown, u: unknown) => { writes.push(u); return {}; };
    (ProspectMailJob as unknown as { updateMany: unknown }).updateMany = async (_q: unknown, u: unknown) => { writes.push(u); return { modifiedCount: 1 }; };
  });
  afterEach(() => {
    InfluencerProspect.findOne = origFind;
    InfluencerProspect.updateOne = origUpdate;
    ProspectMailJob.updateMany = origJobs;
  });
  it("rejects malformed tokens without touching the DB", async () => {
    row = { _id: "64b000000000000000000001", status: "new" };
    assert.equal(await unsubscribeByToken("../../etc"), "unknown");
    assert.equal(await unsubscribeByToken("short"), "unknown");
    assert.equal(writes.length, 0);
  });
  it("marks the prospect unsubscribed and cancels queued mail; idempotent", async () => {
    row = { _id: "64b000000000000000000001", status: "contacted" };
    assert.equal(await unsubscribeByToken("AbCdEfGhIjKlMnOpQrStUvWx"), "done");
    assert.equal((writes[0] as { $set: { status: string } }).$set.status, "unsubscribed");
    assert.equal((writes[1] as { $set: { state: string } }).$set.state, "cancelled");
    row = { _id: "64b000000000000000000001", status: "unsubscribed" };
    assert.equal(await unsubscribeByToken("AbCdEfGhIjKlMnOpQrStUvWx"), "already");
  });
  it("unknown token", async () => {
    row = null;
    assert.equal(await unsubscribeByToken("AbCdEfGhIjKlMnOpQrStUvWx"), "unknown");
  });
});
