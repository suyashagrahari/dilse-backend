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
  planSelection,
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
  const content = { body: renderMergeFields(GOOD_TEMPLATE, { name: "Priya", instagram: "priya.reels" }), signature: "Team SubhSandesh", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/api/public/prospects/unsubscribe/tok", token: "INF-7K2Q9MXA" };
  it("text: signature, why-line, unsubscribe, business address, ref", () => {
    const t = prospectMailText(content);
    assert.match(t, /Team SubhSandesh/);
    assert.match(t, /we came across your Instagram \(@priya\.reels\)/);
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
        fromName: "SubhSandesh Team",
        extraHeaders: prospectHeaders(content.unsubscribeUrl, "influencer@reply.subhsandesh.in"),
      },
      async (e) => { seen.push(e); return { outcome: "sent", messageId: "m-1" }; }
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].to, "priya@x.in");
    assert.equal(seen[0].fromName, "SubhSandesh Team");
    assert.match(String(seen[0].replyTo), /^SubhSandesh Team </);
    assert.equal(seen[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(seen[0].text.includes("Unsubscribe:"));
    assert.equal(r.providerMessageId, "m-1");
  });
});

describe("contact rules: send again any time", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  const day = 86_400_000;
  const hour = 3_600_000;
  it("never emailed → a first email only", () => {
    const v = canEmailProspect({ status: "new" }, now, 4);
    assert.ok(v.ok && v.kind === "initial");
    assert.deepEqual(v.ok && v.kinds, ["initial"]);
  });
  it("emailed → a follow-up or a new email, any time — no cap after one follow-up", () => {
    const sent = { status: "contacted" as const, initialSentAt: new Date(now.getTime() - 3 * day), lastContactedAt: new Date(now.getTime() - 3 * day) };
    const v = canEmailProspect(sent, now, 4);
    assert.ok(v.ok && v.kind === "followup");
    assert.deepEqual(v.ok && v.kinds, ["followup", "fresh"]);
    assert.ok(v.ok && !v.followupDue && !v.recent, "3 days in: allowed, not yet 'due', no warning");
    const many = { ...sent, followUpSentAt: new Date(now.getTime() - 5 * day), followUpCount: 4, contactCount: 5, lastContactedAt: new Date(now.getTime() - 5 * day) };
    const again = canEmailProspect(many, now, 4);
    assert.ok(again.ok && again.kinds.includes("followup") && again.followupDue, "after 4 follow-ups, still allowed");
  });
  it("warns, never blocks, when the last email went under 48 h ago", () => {
    const v = canEmailProspect({ status: "contacted", initialSentAt: new Date(now.getTime() - 5 * hour), lastContactedAt: new Date(now.getTime() - 5 * hour) }, now);
    assert.ok(v.ok);
    assert.match((v.ok && v.recent) || "", /5 hours ago/);
    const w = canEmailProspect({ status: "contacted", initialSentAt: new Date(now.getTime() - 50 * hour), lastContactedAt: new Date(now.getTime() - 50 * hour) }, now);
    assert.ok(w.ok && !w.recent);
  });
  it("replied → reply first, follow-up and new email still possible", () => {
    const v = canEmailProspect({ status: "replied", initialSentAt: new Date(now.getTime() - day), lastReplyAt: now }, now);
    assert.ok(v.ok && v.kind === "reply");
    assert.deepEqual(v.ok && v.kinds, ["reply", "followup", "fresh"]);
    assert.equal(prospectJobKind({ status: "replied", initialSentAt: now }), "reply");
  });
  it("not interested → allowed only with an explicit confirm", () => {
    const v = canEmailProspect({ status: "not_interested", initialSentAt: new Date(now.getTime() - 9 * day), lastReplyAt: new Date(now.getTime() - 8 * day) }, now);
    assert.ok(v.ok && !!v.needsConfirm);
  });
  it("hard blocks: unsubscribed, complained, bounced, joined, deleted, dead address — each says why", () => {
    const cases: [Parameters<typeof canEmailProspect>[0], RegExp][] = [
      [{ status: "unsubscribed" }, /Unsubscribed/],
      [{ status: "unsubscribed", complainedAt: now }, /spam/],
      [{ status: "bounced" }, /bounced/],
      [{ status: "joined" }, /joined/],
      [{ status: "new", deletedAt: now }, /Deleted/],
      [{ status: "new", email: "x@gone.invalid" }, /usable/],
    ];
    for (const [p, why] of cases) {
      const v = canEmailProspect(p, now);
      assert.ok(!v.ok, JSON.stringify(p));
      assert.match(!v.ok ? v.reason : "", why);
    }
  });
});

describe("mixed selections are planned, never silently trimmed", () => {
  const now = new Date("2026-10-16T10:00:00Z");
  const row = (id: string, p: Parameters<typeof canEmailProspect>[0]) => ({ id, name: id, verdict: canEmailProspect(p, now) });
  const sent = { initialSentAt: new Date(now.getTime() - 5 * 86_400_000), lastContactedAt: new Date(now.getTime() - 5 * 86_400_000) };
  const rows = [
    row("new1", { status: "new" }),
    row("new2", { status: "new" }),
    row("new3", { status: "new" }),
    row("cont1", { status: "contacted", ...sent }),
    row("cont2", { status: "contacted", ...sent }),
    row("rep1", { status: "replied", ...sent, lastReplyAt: now }),
    row("ni1", { status: "not_interested", ...sent }),
    row("unsub", { status: "unsubscribed", ...sent }),
  ];
  it("no intent → the most common stage; everyone else is listed with a reason", () => {
    const p = planSelection(rows);
    assert.equal(p.intent, "initial");
    assert.deepEqual(p.included.map((r) => r.id), ["new1", "new2", "new3"]);
    const ex = Object.fromEntries(p.excluded.map((e) => [e.id, e.reason]));
    assert.match(ex.cont1, /Already emailed/);
    assert.match(ex.unsub, /Unsubscribed/);
    assert.equal(p.included.length + p.excluded.length, rows.length, "nobody disappears");
    assert.deepEqual(p.reach, { initial: 3, followup: 4, fresh: 4, reply: 1 });
  });
  it("picking Follow-up takes the contacted and the replied; new ones say they need a first email", () => {
    const p = planSelection(rows, { intent: "followup" });
    assert.deepEqual(p.included.map((r) => r.id), ["cont1", "cont2", "rep1"]);
    assert.match(p.excluded.find((e) => e.id === "new1")!.reason, /needs a first email/);
    assert.match(p.excluded.find((e) => e.id === "ni1")!.reason, /confirm/);
    assert.deepEqual(p.needsConfirm.map((r) => r.id), ["ni1"]);
  });
  it("not interested is included once confirmed", () => {
    const p = planSelection(rows, { intent: "fresh", allowNotInterested: true });
    assert.ok(p.included.some((r) => r.id === "ni1"));
    assert.ok(!p.included.some((r) => r.id === "unsub"));
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
    const t = await draftProspectMail(personal, reply({ body: personalBody + "\n\nWarm regards,\nTeam SubhSandesh" }));
    assert.ok(!/SubhSandesh\s*$/.test(t.body), t.body);
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
    const fixed = await draftProspectMail(tpl, reply({ body: personalBody }));
    assert.ok(fixed.body.startsWith("Hi {{firstName}},"), "one person's name is put back to {{firstName}}");
    await assert.rejects(draftProspectMail(tpl, reply({ body: personalBody.replace("Hi Priya,", "So,") })), /firstName/);
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
