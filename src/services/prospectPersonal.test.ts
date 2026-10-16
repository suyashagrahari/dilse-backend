// ─── Personal (team-note) mode: what makes a first email land in Primary ────
//
// No Mongo, no SES, no OpenAI: the model is a stub, the transport records what
// it was given. Real email is never sent from here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyProspectReply,
  estimateFinish,
  fallbackSubject,
  hasOptOutLine,
  inboxCheck,
  isRoleAddress,
  isSenderNotAllowedError,
  isTrustworthySender,
  lintOutreach,
  nextSendDecision,
  personalLinkAllowed,
  personalSender,
  personalSenderBlockedMessage,
  personalSignature,
  pickGapMs,
  prospectPersonalText,
  renderMergeFields,
  sendWindowState,
  stripOptOutLines,
  subjectIssues,
  type SendWindow,
} from "./prospectMail.service";
import {
  PERSONAL_SYSTEM_PROMPT,
  PROSPECT_SYSTEM_PROMPT,
  buildProspectPrompt,
  draftProspectAlternatives,
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
import { PROSPECT_TEAM_DEFAULTS, env } from "../config/env";
import type { IEmailThread } from "../models/EmailThread";

const JOIN = "https://subhsandesh.in/influencer";
const PRIYA = { name: "Priya Sharma", instagram: "priya.reels" };
const TEAM = { fromAddress: "team@subhsandesh.in", fromName: "SubhSandesh Team", replyToAddress: "influencer@reply.subhsandesh.in" };
const SUBJ = "Collab idea for {{instagram}}";

const FIRST_NOTE = `Hi {{firstName}},

We came across {{instagram}} on Instagram and really liked how you tell stories with your couple videos.

We're the team behind SubhSandesh, a small site where people make interactive greeting and love pages and send them as a link, for birthdays, anniversaries and proposals.

Would you be open to a paid collab? It could be a reel with one of our pages. Happy to share details.`;

const NUDGE = "Hi {{firstName}}, we know inboxes get busy, so just floating our note back up. We'd still love to make a reel together with one of our pages. Would a paid collab interest you?";

const plint = (s: string, b: string, kind: "initial" | "followup" | "fresh" | "reply" = "initial", priorFollowups = 0) =>
  lintOutreach(renderMergeFields(s, PRIYA), renderMergeFields(b, PRIYA), {
    commissionPercent: 30,
    template: { subject: s, body: b },
    kind,
    style: "personal",
    priorFollowups,
  });

const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe("team sender: SubhSandesh Team <team@subhsandesh.in>", () => {
  const body = renderMergeFields(FIRST_NOTE, PRIYA);

  it("defaults: the team's address, name and one-line signature — no person", () => {
    assert.deepEqual(PROSPECT_TEAM_DEFAULTS, { fromAddress: "team@subhsandesh.in", fromName: "SubhSandesh Team", signature: "Team SubhSandesh" });
    if (!process.env.PROSPECT_PERSONAL_FROM_EMAIL) assert.equal(env.PROSPECT_PERSONAL_FROM_EMAIL, "team@subhsandesh.in");
    if (!process.env.PROSPECT_PERSONAL_FROM_NAME) assert.equal(env.PROSPECT_PERSONAL_FROM_NAME, "SubhSandesh Team");
    if (!process.env.PROSPECT_PERSONAL_SIGNATURE) assert.equal(env.PROSPECT_PERSONAL_SIGNATURE, "Team SubhSandesh");
    if (!process.env.PROSPECT_FROM_NAME) assert.equal(env.PROSPECT_FROM_NAME, "SubhSandesh Team");
    if (!process.env.PROSPECT_SIGNATURE_SITE_LINE) assert.equal(env.PROSPECT_SIGNATURE_SITE_LINE, false);
    assert.ok(!/suyash/i.test(JSON.stringify(PROSPECT_TEAM_DEFAULTS)));
  });

  it("the signature is one line; the site line and postal line only when asked", () => {
    assert.equal(personalSignature("Team SubhSandesh", false, false), "Team SubhSandesh");
    assert.equal(personalSignature("Team SubhSandesh", false, true), "Team SubhSandesh\nsubhsandesh.in");
    assert.match(personalSignature("Team SubhSandesh", true, false), /^Team SubhSandesh\nSubhSandesh, Ward No\. 06/);
  });

  it("text = body + signature, nothing else (no footer, no unsubscribe, no address, no Ref)", () => {
    const t = prospectPersonalText({ body, signature: "Team SubhSandesh" });
    assert.ok(t.startsWith("Hi Priya,"));
    assert.ok(t.endsWith("\n\nTeam SubhSandesh"));
    assert.ok(!/unsubscribe|Ref:|INF-|Ward No|You're receiving|reply\s+"?no/i.test(t), t);
  });

  it("sends as the team, plain text only, no List-Unsubscribe, Reply-To = the SES receiving address", async () => {
    const seen: SesEmail[] = [];
    const input = buildProspectSendInput(
      "personal",
      { to: "priya@x.in", subject: "Collab idea for @priya.reels", body, token: "INF-7K2Q9MXA", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/u/tok" },
      TEAM
    );
    const r = await sendInfluencerMail(input, async (e) => {
      seen.push(e);
      return { outcome: "sent", messageId: "m-1" };
    });
    assert.equal(seen.length, 1);
    const e = seen[0];
    assert.equal(e.from, "team@subhsandesh.in");
    assert.equal(e.fromName, "SubhSandesh Team");
    assert.equal(e.replyTo, "SubhSandesh Team <influencer@reply.subhsandesh.in>");
    assert.equal(e.html, "", "no HTML part");
    assert.ok(!Object.keys(e.headers || {}).some((h) => /list-unsubscribe/i.test(h)), JSON.stringify(e.headers));
    assert.ok(!/INF-7K2Q9MXA|unsubscribe|Ref:|<img|https?:\/\//i.test(e.text), "no visible token / footer / image / link");
    assert.equal(r.fromAddress, "team@subhsandesh.in");
  });

  it("classic is untouched: footer, html, RFC 8058 headers", async () => {
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
    assert.equal(personalSender("team@subhsandesh.in", "SubhSandesh Team", "").replyToAddress, "team@subhsandesh.in");
    assert.equal(personalSender("a@b.in", "A", "r@reply.b.in").replyToAddress, "r@reply.b.in");
  });

  it("team@ is a trustworthy sender; no-reply and foreign domains are not", () => {
    assert.ok(isTrustworthySender(TEAM));
    assert.ok(!isTrustworthySender({ fromAddress: "noreply@subhsandesh.in", fromName: "SubhSandesh" }));
    assert.ok(!isTrustworthySender({ fromAddress: "team@gmail.com", fromName: "SubhSandesh Team" }));
    assert.ok(!isTrustworthySender({ fromAddress: "team@subhsandesh.in", fromName: "" }));
    assert.ok(isRoleAddress("noreply@x.in"));
  });
});

describe("follow-ups stay in the same thread", () => {
  it("In-Reply-To / References point at the first email and the subject is “Re: <original>”", async () => {
    const firstId = rfcMessageIdFor("0100018f-first", "us-east-1");
    const threading = threadingHeadersFor([{ direction: "outbound", rfcMessageId: firstId, rfcMessageIdSource: "reconstructed", references: [] }]);
    assert.equal(threading.inReplyTo, firstId);
    assert.match(threading.references, new RegExp(firstId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const subject = replySubject("Collab idea for @priya.reels");
    assert.equal(subject, "Re: Collab idea for @priya.reels");

    const seen: SesEmail[] = [];
    await sendInfluencerMail(
      buildProspectSendInput(
        "personal",
        { to: "priya@x.in", subject, body: renderMergeFields(NUDGE, PRIYA), token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "", inReplyTo: threading.inReplyTo, references: threading.references },
        TEAM
      ),
      async (e) => {
        seen.push(e);
        return { outcome: "sent", messageId: "m-3" };
      }
    );
    assert.equal(seen[0].subject, "Re: Collab idea for @priya.reels");
    assert.equal(seen[0].headers?.["In-Reply-To"], firstId);
    assert.ok(String(seen[0].headers?.References).includes(firstId));
  });

  it("follow-up #1: a 25–60 word nudge, no link; from #2 on one subhsandesh.in link is fine", () => {
    const ok = plint("Re: Collab idea", NUDGE, "followup");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    assert.ok(ok.words >= 25 && ok.words <= 60, `words ${ok.words}`);
    const withLink = NUDGE.replace("Would a paid collab", `Here's our creator page:\n${JOIN}\n\nWould a paid collab`);
    assert.ok(codes(plint("Re: Collab idea", withLink, "followup", 0)).includes("personal_link"), "first follow-up: no link");
    assert.deepEqual(plint("Re: Collab idea", withLink, "followup", 1).errors, [], "second follow-up: one link ok");
    assert.ok(codes(plint("Re: Collab idea", withLink.replace(JOIN, "https://example.com/x"), "followup", 1)).includes("foreign_link"));
    assert.ok(codes(plint("Re: Collab idea", `${withLink}\nhttps://subhsandesh.in/templates`, "followup", 1)).includes("too_many_links"));
    assert.equal(personalLinkAllowed("initial"), false);
    assert.equal(personalLinkAllowed("followup", 0), false);
    assert.equal(personalLinkAllowed("followup", 2), true);
    assert.equal(personalLinkAllowed("fresh"), true);
  });

  it("a new email (fresh) needs its own meaningful subject — never “Re:”", () => {
    const body = "Hi {{firstName}},\n\nWe wrote a little while back about a collab. One idea: a reel where one of you surprises the other with an anniversary page on camera.\n\nWould you be open to a paid collab like that?";
    assert.deepEqual(plint("Another collab idea for {{instagram}}", body, "fresh").errors, []);
    assert.ok(codes(plint("Re: Collab idea", body, "fresh")).includes("subject_fake_reply"));
  });
});

describe("meaningful subjects", () => {
  it("4–8 specific words pass", () => {
    for (const s of ["Collab idea for @theecouple__", "SubhSandesh x Om & Diya — a paid collab?", "A creator collab with SubhSandesh"]) {
      assert.deepEqual(subjectIssues(s), [], s);
    }
  });
  const bad: [string, string][] = [
    ["quick question", "subject_generic"],
    ["Quick question about a collab", "subject_generic"],
    ["hi", "subject_generic"],
    ["Hello", "subject_generic"],
    ["collab", "subject_generic"],
    ["Collab idea", "subject_words"],
    ["A very long subject line that goes on about our collab", "subject_words"],
    ["Earn with a creator collab", "subject_spam"],
    ["A free creator collab for you", "subject_spam"],
    ["An offer for a creator collab", "subject_spam"],
    ["Paid collab — 30% for you", "subject_spam"],
    ["A ₹500 creator collab idea", "subject_spam"],
    ["Big opportunity with SubhSandesh today", "subject_spam"],
    ["Guaranteed money from your reels", "subject_spam"],
    ["Collab idea for you today!", "subject_bang"],
    ["Collab idea for you today 🙂", "subject_emoji"],
    ["Re: collab idea for you", "subject_fake_reply"],
  ];
  for (const [s, code] of bad) {
    it(`refuses “${s}” (${code})`, () => {
      assert.ok(subjectIssues(s).some((i) => i.code === code), `${s}: ${JSON.stringify(subjectIssues(s))}`);
    });
  }
  it("ALL CAPS in the subject is refused by the linter", () => {
    assert.ok(codes(plint("A CREATOR collab with SubhSandesh", FIRST_NOTE)).includes("all_caps"));
  });
  it("the fallback names the creator when it can, and always passes", () => {
    assert.equal(fallbackSubject({ kind: "initial", person: { name: "Om & Diya", instagram: "theecouple__" } }), "Collab idea for @theecouple__");
    assert.equal(fallbackSubject({ kind: "initial", person: { name: "Om & Diya", instagram: "" } }), "SubhSandesh x Om & Diya — a paid collab?");
    assert.equal(fallbackSubject({ kind: "initial", person: { name: "Om & Diya", instagram: "theecouple__" }, variant: 1 }), "SubhSandesh x Om & Diya — a paid collab?");
    assert.equal(fallbackSubject({ kind: "initial" }), "A creator collab with SubhSandesh");
    assert.equal(fallbackSubject({ kind: "fresh", person: { name: "Priya", instagram: "priya.reels" } }), "Another collab idea for @priya.reels");
    for (const s of [
      fallbackSubject({ kind: "initial", person: { name: "A Very Long Name Of Several Words", instagram: "" } }),
      fallbackSubject({ kind: "fresh" }),
      fallbackSubject({ kind: "initial", person: { name: "Ravi 2", instagram: "" } }),
    ]) {
      assert.deepEqual(subjectIssues(s), [], s);
    }
  });
});

describe("no “reply no” opt-out line", () => {
  it("a first note passes WITHOUT any opt-out line", () => {
    const r = plint(SUBJ, FIRST_NOTE);
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
    assert.equal(r.style, "personal");
    assert.ok(r.words >= 50 && r.words <= 110, `words ${r.words}`);
    assert.ok(!hasOptOutLine(FIRST_NOTE));
  });
  it("an opt-out line is refused in team notes", () => {
    for (const line of [
      "If it's not for you, just reply \"no\" and I won't email again.",
      "Just reply stop and we won't contact you again.",
      "You can unsubscribe any time.",
      "If not, simply reply no.",
    ]) {
      const r = plint(SUBJ, `${FIRST_NOTE}\n\n${line}`);
      assert.ok(codes(r).includes("opt_out_line"), `${line}: ${codes(r).join(",")}`);
    }
  });
  it("stripOptOutLines drops only that line", () => {
    const b = `${FIRST_NOTE}\n\nIf it's not for you, just reply "no" and we won't email again.`;
    assert.equal(stripOptOutLines(b), FIRST_NOTE);
    assert.equal(stripOptOutLines(FIRST_NOTE), FIRST_NOTE);
  });
  it("a “no” reply still suppresses silently", () => {
    assert.equal(classifyProspectReply("Re: Collab idea for @priya.reels", "No thanks"), "not_interested");
    assert.equal(classifyProspectReply("Re: Collab idea for @priya.reels", "Please stop emailing me"), "unsubscribe");
  });
});

describe("personal: the linter profile", () => {
  const blocked: [string, string, string, string][] = [
    ["a link", SUBJ, FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`), "personal_link"],
    ["a bare domain", SUBJ, FIRST_NOTE.replace("a small site", "subhsandesh.in, a small site"), "personal_link"],
    ["a percentage", SUBJ, FIRST_NOTE.replace("a paid collab", "a 30% collab"), "personal_number"],
    ["rupees", SUBJ, FIRST_NOTE.replace("a paid collab", "a ₹500 collab"), "personal_number"],
    ["any digit", SUBJ, FIRST_NOTE.replace("a small site", "a site with 2 founders"), "personal_number"],
    ["“free”", SUBJ, FIRST_NOTE.replace("a small site", "a free site"), "pitch_word"],
    ["“earn”", SUBJ, FIRST_NOTE.replace("Happy to share details.", "You could earn well."), "pitch_word"],
    ["“commission”", SUBJ, FIRST_NOTE.replace("a paid collab", "a commission collab"), "pitch_word"],
    ["“sign up”", SUBJ, FIRST_NOTE.replace("Happy to share details.", "You can sign up quickly."), "pitch_word"],
    ["“opportunity”", SUBJ, FIRST_NOTE.replace("a paid collab", "a paid opportunity"), "pitch_word"],
    ["“programme”", SUBJ, FIRST_NOTE.replace("a paid collab", "our creator programme"), "pitch_word"],
    ["no question", SUBJ, FIRST_NOTE.replace("Would you be open to a paid collab?", "We would love to do a paid collab with you."), "no_question"],
    ["too long", SUBJ, FIRST_NOTE.replace("Happy to share details.", "Happy to share details. ".repeat(20)), "too_long"],
    ["no greeting", SUBJ, FIRST_NOTE.replace("Hi {{firstName}},", "So,"), "greeting"],
    ["a generic subject", "quick question", FIRST_NOTE, "subject_generic"],
    ["a one-word subject", "hello", FIRST_NOTE, "subject_words"],
    ["a long subject", "a really long subject line about a paid collab with you", FIRST_NOTE, "subject_words"],
    ["an emoji subject", "Collab idea for you 🙂 today", FIRST_NOTE, "subject_emoji"],
    ["a fake Re:", "Re: collab idea for you", FIRST_NOTE, "subject_fake_reply"],
    ["a number in the subject", "Collab idea number 2 for you", FIRST_NOTE, "personal_number"],
  ];
  for (const [name, s, b, code] of blocked) {
    it(`blocks ${name}`, () => {
      const r = plint(s, b);
      assert.ok(!r.ok, `${name} should block`);
      assert.ok(codes(r).includes(code), `${name}: expected ${code}, got ${codes(r).join(",")}`);
    });
  }

  it("an @handle with digits or a dot-domain is neither a number nor a link", () => {
    for (const ig of ["ravi_99", "theecouple.in"]) {
      const t = { name: "Ravi", instagram: ig };
      const r = lintOutreach(renderMergeFields(SUBJ, t), renderMergeFields(FIRST_NOTE, t), {
        commissionPercent: 30,
        template: { subject: SUBJ, body: FIRST_NOTE },
        style: "personal",
      });
      assert.deepEqual(r.errors, [], `${ig}: ${JSON.stringify(r.errors)}`);
    }
  });

  it("after they reply, the link and the REAL % are allowed — a wrong % is not", () => {
    const reply = `Hi Priya,\n\nThanks for writing back. Here's how it works: you get your own link, and you earn 30% of every payment from people who sign up through it, paid to your UPI.\n\nYou can join here:\n${JOIN}\n\nAny questions, just reply.`;
    const ok = plint("Re: Collab idea for @priya.reels", reply, "reply");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    const wrong = plint("Re: Collab idea for @priya.reels", reply.replace("30%", "40%"), "reply");
    assert.ok(codes(wrong).includes("wrong_percent"));
  });

  it("classic rules are unchanged by the personal profile (a link is fine there)", () => {
    const r = lintOutreach("Your own link on SubhSandesh", renderMergeFields(FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`), PRIYA), { commissionPercent: 30 });
    assert.ok(!codes(r).includes("personal_link"));
    assert.equal(r.style, "classic");
  });

  it("the inbox check states the real rules, and flags what breaks them", () => {
    const good = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint(SUBJ, FIRST_NOTE), sender: TEAM, subject: "Collab idea for @priya.reels" });
    assert.ok(good.every((i) => i.ok), JSON.stringify(good));
    const labels = good.map((i) => i.label).join(" | ");
    for (const want of ["From SubhSandesh Team <team@subhsandesh.in>", "Plain text", "No unsubscribe header", "No links in the first email", "Meaningful subject"]) {
      assert.ok(labels.includes(want), `${want} in ${labels}`);
    }
    assert.ok(!/person/i.test(labels), "no 'from a person' claim");
    const withLink = FIRST_NOTE.replace("Happy to share details.", `Details: ${JOIN}`);
    const bad = inboxCheck({ style: "personal", kind: "initial", body: withLink, lint: plint("quick question", withLink), sender: TEAM });
    assert.equal(bad.find((i) => /No links/.test(i.label))?.ok, false);
    assert.equal(bad.find((i) => /Meaningful subject/.test(i.label))?.ok, false);
    const fu = inboxCheck({ style: "personal", kind: "followup", body: NUDGE, lint: plint("Re: Collab idea", NUDGE, "followup"), sender: TEAM, subject: "Re: Collab idea" });
    assert.ok(fu.find((i) => /same thread/.test(i.label))?.ok);
    const noreply = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint(SUBJ, FIRST_NOTE), sender: { fromAddress: "noreply@subhsandesh.in", fromName: "SubhSandesh" } });
    assert.equal(noreply[0].ok, false);
  });
});

describe("drafting as the team (stubbed model)", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  const person = { name: "Priya Sharma", instagram: "priya.reels", niche: "couple comedy reels", note: "" };
  const ctx: ProspectDraftContext = { mode: "personal", style: "personal", person, programme };
  const stub = (body: string, subject = "Collab idea for @priya.reels") => async () => JSON.stringify({ reading: "r", subject, body });
  const NOTE = renderMergeFields(FIRST_NOTE, PRIYA);

  it("accepts a grounded first note and uses the team system prompt", async () => {
    let sys = "";
    const d = await draftProspectMail(ctx, async (s) => {
      sys = s;
      return JSON.stringify({ reading: "r", subject: "Collab idea for @priya.reels", body: NOTE });
    });
    assert.equal(sys, PERSONAL_SYSTEM_PROMPT);
    assert.ok(d.body.startsWith("Hi Priya"));
    assert.equal(d.subject, "Collab idea for @priya.reels");
    assert.ok(!d.subjectFallback);
  });

  it("both prompts write as the team, never as Suyash or “I”", () => {
    for (const p of [PERSONAL_SYSTEM_PROMPT, PROSPECT_SYSTEM_PROMPT]) {
      assert.match(p, /as the team — "we", "our team"/);
      assert.ok(!/suyash/i.test(p), "no person named");
      assert.match(p, /Team SubhSandesh/);
    }
    assert.ok(!/suyash/i.test(buildProspectPrompt({ ...ctx, adminNote: "mention Diwali" }, "english")));
  });

  it("drops an opt-out line the model added, keeps the rest", async () => {
    const d = await draftProspectMail(ctx, stub(`${NOTE}\n\nIf it's not for you, just reply "no" and we won't email again.`));
    assert.equal(d.body, NOTE);
    assert.ok(!hasOptOutLine(d.body));
  });

  it("replaces a weak subject with the deterministic one", async () => {
    for (const weak of ["quick question", "collab idea", "Hi!", "Earn with SubhSandesh now", ""]) {
      const d = await draftProspectMail(ctx, stub(NOTE, weak));
      assert.equal(d.subject, "Collab idea for @priya.reels", weak);
      assert.equal(d.subjectFallback, true);
    }
  });

  it("throws away a first note with a link, a number, a pitch word", async () => {
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
    const flaky = async () => JSON.stringify({ reading: "r", subject: "Collab idea for @priya.reels", body: n++ === 0 ? NOTE.replace("a small site", "a free site") : NOTE });
    const d = await draftProspectMailWithRetry(ctx, flaky);
    assert.equal(n, 2);
    assert.ok(!/free/.test(d.body));
  });

  it("two angles in one Generate", async () => {
    const prompts: string[] = [];
    const ds = await draftProspectAlternatives(ctx, async (_s, u) => {
      prompts.push(u);
      return JSON.stringify({ reading: "r", subject: "Collab idea for @priya.reels", body: NOTE });
    });
    assert.deepEqual(ds.map((d) => d.angle).sort(), ["a", "b"]);
    assert.ok(prompts.some((p) => /ANGLE A/.test(p)) && prompts.some((p) => /ANGLE B/.test(p)));
    let k = 0;
    const oneBad = await draftProspectAlternatives(ctx, async () => JSON.stringify({ reading: "r", subject: "x", body: k++ % 2 ? NOTE : NOTE.replace("a small site", "a free site") }));
    assert.ok(oneBad.length >= 1, "one good draft is enough");
  });

  it("the first-touch prompt is not given the %, the link or any scheme name — and asks for 50–110 words", () => {
    const p = buildProspectPrompt(ctx, "english");
    assert.ok(!p.includes("30%") && !p.includes(JOIN) && !/programme/i.test(p), p);
    assert.match(p, /couple comedy reels/);
    assert.match(p, /came across their page on Instagram/);
    assert.match(p, /50 to 110 words/);
    assert.match(p, /interactive greeting and love pages/);
    for (const banned of ["free", "earn", "commission", "sign up", "opportunity", "guaranteed", "click here", "unsubscribe", "reply no"]) {
      assert.ok(!new RegExp(`\\b${banned}\\b`, "i").test(PERSONAL_SYSTEM_PROMPT), `system prompt names “${banned}”`);
    }
  });

  it("a note in Hindi content asks for a light Hinglish touch; a couple is greeted together", () => {
    const p = buildProspectPrompt({ ...ctx, person: { name: "Om & Diya", instagram: "theecouple__", niche: "", note: "Hindi couple reels, 40k followers" } }, "english");
    assert.match(p, /Hinglish/);
    assert.match(p, /Hi Om and Diya,/);
  });

  it("follow-up #1 gets no link in its facts; #2 may", () => {
    const fu = (n: number): ProspectDraftContext => ({ mode: "followup", style: "personal", person, programme, priorFollowups: n, messages: [{ direction: "outbound", body: NOTE, at: new Date() }] });
    assert.ok(!buildProspectPrompt(fu(0), "english").includes(JOIN));
    assert.ok(buildProspectPrompt(fu(1), "english").includes(JOIN));
    assert.match(buildProspectPrompt(fu(0), "english"), /25 to 60 words/);
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

  it("a personal follow-up is short; #1 without a link, #2 may have one; a new email keeps its subject", async () => {
    const msgs = [{ direction: "outbound" as const, body: NOTE, at: new Date() }];
    const nudge = renderMergeFields(NUDGE, PRIYA);
    const d = await draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: msgs }, stub(nudge, ""));
    assert.equal(d.subject, "");
    const linked = nudge.replace("Would a paid collab", `Our creator page:\n${JOIN}\n\nWould a paid collab`);
    await assert.rejects(draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: msgs }, stub(linked, "")), ThreadAiRefusedError);
    const ok2 = await draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: msgs, priorFollowups: 1 }, stub(linked, ""));
    assert.ok(ok2.body.includes(JOIN));
    const freshBody = "Hi Priya,\n\nWe wrote a little while back about a collab. One idea: a reel where one of you surprises the other with an anniversary page on camera.\n\nWould you be open to a paid collab like that?";
    const fr = await draftProspectMail({ mode: "fresh", style: "personal", person, programme, messages: msgs }, stub(freshBody, "A reel idea for Priya Sharma"));
    assert.equal(fr.subject, "A reel idea for Priya Sharma");
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
  const ev = (o: Record<string, string>) => ({ fromEmail: "", subject: "Re: Collab idea for @priya.reels", inReplyTo: "", references: "", messageId: "", token: "", ...o });

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

describe("silent opt-out: a short “no” / “stop” reply suppresses", () => {
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
      assert.equal(classifyProspectReply("Re: Collab idea for @priya.reels", body), want, body);
    }
  });
  it("a conversation is left for a human", () => {
    for (const body of ["No problem, tell me more!", "Yes, sounds good. What's the pay?", "Not sure — how does it work?", "Nope, I haven't heard of you. What is it?"]) {
      assert.equal(classifyProspectReply("Re: Collab idea for @priya.reels", body), "reply", body);
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

describe("instant mode: Send means now", () => {
  const IST: SendWindow = { startHour: 9, endHour: 21, tzOffsetMinutes: 330 };
  const at = (iso: string) => new Date(iso);

  it("sends at 2 am IST and straight after the last send, ignoring window and gap", () => {
    const now = at("2026-10-16T20:30:00Z"); // 02:00 IST
    const d = nextSendDecision({ sentLast24h: 5, oldestInWindow: null, lastSentAt: new Date(now.getTime() - 1_000), lastGapMs: 300_000, cap: 200, minGapMs: 120_000, window: IST, instant: true, now });
    assert.deepEqual(d, { send: true });
  });

  it("still stops at the daily cap", () => {
    const now = at("2026-10-16T20:30:00Z");
    const d = nextSendDecision({ sentLast24h: 200, oldestInWindow: at("2026-10-16T05:00:00Z"), lastSentAt: null, cap: 200, minGapMs: 120_000, window: IST, instant: true, now });
    assert.ok(!d.send && d.reason === "cap");
  });

  it("estimates a batch finishing within seconds, not hours", () => {
    const now = at("2026-10-16T20:30:00Z");
    const end = estimateFinish(10, { sentLast24h: 0, oldestInWindow: null, lastSentAt: null, cap: 200, minGapMs: 120_000, avgGapMs: 240_000, window: IST, instant: true, now });
    assert.ok(end.getTime() - now.getTime() <= 60_000, end.toISOString());
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
          { to: "priya@x.in", subject: "Collab idea for @priya.reels", body: "Hi", token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "" },
          TEAM
        ),
        refuse
      ),
      (err: unknown) => err instanceof SesSendError && isSenderNotAllowedError((err as Error).message)
    );
    assert.deepEqual(tried, ["team@subhsandesh.in"], "exactly one attempt, from the team address");
    const msg = personalSenderBlockedMessage("team@subhsandesh.in");
    assert.match(msg, /Sender isn't allowed yet: SES refused to send as team@subhsandesh\.in/);
    assert.match(msg, /add-personal-sender\.sh/);
    assert.match(msg, /Nothing was sent from another address/);
  });
});

describe("template follow-ups greet by {{firstName}}", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  it("a name copied from the quoted email is turned back into {{firstName}}; the prompt quotes it neutrally", async () => {
    const ctx: ProspectDraftContext = { mode: "followup", style: "personal", recipients: 3, programme, firstEmail: renderMergeFields(FIRST_NOTE, PRIYA) };
    assert.ok(!buildProspectPrompt(ctx, "english").includes("Hi Priya,"));
    const d = await draftProspectMail(ctx, async () => JSON.stringify({ reading: "r", subject: "", body: renderMergeFields(NUDGE, PRIYA).replace("Hi Priya, we", "Hi Priya,\n\nWe") }));
    assert.ok(d.body.startsWith("Hi {{firstName}},"), d.body);
  });
});
