// ─── Personal invite mode: what makes a first email land in Gmail Primary ───
//
// No Mongo, no SES, no OpenAI: the model is a stub, the transport records what
// it was given. Real email is never sent from here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_OPT_OUT_LINE,
  classifyProspectReply,
  estimateFinish,
  hasOptOutLine,
  inboxCheck,
  isRoleAddress,
  isSenderNotAllowedError,
  lintOutreach,
  nextSendDecision,
  personalSender,
  personalSenderBlockedMessage,
  personalSignature,
  pickGapMs,
  prospectPersonalText,
  renderMergeFields,
  sendWindowState,
  withOptOutLine,
  type SendWindow,
} from "./prospectMail.service";
import {
  PERSONAL_SYSTEM_PROMPT,
  buildProspectPrompt,
  draftProspectMail,
  draftProspectMailWithRetry,
  ThreadAiRefusedError,
  type ProspectDraftContext,
} from "./prospectAi.service";
import { sendInfluencerMail } from "./influencerMail.service";
import { buildProspectSendInput } from "./prospectQueue.service";
import { matchInfluencerInbound, type InfluencerMatchDeps } from "./threadStore.service";
import { replySubject, threadingHeadersFor, rfcMessageIdFor } from "./emailThread.service";
import { SesSendError, type SesEmail } from "./ses.service";
import type { IEmailThread } from "../models/EmailThread";

const JOIN = "https://subhsandesh.in/influencer";
const PRIYA = { name: "Priya Sharma", instagram: "priya.reels" };

const FIRST_NOTE = `Hi {{firstName}},

I'm Suyash, I run SubhSandesh, a small site where people make personalised pages for birthdays, anniversaries and festivals.

I came across {{instagram}} on Instagram and really liked how you tell stories with your couple videos.

Would you be open to a paid collab? Happy to share details.

${PERSONAL_OPT_OUT_LINE}`;

const plint = (s: string, b: string, kind: "initial" | "followup" | "reply" = "initial") =>
  lintOutreach(renderMergeFields(s, PRIYA), renderMergeFields(b, PRIYA), {
    commissionPercent: 30,
    template: { subject: s, body: b },
    kind,
    style: "personal",
  });

const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe("personal: the rendered email", () => {
  const sender = { fromAddress: "suyashagrahari@subhsandesh.in", fromName: "Suyash Agrahari", replyToAddress: "influencer@reply.subhsandesh.in" };
  const body = renderMergeFields(FIRST_NOTE, PRIYA);

  it("text = body + signature, nothing else (no footer, no unsubscribe, no address, no Ref)", () => {
    const t = prospectPersonalText({ body, signature: "Suyash\nSubhSandesh · subhsandesh.in" });
    assert.ok(t.startsWith("Hi Priya,"));
    assert.ok(t.endsWith("Suyash\nSubhSandesh · subhsandesh.in"));
    assert.ok(!/unsubscribe|Ref:|INF-|Ward No|You're receiving/i.test(t), t);
  });

  it("the signature takes the postal line only when asked", () => {
    assert.equal(personalSignature("Suyash", false), "Suyash");
    assert.match(personalSignature("Suyash", true), /^Suyash\nSubhSandesh, Ward No\. 06/);
  });

  it("sends as the person, plain text only, no List-Unsubscribe, Reply-To = the SES receiving address", async () => {
    const seen: SesEmail[] = [];
    const input = buildProspectSendInput(
      "personal",
      { to: "priya@x.in", subject: "quick question", body, token: "INF-7K2Q9MXA", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/u/tok" },
      sender
    );
    const r = await sendInfluencerMail(input, async (e) => {
      seen.push(e);
      return { outcome: "sent", messageId: "m-1" };
    });
    assert.equal(seen.length, 1);
    const e = seen[0];
    assert.equal(e.from, "suyashagrahari@subhsandesh.in");
    assert.equal(e.fromName, "Suyash Agrahari");
    assert.equal(e.replyTo, "Suyash Agrahari <influencer@reply.subhsandesh.in>");
    assert.equal(e.html, "", "no HTML part");
    assert.ok(!Object.keys(e.headers || {}).some((h) => /list-unsubscribe/i.test(h)), JSON.stringify(e.headers));
    assert.ok(!/INF-7K2Q9MXA|unsubscribe|Ref:/i.test(e.text), "no visible token / footer");
    assert.equal(r.fromAddress, "suyashagrahari@subhsandesh.in");
  });

  it("classic is untouched: footer, html, RFC 8058 headers, team sender", async () => {
    const seen: SesEmail[] = [];
    await sendInfluencerMail(
      buildProspectSendInput("classic", { to: "priya@x.in", subject: "x", body, token: "INF-7K2Q9MXA", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/u/tok" }),
      async (e) => {
        seen.push(e);
        return { outcome: "sent", messageId: "m-2" };
      }
    );
    assert.ok(seen[0].html && seen[0].html.length > 0);
    assert.equal(seen[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(seen[0].text, /Ref: INF-7K2Q9MXA/);
  });

  it("Reply-To falls back to the From address when no receiving address is set", () => {
    const s = personalSender("suyashagrahari@subhsandesh.in", "Suyash Agrahari", "");
    assert.equal(s.replyToAddress, "suyashagrahari@subhsandesh.in");
    assert.equal(personalSender("a@b.in", "A", "r@reply.b.in").replyToAddress, "r@reply.b.in");
  });

  it("a person's address is not a role address", () => {
    assert.ok(!isRoleAddress("suyashagrahari@subhsandesh.in"));
    for (const a of ["influencer-support@subhsandesh.in", "support@x.in", "noreply@x.in", "feedback@x.in"]) assert.ok(isRoleAddress(a), a);
  });
});

describe("personal: the follow-up continues the same thread", () => {
  it("In-Reply-To / References point at the first email and the subject is “Re: <original>”", async () => {
    const firstId = rfcMessageIdFor("0100018f-first", "us-east-1");
    const threading = threadingHeadersFor([{ direction: "outbound", rfcMessageId: firstId, rfcMessageIdSource: "reconstructed", references: [] }]);
    assert.equal(threading.inReplyTo, firstId);
    assert.match(threading.references, new RegExp(firstId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const subject = replySubject("collab idea, Priya");
    assert.equal(subject, "Re: collab idea, Priya");

    const seen: SesEmail[] = [];
    await sendInfluencerMail(
      buildProspectSendInput(
        "personal",
        { to: "priya@x.in", subject, body: "Hi Priya, just bumping this up in case it got buried. Would a paid collab interest you?", token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "", inReplyTo: threading.inReplyTo, references: threading.references },
        { fromAddress: "suyashagrahari@subhsandesh.in", fromName: "Suyash Agrahari", replyToAddress: "influencer@reply.subhsandesh.in" }
      ),
      async (e) => {
        seen.push(e);
        return { outcome: "sent", messageId: "m-3" };
      }
    );
    assert.equal(seen[0].subject, "Re: collab idea, Priya");
    assert.equal(seen[0].headers?.["In-Reply-To"], firstId);
    assert.ok(String(seen[0].headers?.References).includes(firstId));
  });

  it("a 1–2 line nudge without link or numbers passes; with a link it is blocked", () => {
    const ok = plint("Re: collab idea", "Hi {{firstName}}, just bumping this up in case it got buried. Would a paid collab interest you?", "followup");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    const bad = plint("Re: collab idea", `Hi {{firstName}}, just bumping this up. Details here: ${JOIN}`, "followup");
    assert.ok(codes(bad).includes("personal_link"));
  });
});

describe("personal: the linter profile", () => {
  it("passes a short DM-like first note", () => {
    const r = plint("collab idea, {{firstName}}", FIRST_NOTE);
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
    assert.equal(r.style, "personal");
    assert.ok(r.words >= 40 && r.words <= 90, `words ${r.words}`);
  });

  const blocked: [string, string, string, string][] = [
    ["a link", "quick question", FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`), "personal_link"],
    ["a bare domain", "quick question", FIRST_NOTE.replace("a small site", "subhsandesh.in, a small site"), "personal_link"],
    ["a percentage", "quick question", FIRST_NOTE.replace("a paid collab", "a 30% collab"), "personal_number"],
    ["rupees", "quick question", FIRST_NOTE.replace("a paid collab", "a ₹500 collab"), "personal_number"],
    ["any digit", "quick question", FIRST_NOTE.replace("a small site", "a site with 2 founders"), "personal_number"],
    ["“free”", "quick question", FIRST_NOTE.replace("a small site", "a free site"), "pitch_word"],
    ["“earn”", "quick question", FIRST_NOTE.replace("Happy to share details.", "You could earn well."), "pitch_word"],
    ["“commission”", "quick question", FIRST_NOTE.replace("a paid collab", "a commission collab"), "pitch_word"],
    ["“sign up”", "quick question", FIRST_NOTE.replace("Happy to share details.", "You can sign up quickly."), "pitch_word"],
    ["“opportunity”", "quick question", FIRST_NOTE.replace("a paid collab", "a paid opportunity"), "pitch_word"],
    ["“programme”", "quick question", FIRST_NOTE.replace("a paid collab", "our creator programme"), "pitch_word"],
    ["no question", "quick question", FIRST_NOTE.replace("Would you be open to a paid collab?", "I would love to do a paid collab with you."), "no_question"],
    ["no opt-out line", "quick question", FIRST_NOTE.replace(`\n\n${PERSONAL_OPT_OUT_LINE}`, ""), "no_opt_out"],
    ["too long", "quick question", FIRST_NOTE.replace("Happy to share details.", "Happy to share details. ".repeat(12)), "too_long"],
    ["no greeting", "quick question", FIRST_NOTE.replace("Hi {{firstName}},", "So,"), "greeting"],
    ["a one-word subject", "hello", FIRST_NOTE, "subject_words"],
    ["a long subject", "a really quick question about a paid collab", FIRST_NOTE, "subject_words"],
    ["an emoji subject", "quick question 🙂", FIRST_NOTE, "subject_emoji"],
    ["a fake Re:", "Re: quick question", FIRST_NOTE, "subject_fake_reply"],
    ["a number in the subject", "quick question 2", FIRST_NOTE, "personal_number"],
  ];
  for (const [name, s, b, code] of blocked) {
    it(`blocks ${name}`, () => {
      const r = plint(s, b);
      assert.ok(!r.ok, `${name} should block`);
      assert.ok(codes(r).includes(code), `${name}: expected ${code}, got ${codes(r).join(",")}`);
    });
  }

  it("an @handle with digits is not a number", () => {
    const r = lintOutreach(renderMergeFields("quick question", { name: "Ravi", instagram: "ravi_99" }), renderMergeFields(FIRST_NOTE, { name: "Ravi", instagram: "ravi_99" }), {
      commissionPercent: 30,
      template: { subject: "quick question", body: FIRST_NOTE },
      style: "personal",
    });
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  });

  it("after they reply, the link and the REAL % are allowed — a wrong % is not", () => {
    const reply = `Hi Priya,\n\nThanks for writing back. Here's how it works: you get your own link, and you earn 30% of every payment from people who sign up through it, paid to your UPI.\n\nYou can join here:\n${JOIN}\n\nAny questions, just reply.`;
    const ok = plint("Re: quick question", reply, "reply");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    const wrong = plint("Re: quick question", reply.replace("30%", "40%"), "reply");
    assert.ok(codes(wrong).includes("wrong_percent"));
  });

  it("classic rules are unchanged by the personal profile (a link is fine there)", () => {
    const r = lintOutreach("Your own link on SubhSandesh", renderMergeFields(FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`), PRIYA), { commissionPercent: 30 });
    assert.ok(!codes(r).includes("personal_link"));
    assert.equal(r.style, "classic");
  });

  it("the inbox check lists what makes it personal, and flags an edited-in link", () => {
    const sender = { fromAddress: "suyashagrahari@subhsandesh.in", fromName: "Suyash Agrahari" };
    const good = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint("quick question", FIRST_NOTE), sender });
    assert.ok(good.every((i) => i.ok), JSON.stringify(good));
    assert.ok(good.some((i) => /From a person: Suyash Agrahari <suyashagrahari@subhsandesh\.in>/.test(i.label)));
    assert.ok(good.some((i) => /Plain text only/.test(i.label)));
    assert.ok(good.some((i) => /No unsubscribe header/.test(i.label)));
    const withLink = FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`);
    const bad = inboxCheck({ style: "personal", kind: "initial", body: withLink, lint: plint("quick question", withLink), sender });
    assert.equal(bad.find((i) => /No links/.test(i.label))?.ok, false);
    const role = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint("quick question", FIRST_NOTE), sender: { fromAddress: "influencer-support@subhsandesh.in", fromName: "SubhSandesh Creators" } });
    assert.equal(role[0].ok, false);
  });
});

describe("personal: drafting guardrails (stubbed model)", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  const person = { name: "Priya Sharma", instagram: "priya.reels", niche: "couple comedy reels", note: "" };
  const ctx: ProspectDraftContext = { mode: "personal", style: "personal", person, programme };
  const stub = (body: string, subject = "quick question") => async () => JSON.stringify({ reading: "r", subject, body });
  const NOTE = renderMergeFields(FIRST_NOTE, PRIYA);

  it("accepts a grounded first note and uses the personal system prompt", async () => {
    let sys = "";
    const d = await draftProspectMail(ctx, async (s) => {
      sys = s;
      return JSON.stringify({ reading: "r", subject: "quick question", body: NOTE });
    });
    assert.equal(sys, PERSONAL_SYSTEM_PROMPT);
    assert.ok(d.body.startsWith("Hi Priya"));
    assert.equal(d.subject, "quick question");
  });

  it("adds the opt-out line if the model left it out", async () => {
    const d = await draftProspectMail(ctx, stub(NOTE.replace(`\n\n${PERSONAL_OPT_OUT_LINE}`, "")));
    assert.ok(d.body.endsWith(PERSONAL_OPT_OUT_LINE));
    assert.ok(hasOptOutLine(withOptOutLine("Hi")));
  });

  it("throws away a first note with a link, a number, a pitch word or a sign-off-only body", async () => {
    for (const bad of [
      NOTE.replace("Happy to share details.", `Details: ${JOIN}`),
      NOTE.replace("a paid collab", "a 30% collab"),
      NOTE.replace("a small site", "a free site"),
      NOTE.replace("Happy to share details.", "You could earn ₹5,000 a month."),
    ]) {
      await assert.rejects(draftProspectMail(ctx, stub(bad)), ThreadAiRefusedError, bad.slice(0, 80));
    }
  });

  it("retries and keeps the clean draft", async () => {
    let n = 0;
    const flaky = async () => JSON.stringify({ reading: "r", subject: "quick question", body: n++ === 0 ? NOTE.replace("a small site", "a free site") : NOTE });
    const d = await draftProspectMailWithRetry(ctx, flaky);
    assert.equal(n, 2);
    assert.ok(!/free/.test(d.body));
  });

  it("the first-touch prompt is not given the %, the link or any scheme name", () => {
    const p = buildProspectPrompt(ctx, "english");
    assert.ok(!p.includes("30%") && !p.includes(JOIN) && !/programme/i.test(p), p);
    assert.match(p, /couple comedy reels/);
    assert.match(p, /came across their page on Instagram/);
    for (const banned of ["free", "earn", "commission", "sign up", "opportunity", "guaranteed", "click here"]) {
      assert.ok(!new RegExp(`\\b${banned}\\b`, "i").test(PERSONAL_SYSTEM_PROMPT), `system prompt names “${banned}”`);
    }
  });

  it("the reply prompt does carry the real % and the join link", () => {
    const p = buildProspectPrompt({ mode: "reply", style: "personal", person, programme, messages: [{ direction: "inbound", body: "Sure, tell me more", at: new Date() }] }, "english");
    assert.match(p, /30%/);
    assert.ok(p.includes(JOIN));
  });

  it("a reply may carry the join link and the real %", async () => {
    const reply = `Hi Priya,\n\nThanks for getting back. It's simple: you get your own link, and you earn 30% of every payment from people who sign up through it, paid to your UPI.\n\nYou can join here:\n${JOIN}\n\nHappy to help if anything's unclear.`;
    const d = await draftProspectMail(
      { mode: "reply", style: "personal", person, programme, messages: [{ direction: "outbound", body: NOTE, at: new Date() }, { direction: "inbound", body: "Sure, tell me more", at: new Date() }] },
      stub(reply, "")
    );
    assert.ok(d.body.includes(JOIN));
  });

  it("a personal follow-up is short and has no link", async () => {
    const d = await draftProspectMail(
      { mode: "followup", style: "personal", person, programme, messages: [{ direction: "outbound", body: NOTE, at: new Date() }] },
      stub("Hi Priya, just bumping this up in case it got buried. Would a paid collab interest you?", "")
    );
    assert.equal(d.subject, "");
    await assert.rejects(
      draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: [{ direction: "outbound", body: NOTE, at: new Date() }] }, stub(`Hi Priya, bumping this. Join here: ${JOIN}`, "")),
      ThreadAiRefusedError
    );
  });
});

describe("personal: replies without the footer token still find their thread", () => {
  const firstId = "<0100018f-first@email.amazonses.com>";
  const PT = { _id: "pt1", kind: "prospect", userEmail: "priya@x.in", threadToken: "INF-PRSP2345", messages: [{ rfcMessageId: firstId }] } as unknown as IEmailThread;
  const deps = (): InfluencerMatchDeps => ({
    byMessageId: async (id) => (id === firstId ? PT : null),
    byToken: async () => null,
    latestForEmail: async (e) => (e === "priya@x.in" ? PT : null),
    influencerUserByEmail: async () => null,
    prospectByEmail: async () => null,
  });
  const ev = (o: Record<string, string>) => ({ fromEmail: "", subject: "Re: quick question", inReplyTo: "", references: "", messageId: "", token: "", ...o });

  it("by In-Reply-To, with no token anywhere", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya@x.in", inReplyTo: firstId }), deps());
    assert.equal(m.rung, "headers");
    assert.equal(m.thread, PT);
  });
  it("by References, even when they reply from a different address", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya.work@y.in", references: `<other@x> ${firstId}` }), deps());
    assert.equal(m.rung, "headers");
    assert.equal(m.thread, PT);
  });
  it("by the sender address when the client stripped the headers", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "Priya@X.in" }), deps());
    assert.equal(m.rung, "sender");
    assert.equal(m.thread, PT);
  });
});

describe("personal: “reply no” opt-out", () => {
  it("a bare no, and the usual ways of saying it, suppress", () => {
    for (const [body, want] of [
      ["no", "not_interested"],
      ["No.", "not_interested"],
      ["\"no\"", "not_interested"],
      ["Nope, thanks", "not_interested"],
      ["no thank you", "not_interested"],
      ["No, not interested", "not_interested"],
      ["Not interested.", "not_interested"],
      ["not for me, sorry", "not_interested"],
      ["I'm not interested", "not_interested"],
      ["I’ll pass", "not_interested"],
      ["No\n\nSent from my iPhone", "not_interested"],
      ["Remove me", "unsubscribe"],
      ["please remove me from this", "unsubscribe"],
      ["Stop emailing me", "unsubscribe"],
      ["Don't email me again", "unsubscribe"],
      ["unsubscribe", "unsubscribe"],
    ] as const) {
      assert.equal(classifyProspectReply("Re: quick question", body), want, body);
    }
  });
  it("a conversation is left for a human", () => {
    for (const body of ["No problem, tell me more!", "Yes, sounds good. What's the pay?", "Not sure — how does it work?", "Nope, I haven't heard of you. What is it?"]) {
      assert.equal(classifyProspectReply("Re: quick question", body), "reply", body);
    }
  });
});

describe("sending pattern: 09:00–21:00 IST + 2–6 min jitter", () => {
  const IST: SendWindow = { startHour: 9, endHour: 21, tzOffsetMinutes: 330 };
  const at = (iso: string) => new Date(iso);

  it("knows when the window is open, and when it next opens", () => {
    assert.deepEqual(sendWindowState(at("2026-10-16T04:00:00Z"), IST), { open: true }); // 09:30 IST
    const late = sendWindowState(at("2026-10-16T16:00:00Z"), IST); // 21:30 IST
    assert.ok(!late.open && late.opensAt.toISOString() === "2026-10-17T03:30:00.000Z", JSON.stringify(late));
    const early = sendWindowState(at("2026-10-16T02:00:00Z"), IST); // 07:30 IST
    assert.ok(!early.open && early.opensAt.toISOString() === "2026-10-16T03:30:00.000Z");
    assert.deepEqual(sendWindowState(at("2026-10-16T16:00:00Z"), { ...IST, endHour: 9 }), { open: true }, "start = end → always");
  });

  it("queues outside the window instead of sending", () => {
    const d = nextSendDecision({ sentLast24h: 0, oldestInWindow: null, lastSentAt: null, cap: 30, minGapMs: 120_000, window: IST, now: at("2026-10-16T18:00:00Z") });
    assert.ok(!d.send && d.reason === "window" && d.until.toISOString() === "2026-10-17T03:30:00.000Z");
  });

  it("waits the jittered gap drawn at the last send, not a fixed 90 s", () => {
    const now = at("2026-10-16T06:00:00Z");
    const base = { sentLast24h: 1, oldestInWindow: null, cap: 30, minGapMs: 120_000, window: IST, now };
    const d = nextSendDecision({ ...base, lastSentAt: new Date(now.getTime() - 200_000), lastGapMs: 300_000 });
    assert.ok(!d.send && d.reason === "gap" && d.until.getTime() === now.getTime() + 100_000);
    assert.deepEqual(nextSendDecision({ ...base, lastSentAt: new Date(now.getTime() - 301_000), lastGapMs: 300_000 }), { send: true });
  });

  it("gaps are drawn in [2, 6] minutes", () => {
    assert.equal(pickGapMs(120, 360, () => 0), 120_000);
    assert.equal(pickGapMs(120, 360, () => 0.999999), 360_000);
    for (let i = 0; i < 200; i++) {
      const g = pickGapMs(120, 360);
      assert.ok(g >= 120_000 && g <= 360_000, String(g));
    }
    assert.equal(pickGapMs(200, 100, () => 0.5), 200_000, "max < min → min");
  });

  it("the cap still holds, and the finish estimate skips the night", () => {
    const now = at("2026-10-16T15:00:00Z"); // 20:30 IST
    const capped = nextSendDecision({ sentLast24h: 30, oldestInWindow: at("2026-10-16T05:00:00Z"), lastSentAt: null, cap: 30, minGapMs: 120_000, window: IST, now });
    assert.ok(!capped.send && capped.reason === "cap");
    const end = estimateFinish(20, { sentLast24h: 0, oldestInWindow: null, lastSentAt: null, cap: 30, minGapMs: 120_000, avgGapMs: 240_000, window: IST, now });
    assert.ok(sendWindowState(end, IST).open, end.toISOString());
    assert.ok(end.getTime() > at("2026-10-17T03:30:00Z").getTime(), end.toISOString());
  });
});

describe("personal: SES refusing the sender is said plainly", () => {
  const AWS_TEXT =
    "User `arn:aws:iam::769638986416:user/subhsandesh-ses-sender' is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:us-east-1:769638986416:identity/subhsandesh.in'";

  it("recognises the IAM ses:FromAddress refusal — and not a configuration-set one", () => {
    assert.ok(isSenderNotAllowedError(`SES refused this send. AWS said: ${AWS_TEXT} — check that the IAM policy allows`));
    assert.ok(!isSenderNotAllowedError("User x is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:us-east-1:1:configuration-set/my-set'"));
    assert.ok(!isSenderNotAllowedError("SES is throttling — wait a moment and send again."));
  });

  it("the refusal surfaces as an error (never a silent success, never another sender)", async () => {
    const tried: string[] = [];
    const refuse = async (e: SesEmail) => {
      tried.push(String(e.from));
      throw new SesSendError(`SES refused this send. AWS said: ${AWS_TEXT}`);
    };
    await assert.rejects(
      sendInfluencerMail(
        buildProspectSendInput(
          "personal",
          { to: "priya@x.in", subject: "quick question", body: "Hi", token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "" },
          { fromAddress: "suyashagrahari@subhsandesh.in", fromName: "Suyash Agrahari", replyToAddress: "influencer@reply.subhsandesh.in" }
        ),
        refuse
      ),
      (err: unknown) => err instanceof SesSendError && isSenderNotAllowedError((err as Error).message)
    );
    assert.deepEqual(tried, ["suyashagrahari@subhsandesh.in"], "exactly one attempt, from the person");
    const msg = personalSenderBlockedMessage("suyashagrahari@subhsandesh.in");
    assert.match(msg, /Personal sender isn't allowed yet/);
    assert.match(msg, /add-personal-sender\.sh/);
    assert.match(msg, /Nothing was sent from another address/);
  });
});
