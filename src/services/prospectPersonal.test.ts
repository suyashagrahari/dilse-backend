// ─── Personal mode: a note from Yash that lands in Primary ──────────────────
//
// No Mongo, no SES, no OpenAI: the model is a stub, the transport records what
// it was given. Real email is never sent from here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_PITCH_WORDS,
  classifyProspectReply,
  estimateFinish,
  fallbackSubject,
  greetingNames,
  hasOptOutLine,
  inboxCheck,
  introducesWriter,
  isRoleAddress,
  isSenderNotAllowedError,
  isTrustworthySender,
  lintOutreach,
  nextSendDecision,
  personalLinkAllowed,
  personalSender,
  personalSenderBlockedMessage,
  personalSignature,
  personalWriterName,
  pickGapMs,
  prospectPersonalText,
  quietLaneItem,
  renderMergeFields,
  sendWindowState,
  stripOptOutLines,
  subjectIssues,
  type SendWindow,
} from "./prospectMail.service";
import {
  PROSPECT_SYSTEM_PROMPT,
  buildProspectPrompt,
  draftProspectAlternatives,
  draftProspectMail,
  draftProspectMailWithRetry,
  personalSystemPrompt,
  ThreadAiRefusedError,
  type ProspectDraftContext,
} from "./prospectAi.service";
import { sendInfluencerMail } from "./influencerMail.service";
import { _resetQueueStateForTests, buildProspectSendInput, noteQuietLane, quietLaneStatus } from "./prospectQueue.service";
import { matchInfluencerInbound, type InfluencerMatchDeps } from "./threadStore.service";
import { replySubject, threadingHeadersFor, rfcMessageIdFor } from "./emailThread.service";
import { SesSendError, configurationSetErrorCode, isConfigurationSetUnavailable, type SesEmail } from "./ses.service";
import { PROSPECT_PERSONAL_DEFAULTS, PROSPECT_TEAM_DEFAULTS, env } from "../config/env";
import type { IEmailThread } from "../models/EmailThread";

const JOIN = "https://subhsandesh.in/influencer";
const PRIYA = { name: "Priya Sharma", instagram: "priya.reels" };
const YASH = { fromAddress: "yash@subhsandesh.in", fromName: "Yash from SubhSandesh", replyToAddress: "influencer@reply.subhsandesh.in" };
const SUBJ = "Loved your couple reels";

const FIRST_NOTE = `Hey {{firstName}},

I'm Yash from SubhSandesh. I came across {{instagram}} on Instagram and really liked how you tell little stories in your couple videos.

We make small interactive pages people send their partner — birthday surprises, miss-you notes, proposals.

Would you be up for making a reel together with one of them? Happy to pay for it, of course.`;

const NUDGE = "Hey {{firstName}}, I know inboxes get busy, so just bringing my note back up. I'd still love to make a reel together with one of our pages. Would you be up for it?";

const plint = (s: string, b: string, kind: "initial" | "followup" | "fresh" | "reply" = "initial", priorFollowups = 0) =>
  lintOutreach(renderMergeFields(s, PRIYA), renderMergeFields(b, PRIYA), {
    commissionPercent: 30,
    template: { subject: s, body: b },
    kind,
    style: "personal",
    priorFollowups,
    writer: "Yash",
  });

const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe("sender: Yash from SubhSandesh <yash@subhsandesh.in>", () => {
  const body = renderMergeFields(FIRST_NOTE, PRIYA);

  it("defaults: Yash's address, name and signature; classic keeps the team", () => {
    assert.deepEqual(PROSPECT_PERSONAL_DEFAULTS, {
      fromAddress: "yash@subhsandesh.in",
      fromName: "Yash from SubhSandesh",
      signature: "Yash",
      companyLine: "SubhSandesh",
      configurationSet: "outreach",
    });
    assert.deepEqual(PROSPECT_TEAM_DEFAULTS, { fromAddress: "team@subhsandesh.in", fromName: "SubhSandesh Team", signature: "Team SubhSandesh" });
    if (!process.env.PROSPECT_PERSONAL_FROM_EMAIL) assert.equal(env.PROSPECT_PERSONAL_FROM_EMAIL, "yash@subhsandesh.in");
    if (!process.env.PROSPECT_PERSONAL_FROM_NAME) assert.equal(env.PROSPECT_PERSONAL_FROM_NAME, "Yash from SubhSandesh");
    if (!process.env.PROSPECT_PERSONAL_SIGNATURE) assert.equal(env.PROSPECT_PERSONAL_SIGNATURE, "Yash");
    if (!process.env.PROSPECT_SIGNATURE_COMPANY_LINE) assert.equal(env.PROSPECT_SIGNATURE_COMPANY_LINE, true);
    if (!process.env.PROSPECT_SIGNATURE_SITE_LINE) assert.equal(env.PROSPECT_SIGNATURE_SITE_LINE, false);
    if (!process.env.PROSPECT_SES_CONFIGURATION_SET) assert.equal(env.PROSPECT_SES_CONFIGURATION_SET, "outreach");
    if (!process.env.PROSPECT_FROM_NAME) assert.equal(env.PROSPECT_FROM_NAME, "SubhSandesh Team");
  });

  it("the signature is “Yash” + a plain “SubhSandesh” line; no URL unless asked", () => {
    assert.equal(personalSignature("Yash", false, false, true), "Yash\nSubhSandesh");
    assert.equal(personalSignature("Yash", false, false, false), "Yash");
    assert.equal(personalSignature("Yash", false, true, true), "Yash\nSubhSandesh\nsubhsandesh.in");
    assert.equal(personalSignature("Yash from SubhSandesh", false, false, true), "Yash from SubhSandesh", "no doubled company");
    assert.match(personalSignature("Yash", true, false, true), /^Yash\nSubhSandesh\nSubhSandesh, Ward No\. 06/);
    assert.ok(!/https?:|\.in\b/.test(personalSignature("Yash", false, false, true)));
  });

  it("the writer is the signature's first name; a team signature has none", () => {
    assert.equal(personalWriterName("Yash"), "Yash");
    assert.equal(personalWriterName("yash\nSubhSandesh"), "Yash");
    assert.equal(personalWriterName("Team SubhSandesh"), "");
    assert.ok(introducesWriter("Hey Priya,\n\nI'm Yash from SubhSandesh.", "Yash"));
    assert.ok(introducesWriter("Hey Priya,\n\nYash here, from SubhSandesh.", "Yash"));
    assert.ok(introducesWriter("Hey Priya,\n\nThis is Yash.", "Yash"));
    assert.ok(!introducesWriter("Hey Priya,\n\nWe are SubhSandesh.", "Yash"));
  });

  it("text = body + signature, nothing else (no footer, no unsubscribe, no address, no Ref)", () => {
    const t = prospectPersonalText({ body, signature: "Yash\nSubhSandesh" });
    assert.ok(t.startsWith("Hey Priya,"));
    assert.ok(t.endsWith("\n\nYash\nSubhSandesh"));
    assert.ok(!/unsubscribe|Ref:|INF-|Ward No|You're receiving|reply\s+"?no|Team SubhSandesh/i.test(t), t);
  });

  it("sends as Yash, plain text only, no List-Unsubscribe, Reply-To = the SES receiving address", async () => {
    const seen: SesEmail[] = [];
    const input = buildProspectSendInput(
      "personal",
      { to: "priya@x.in", subject: SUBJ, body, token: "INF-7K2Q9MXA", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/u/tok" },
      YASH,
      "outreach"
    );
    const r = await sendInfluencerMail(input, async (e) => {
      seen.push(e);
      return { outcome: "sent", messageId: "m-1" };
    });
    assert.equal(seen.length, 1);
    const e = seen[0];
    assert.equal(e.from, "yash@subhsandesh.in");
    assert.equal(e.fromName, "Yash from SubhSandesh");
    assert.equal(e.replyTo, "Yash from SubhSandesh <influencer@reply.subhsandesh.in>");
    assert.equal(e.html, "", "no HTML part");
    assert.equal(e.configurationSet, "outreach", "the quiet lane");
    assert.ok(!Object.keys(e.headers || {}).some((h) => /list-unsubscribe/i.test(h)), JSON.stringify(e.headers));
    assert.ok(!/INF-7K2Q9MXA|unsubscribe|Ref:|<img|https?:\/\//i.test(e.text), "no visible token / footer / image / link");
    assert.equal(r.fromAddress, "yash@subhsandesh.in");
    assert.equal(r.quietLane, "used");
  });

  it("classic is untouched: footer, html, RFC 8058 headers — on the quiet lane too", async () => {
    const seen: SesEmail[] = [];
    await sendInfluencerMail(
      buildProspectSendInput("classic", { to: "priya@x.in", subject: "x", body, token: "INF-7K2Q9MXA", instagram: "priya.reels", unsubscribeUrl: "https://api.subhsandesh.in/u/tok" }, YASH, "outreach"),
      async (e) => {
        seen.push(e);
        return { outcome: "sent", messageId: "m-2" };
      }
    );
    assert.ok(seen[0].html && seen[0].html.length > 0);
    assert.equal(seen[0].headers?.["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(seen[0].text, /Ref: INF-7K2Q9MXA/);
    assert.equal(seen[0].configurationSet, "outreach");
  });

  it("Reply-To falls back to the From address when no receiving address is set", () => {
    assert.equal(personalSender("yash@subhsandesh.in", "Yash from SubhSandesh", "").replyToAddress, "yash@subhsandesh.in");
    assert.equal(personalSender("a@b.in", "A", "r@reply.b.in").replyToAddress, "r@reply.b.in");
  });

  it("yash@ is a trustworthy, personal sender; no-reply and foreign domains are not", () => {
    assert.ok(isTrustworthySender(YASH));
    assert.ok(!isRoleAddress(YASH.fromAddress));
    assert.ok(!isTrustworthySender({ fromAddress: "noreply@subhsandesh.in", fromName: "SubhSandesh" }));
    assert.ok(!isTrustworthySender({ fromAddress: "yash@gmail.com", fromName: "Yash" }));
    assert.ok(!isTrustworthySender({ fromAddress: "yash@subhsandesh.in", fromName: "" }));
    assert.ok(isRoleAddress("noreply@x.in"));
  });
});

describe("quiet sending lane: PROSPECT_SES_CONFIGURATION_SET", () => {
  const input = (set: string) =>
    buildProspectSendInput("personal", { to: "priya@x.in", subject: SUBJ, body: renderMergeFields(FIRST_NOTE, PRIYA), token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "" }, YASH, set);

  it("every prospect send names the dedicated set; off sends with none", () => {
    assert.equal(input("outreach").configurationSet, "outreach");
    assert.equal(input("").configurationSet, undefined);
    if (!process.env.PROSPECT_SES_CONFIGURATION_SET) {
      assert.equal(buildProspectSendInput("personal", { to: "a@b.in", subject: "s", body: "b", token: "t", instagram: "", unsubscribeUrl: "" }, YASH).configurationSet, "outreach");
    }
  });

  it("knows a missing / not-allowed set from every other SES error", () => {
    assert.equal(configurationSetErrorCode("NotFoundException", "Configuration set outreach does not exist.", "outreach"), "configuration_set_missing");
    assert.equal(configurationSetErrorCode("ConfigurationSetDoesNotExistException", "x", "outreach"), "configuration_set_missing");
    assert.equal(
      configurationSetErrorCode("AccessDeniedException", "User u is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:us-east-1:1:configuration-set/outreach'", "outreach"),
      "configuration_set_denied"
    );
    assert.equal(
      configurationSetErrorCode("AccessDeniedException", "not authorized on resource `arn:aws:ses:us-east-1:1:configuration-set/my-first-configuration-set'", "outreach"),
      "",
      "the default set's refusal is not ours to fall back from"
    );
    assert.equal(configurationSetErrorCode("NotFoundException", "Configuration set outreach does not exist.", ""), "", "no set asked for");
    assert.equal(configurationSetErrorCode("MessageRejected", "Email address is not verified.", "outreach"), "");
    assert.ok(isConfigurationSetUnavailable(new SesSendError("x", false, "configuration_set_missing")));
    assert.ok(!isConfigurationSetUnavailable(new SesSendError("x", true)));
  });

  it("a missing set: retried ONCE without the override, and the status says “Quiet lane not set up yet”", async () => {
    _resetQueueStateForTests();
    const seen: SesEmail[] = [];
    const r = await sendInfluencerMail(input("outreach"), async (e) => {
      seen.push(e);
      if (e.configurationSet) throw new SesSendError(`SES has no configuration set "${e.configurationSet}".`, false, "configuration_set_missing");
      return { outcome: "sent", messageId: "m-fallback" };
    });
    assert.equal(seen.length, 2, "exactly one retry");
    assert.equal(seen[0].configurationSet, "outreach");
    assert.equal(seen[1].configurationSet, undefined, "the retry does not override (SES default lane)");
    assert.equal(seen[1].from, "yash@subhsandesh.in", "same sender on the retry");
    assert.equal(r.quietLane, "fallback");
    assert.match(String(r.quietLaneError), /no configuration set "outreach"/);
    noteQuietLane(r);
    const st = quietLaneStatus("outreach");
    assert.equal(st.state, "missing");
    assert.match(st.message, /^Quiet lane not set up yet/);
    const item = quietLaneItem(st);
    assert.equal(item.ok, false);
    assert.equal(item.warn, true);
    assert.match(item.label, /Quiet lane not set up yet/);
    noteQuietLane({ quietLane: "used" });
    assert.equal(quietLaneStatus("outreach").state, "ready");
    assert.equal(quietLaneStatus("").state, "off");
    assert.deepEqual(quietLaneItem(quietLaneStatus("outreach")), { ok: true, label: "Quiet sending lane (no open tracking)" });
    _resetQueueStateForTests();
  });

  it("any other refusal is NOT retried on another lane", async () => {
    let calls = 0;
    await assert.rejects(
      sendInfluencerMail(input("outreach"), async () => {
        calls++;
        throw new SesSendError("SES is throttling — wait a moment and send again.", true);
      }),
      SesSendError
    );
    assert.equal(calls, 1);
  });

  it("a fallback that also fails surfaces the second error", async () => {
    let calls = 0;
    await assert.rejects(
      sendInfluencerMail(input("outreach"), async (e) => {
        calls++;
        if (e.configurationSet) throw new SesSendError("missing", false, "configuration_set_missing");
        throw new SesSendError("SES rejected the message: nope");
      }),
      /SES rejected the message/
    );
    assert.equal(calls, 2);
  });
});

describe("follow-ups stay in the same thread", () => {
  it("In-Reply-To / References point at the first email and the subject is “Re: <original>”", async () => {
    const firstId = rfcMessageIdFor("0100018f-first", "us-east-1");
    const threading = threadingHeadersFor([{ direction: "outbound", rfcMessageId: firstId, rfcMessageIdSource: "reconstructed", references: [] }]);
    assert.equal(threading.inReplyTo, firstId);
    assert.match(threading.references, new RegExp(firstId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const subject = replySubject(SUBJ);
    assert.equal(subject, "Re: Loved your couple reels");

    const seen: SesEmail[] = [];
    await sendInfluencerMail(
      buildProspectSendInput(
        "personal",
        { to: "priya@x.in", subject, body: renderMergeFields(NUDGE, PRIYA), token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "", inReplyTo: threading.inReplyTo, references: threading.references },
        YASH
      ),
      async (e) => {
        seen.push(e);
        return { outcome: "sent", messageId: "m-3" };
      }
    );
    assert.equal(seen[0].subject, "Re: Loved your couple reels");
    assert.equal(seen[0].headers?.["In-Reply-To"], firstId);
    assert.ok(String(seen[0].headers?.References).includes(firstId));
  });

  it("follow-up #1: a 20–60 word nudge, no link, no pitch words; from #2 on one subhsandesh.in link is fine", () => {
    const ok = plint("Re: Loved your couple reels", NUDGE, "followup");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    assert.ok(ok.words >= 20 && ok.words <= 60, `words ${ok.words}`);
    assert.ok(codes(plint("Re: Loved your couple reels", NUDGE.replace("make a reel together", "do a collab"), "followup")).includes("pitch_word"));
    // An old thread's subject is inherited — "Re: Collab idea for @x" does not block the nudge.
    assert.deepEqual(plint("Re: Collab idea for @priya.reels", NUDGE, "followup").errors, []);
    const withLink = NUDGE.replace("Would you be up", `Here's where you can see them:\n${JOIN}\n\nWould you be up`);
    assert.ok(codes(plint("Re: x y", withLink, "followup", 0)).includes("personal_link"), "first follow-up: no link");
    assert.deepEqual(plint("Re: x y", withLink, "followup", 1).errors, [], "second follow-up: one link ok");
    assert.ok(codes(plint("Re: x y", withLink.replace(JOIN, "https://example.com/x"), "followup", 1)).includes("foreign_link"));
    assert.ok(codes(plint("Re: x y", `${withLink}\nhttps://subhsandesh.in/templates`, "followup", 1)).includes("too_many_links"));
    assert.equal(personalLinkAllowed("initial"), false);
    assert.equal(personalLinkAllowed("followup", 0), false);
    assert.equal(personalLinkAllowed("followup", 2), true);
    assert.equal(personalLinkAllowed("fresh"), true);
  });

  it("a new email (fresh) needs its own short subject — never “Re:”", () => {
    const body = "Hey {{firstName}},\n\nYash here again — I wrote a little while back. One idea: a reel where one of you surprises the other with an anniversary page on camera.\n\nWould you be up for making that together?";
    assert.deepEqual(plint("One more reel idea", body, "fresh").errors, []);
    assert.ok(codes(plint("Re: one more reel idea", body, "fresh")).includes("subject_fake_reply"));
  });
});

describe("subjects: short and human (personal), specific (classic)", () => {
  it("personal: 2–6 words, the way a person writes one", () => {
    for (const s of ["Hey Om and Diya", "Loved your couple reels", "A reel idea for you two", "From Yash at SubhSandesh", "Hey Priya"]) {
      assert.deepEqual(subjectIssues(s, "personal"), [], s);
    }
  });
  const bad: [string, string][] = [
    ["quick question", "subject_generic"],
    ["Quick question for you two", "subject_generic"],
    ["hi", "subject_generic"],
    ["Hello", "subject_generic"],
    ["Hey", "subject_generic"],
    ["Hi there", "subject_generic"],
    ["Priya", "subject_words"],
    ["A really long subject that goes on about you", "subject_words"],
    ["Collab idea for you", "subject_pitch"],
    ["A paid collaboration for you two", "subject_pitch"],
    ["A brand deal idea", "subject_spam"],
    ["Our website loves your reels", "subject_pitch"],
    ["Free reel idea for you", "subject_spam"],
    ["Earn with your reels", "subject_spam"],
    ["A ₹500 reel idea", "subject_spam"],
    ["Hey Priya!", "subject_bang"],
    ["Hey Priya 🙂", "subject_emoji"],
    ["Re: hey Priya", "subject_fake_reply"],
  ];
  for (const [s, code] of bad) {
    it(`personal refuses “${s}” (${code})`, () => {
      assert.ok(subjectIssues(s, "personal").some((i) => i.code === code), `${s}: ${JSON.stringify(subjectIssues(s, "personal"))}`);
    });
  }
  it("classic keeps its 4–8 word rule and its own examples", () => {
    for (const s of ["Collab idea for @theecouple__", "SubhSandesh x Om & Diya — a paid collab?", "A creator collab with SubhSandesh"]) {
      assert.deepEqual(subjectIssues(s), [], s);
    }
    assert.ok(subjectIssues("Hey Priya").some((i) => i.code === "subject_words"));
    assert.ok(subjectIssues("A very long subject line that goes on about our collab").some((i) => i.code === "subject_words"));
    assert.ok(subjectIssues("Big opportunity with SubhSandesh today").some((i) => i.code === "subject_spam"));
  });
  it("ALL CAPS and digits in a personal subject are refused by the linter", () => {
    assert.ok(codes(plint("LOVED your couple reels", FIRST_NOTE)).includes("all_caps"));
    assert.ok(codes(plint("Reel idea number 2", FIRST_NOTE)).includes("personal_number"));
  });
  it("the personal fallback greets them, or offers a reel idea — and always passes", () => {
    assert.equal(fallbackSubject({ kind: "initial", style: "personal", person: { name: "Om & Diya", instagram: "theecouple__" } }), "Hey Om and Diya");
    assert.equal(fallbackSubject({ kind: "initial", style: "personal", person: { name: "Om & Diya", instagram: "" }, variant: 1 }), "A reel idea for you two");
    assert.equal(fallbackSubject({ kind: "initial", style: "personal", person: { name: "Priya Sharma", instagram: "priya.reels" } }), "Hey Priya");
    assert.equal(fallbackSubject({ kind: "initial", style: "personal" }), "A reel idea for you");
    assert.equal(fallbackSubject({ kind: "fresh", style: "personal", person: { name: "Priya", instagram: "priya.reels" } }), "One more idea, Priya");
    assert.equal(greetingNames("Om Sharma & Diya Rao"), "Om and Diya");
    for (const s of [
      fallbackSubject({ kind: "initial", style: "personal", person: { name: "A Very Long Name Of Several Words", instagram: "" } }),
      fallbackSubject({ kind: "fresh", style: "personal" }),
      fallbackSubject({ kind: "initial", style: "personal", person: { name: "Ravi 2", instagram: "" } }),
    ]) {
      assert.deepEqual(subjectIssues(s, "personal"), [], s);
      assert.ok(!/\d/.test(s), s);
    }
  });
  it("the classic fallback is unchanged", () => {
    assert.equal(fallbackSubject({ kind: "initial", person: { name: "Om & Diya", instagram: "theecouple__" } }), "Collab idea for @theecouple__");
    assert.equal(fallbackSubject({ kind: "initial" }), "A creator collab with SubhSandesh");
  });
});

describe("no “reply no” opt-out line", () => {
  it("a first note passes WITHOUT any opt-out line", () => {
    const r = plint(SUBJ, FIRST_NOTE);
    assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
    assert.equal(r.style, "personal");
    assert.ok(r.words >= 50 && r.words <= 100, `words ${r.words}`);
    assert.ok(!hasOptOutLine(FIRST_NOTE));
  });
  it("an opt-out line is refused in personal notes", () => {
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
    const b = `${FIRST_NOTE}\n\nIf it's not for you, just reply "no" and I won't email again.`;
    assert.equal(stripOptOutLines(b), FIRST_NOTE);
    assert.equal(stripOptOutLines(FIRST_NOTE), FIRST_NOTE);
  });
  it("a “no” reply still suppresses silently", () => {
    assert.equal(classifyProspectReply("Re: Loved your couple reels", "No thanks"), "not_interested");
    assert.equal(classifyProspectReply("Re: Loved your couple reels", "Please stop emailing me"), "unsubscribe");
  });
});

describe("personal: the linter profile", () => {
  it("every promotional word on the first-touch list is refused — in a first email and a follow-up — and allowed in a reply", () => {
    const words = ["collab", "collaboration", "partnership", "opportunity", "brand", "promote", "promotion", "offer", "deal", "sponsored", "campaign", "website", "platform", "exclusive", "limited", "earn", "commission", "free"];
    for (const w of words) {
      assert.ok(PERSONAL_PITCH_WORDS.includes(w), `${w} on the list`);
      const first = FIRST_NOTE.replace("small interactive pages", `small interactive ${w} pages`);
      assert.ok(codes(plint(SUBJ, first)).includes("pitch_word"), `first email: ${w}`);
      const fu = NUDGE.replace("one of our pages", `one of our ${w} pages`);
      assert.ok(codes(plint("Re: x y", fu, "followup")).includes("pitch_word"), `follow-up: ${w}`);
    }
    const reply = "Hey Priya,\n\nThanks for writing back. Happy to share how the collab works: you get your own link and a commission on every payment from people who sign up through it.\n\nAny questions, just reply.";
    assert.ok(!codes(plint("Re: Loved your couple reels", reply, "reply")).includes("pitch_word"));
  });
  it("“partner” (who people send pages to) is not a pitch word", () => {
    assert.match(FIRST_NOTE, /their partner/);
    assert.deepEqual(plint(SUBJ, FIRST_NOTE).errors, []);
  });

  const blocked: [string, string, string, string][] = [
    ["a link", SUBJ, FIRST_NOTE.replace("Happy to pay for it, of course.", `Details: ${JOIN}`), "personal_link"],
    ["a bare domain", SUBJ, FIRST_NOTE.replace("We make small", "At subhsandesh.in we make small"), "personal_link"],
    ["a percentage", SUBJ, FIRST_NOTE.replace("Happy to pay for it", "Happy to pay 30% for it"), "personal_number"],
    ["rupees", SUBJ, FIRST_NOTE.replace("Happy to pay for it", "Happy to pay ₹500 for it"), "personal_number"],
    ["any digit", SUBJ, FIRST_NOTE.replace("We make small", "The 2 of us make small"), "personal_number"],
    ["“sign up”", SUBJ, FIRST_NOTE.replace("Happy to pay for it, of course.", "You can sign up quickly."), "pitch_word"],
    ["“programme”", SUBJ, FIRST_NOTE.replace("making a reel together", "joining our creator programme"), "pitch_word"],
    ["paying mentioned twice", SUBJ, FIRST_NOTE.replace("of course.", "of course. It's a paid reel."), "pay_twice"],
    ["an emoji", SUBJ, FIRST_NOTE.replace("of course.", "of course 🙂"), "emoji"],
    ["two exclamation marks", SUBJ, FIRST_NOTE.replace("couple videos.", "couple videos!").replace("of course.", "of course!"), "bangs"],
    ["no “I'm Yash”", SUBJ, FIRST_NOTE.replace("I'm Yash from SubhSandesh. I came", "I came"), "no_intro"],
    ["a team sign-off", SUBJ, `${FIRST_NOTE}\n\nTeam SubhSandesh`, "team_signoff"],
    ["no question", SUBJ, FIRST_NOTE.replace("Would you be up for making a reel together with one of them?", "I'd love to make a reel together with one of them."), "no_question"],
    ["too long", SUBJ, FIRST_NOTE.replace("of course.", "of course. " + "I really mean it. ".repeat(15)), "too_long"],
    ["no greeting", SUBJ, FIRST_NOTE.replace("Hey {{firstName}},", "So,"), "greeting"],
    ["a generic subject", "quick question", FIRST_NOTE, "subject_generic"],
    ["a one-word subject", "Priya", FIRST_NOTE, "subject_words"],
    ["a long subject", "a really long subject line about a reel with you", FIRST_NOTE, "subject_words"],
    ["a pitch subject", "Collab idea for you two", FIRST_NOTE, "subject_pitch"],
    ["an emoji subject", "Hey Priya 🙂", FIRST_NOTE, "subject_emoji"],
    ["a fake Re:", "Re: hey Priya", FIRST_NOTE, "subject_fake_reply"],
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
        writer: "Yash",
      });
      assert.deepEqual(r.errors, [], `${ig}: ${JSON.stringify(r.errors)}`);
    }
  });

  it("after they reply, the link and the REAL % are allowed — a wrong % is not", () => {
    const reply = `Hey Priya,\n\nThanks for writing back. Here's how it works: you get your own link, and you earn 30% of every payment from people who sign up through it, paid to your UPI.\n\nYou can join here:\n${JOIN}\n\nAny questions, just reply.`;
    const ok = plint("Re: Loved your couple reels", reply, "reply");
    assert.deepEqual(ok.errors, [], JSON.stringify(ok.errors));
    const wrong = plint("Re: Loved your couple reels", reply.replace("30%", "40%"), "reply");
    assert.ok(codes(wrong).includes("wrong_percent"));
  });

  it("classic rules are unchanged by the personal profile (a link and a collab are fine there)", () => {
    const r = lintOutreach("Your own link on SubhSandesh", renderMergeFields(FIRST_NOTE.replace("Happy to pay for it, of course.", `Details of the collab: ${JOIN}`), PRIYA), { commissionPercent: 30 });
    assert.ok(!codes(r).includes("personal_link"));
    assert.ok(!codes(r).includes("pitch_word"));
    assert.equal(r.style, "classic");
  });

  it("the inbox check states the real rules, and flags what breaks them", () => {
    const good = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint(SUBJ, FIRST_NOTE), sender: YASH, subject: SUBJ, writer: "Yash", quietLane: { configurationSet: "outreach", state: "ready", message: "" } });
    assert.ok(good.every((i) => i.ok), JSON.stringify(good));
    const labels = good.map((i) => i.label).join(" | ");
    for (const want of [
      "From Yash from SubhSandesh <yash@subhsandesh.in>",
      "Written by Yash, first person",
      "Plain text",
      "No unsubscribe header",
      "Quiet sending lane (no open tracking)",
      "No links in the first email",
      "No pitch words in the first email",
      "Short, human subject",
    ]) {
      assert.ok(labels.includes(want), `${want} in ${labels}`);
    }
    const withLink = FIRST_NOTE.replace("Happy to pay for it, of course.", `Details: ${JOIN}`);
    const bad = inboxCheck({ style: "personal", kind: "initial", body: withLink, lint: plint("quick question", withLink), sender: YASH, writer: "Yash" });
    assert.equal(bad.find((i) => /No links/.test(i.label))?.ok, false);
    assert.equal(bad.find((i) => /human subject/.test(i.label))?.ok, false);
    const pitchy = FIRST_NOTE.replace("making a reel together", "a paid collab");
    const p = inboxCheck({ style: "personal", kind: "initial", body: pitchy, lint: plint(SUBJ, pitchy), sender: YASH, writer: "Yash" });
    assert.equal(p.find((i) => /No pitch words/.test(i.label))?.ok, false);
    const noIntro = FIRST_NOTE.replace("I'm Yash from SubhSandesh. I came", "I came");
    assert.equal(inboxCheck({ style: "personal", kind: "initial", body: noIntro, lint: plint(SUBJ, noIntro), sender: YASH, writer: "Yash" }).find((i) => /Written by Yash/.test(i.label))?.ok, false);
    const missing = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint(SUBJ, FIRST_NOTE), sender: YASH, writer: "Yash", quietLane: { configurationSet: "outreach", state: "missing", message: "m" } });
    const lane = missing.find((i) => /Quiet lane/.test(i.label));
    assert.ok(lane && lane.warn && !lane.ok, JSON.stringify(lane));
    const fu = inboxCheck({ style: "personal", kind: "followup", body: NUDGE, lint: plint("Re: x y", NUDGE, "followup"), sender: YASH, subject: "Re: x y", writer: "Yash" });
    assert.ok(fu.find((i) => /same thread/.test(i.label))?.ok);
    const noreply = inboxCheck({ style: "personal", kind: "initial", body: FIRST_NOTE, lint: plint(SUBJ, FIRST_NOTE), sender: { fromAddress: "noreply@subhsandesh.in", fromName: "SubhSandesh" }, writer: "Yash" });
    assert.equal(noreply[0].ok, false);
  });
});

describe("drafting as Yash (stubbed model)", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  const person = { name: "Priya Sharma", instagram: "priya.reels", niche: "couple comedy reels", note: "" };
  const ctx: ProspectDraftContext = { mode: "personal", style: "personal", person, programme };
  const stub = (body: string, subject = SUBJ) => async () => JSON.stringify({ reading: "r", subject, body });
  const NOTE = renderMergeFields(FIRST_NOTE, PRIYA);

  it("accepts a grounded first note and uses the personal system prompt", async () => {
    let sys = "";
    const d = await draftProspectMail(ctx, async (s) => {
      sys = s;
      return JSON.stringify({ reading: "r", subject: SUBJ, body: NOTE });
    });
    assert.equal(sys, personalSystemPrompt());
    assert.ok(d.body.startsWith("Hey Priya"));
    assert.equal(d.subject, SUBJ);
    assert.ok(!d.subjectFallback);
  });

  it("the personal prompt writes as Yash in the first person; classic stays the team", () => {
    const p = personalSystemPrompt("Yash", "Yash\nSubhSandesh");
    assert.match(p, /You write AS Yash, in the first person/);
    assert.match(p, /I'm Yash/);
    assert.ok(!/Team SubhSandesh|as the team/i.test(p), "no team voice");
    assert.match(p, /Yash \/ SubhSandesh/, "the signature it is told about");
    assert.match(PROSPECT_SYSTEM_PROMPT, /as the team — "we", "our team"/);
    assert.match(PROSPECT_SYSTEM_PROMPT, /Team SubhSandesh/);
    assert.ok(!/suyash/i.test(buildProspectPrompt({ ...ctx, adminNote: "mention Diwali" }, "english")));
  });

  it("drops an opt-out line and a Yash sign-off the model added, keeps the rest", async () => {
    let d = await draftProspectMail(ctx, stub(`${NOTE}\n\nIf it's not for you, just reply "no" and I won't email again.`));
    assert.equal(d.body, NOTE);
    assert.ok(!hasOptOutLine(d.body));
    for (const tail of ["\n\nCheers,\nYash", "\n\nYash\nSubhSandesh", "\n\n— Yash from SubhSandesh"]) {
      d = await draftProspectMail(ctx, stub(`${NOTE}${tail}`));
      assert.equal(d.body, NOTE, JSON.stringify(tail));
    }
  });

  it("replaces a weak subject with the personal fallback", async () => {
    for (const weak of ["quick question", "collab idea for you", "Hi!", "Earn with SubhSandesh now", "Reel number 2", ""]) {
      const d = await draftProspectMail(ctx, stub(NOTE, weak));
      assert.equal(d.subject, "Hey Priya", weak);
      assert.equal(d.subjectFallback, true);
    }
  });

  it("a subject written like a greeting loses its trailing comma, not its words", async () => {
    const d = await draftProspectMail(ctx, stub(NOTE, "Hey Priya,"));
    assert.equal(d.subject, "Hey Priya");
    assert.ok(!d.subjectFallback);
  });

  it("throws away a first note with a link, a number, a pitch word", async () => {
    for (const bad of [
      NOTE.replace("Happy to pay for it, of course.", `Details: ${JOIN}`),
      NOTE.replace("Happy to pay for it", "Happy to pay 30% for it"),
      NOTE.replace("making a reel together", "a paid collab"),
      NOTE.replace("Happy to pay for it, of course.", "You could earn ₹5,000 a month."),
    ]) {
      await assert.rejects(draftProspectMail(ctx, stub(bad)), ThreadAiRefusedError, bad.slice(0, 80));
    }
  });

  it("retries and keeps the clean draft", async () => {
    let n = 0;
    const flaky = async () => JSON.stringify({ reading: "r", subject: SUBJ, body: n++ === 0 ? NOTE.replace("making a reel together", "a brand collab") : NOTE });
    const d = await draftProspectMailWithRetry(ctx, flaky);
    assert.equal(n, 2);
    assert.ok(!/collab/.test(d.body));
  });

  it("two angles in one Generate", async () => {
    const prompts: string[] = [];
    const ds = await draftProspectAlternatives(ctx, async (_s, u) => {
      prompts.push(u);
      return JSON.stringify({ reading: "r", subject: SUBJ, body: NOTE });
    });
    assert.deepEqual(ds.map((d) => d.angle).sort(), ["a", "b"]);
    assert.ok(prompts.some((p) => /ANGLE A/.test(p)) && prompts.some((p) => /ANGLE B/.test(p)));
    let k = 0;
    const oneBad = await draftProspectAlternatives(ctx, async () => JSON.stringify({ reading: "r", subject: "x", body: k++ % 2 ? NOTE : NOTE.replace("making a reel together", "a website collab") }));
    assert.ok(oneBad.length >= 1, "one good draft is enough");
  });

  it("the first-touch prompt: I'm Yash, then the light ask; no %, link, scheme name or pitch word; 50–100 words", () => {
    const p = buildProspectPrompt(ctx, "english");
    assert.ok(!p.includes("30%") && !p.includes(JOIN) && !/programme/i.test(p), p);
    assert.match(p, /couple comedy reels/);
    assert.match(p, /I'm Yash from SubhSandesh/);
    assert.match(p, /Hey <first name>,/);
    assert.match(p, /came across their page on Instagram/);
    assert.match(p, /50 to 100 words/);
    assert.match(p, /little interactive pages people send/);
    assert.match(p, /Happy to pay for it, of course/);
    const sys = personalSystemPrompt("Yash", "Yash\nSubhSandesh");
    for (const banned of [...PERSONAL_PITCH_WORDS, "guaranteed", "click here", "unsubscribe", "reply no"]) {
      const re = new RegExp(`(^|[^a-z])${banned.replace(/[-]/g, "\\-")}($|[^a-z])`, "i");
      assert.ok(!re.test(sys), `system prompt names “${banned}”`);
      assert.ok(!re.test(p), `first-touch prompt names “${banned}”`);
    }
  });

  it("a note in Hindi content asks for a light Hinglish touch; a couple is greeted together", () => {
    const p = buildProspectPrompt({ ...ctx, person: { name: "Om & Diya", instagram: "theecouple__", niche: "", note: "Hindi couple reels, 40k followers" } }, "english");
    assert.match(p, /Hinglish/);
    assert.match(p, /Hey Om and Diya,/);
  });

  it("follow-up #1 gets no link in its facts; #2 may", () => {
    const fu = (n: number): ProspectDraftContext => ({ mode: "followup", style: "personal", person, programme, priorFollowups: n, messages: [{ direction: "outbound", body: NOTE, at: new Date() }] });
    assert.ok(!buildProspectPrompt(fu(0), "english").includes(JOIN));
    assert.ok(buildProspectPrompt(fu(1), "english").includes(JOIN));
    assert.match(buildProspectPrompt(fu(0), "english"), /20 to 60 words/);
    assert.match(buildProspectPrompt(fu(0), "english"), /from Yash/);
  });

  it("the reply prompt does carry the real % and the join link", () => {
    const p = buildProspectPrompt({ mode: "reply", style: "personal", person, programme, messages: [{ direction: "inbound", body: "Sure, tell me more", at: new Date() }] }, "english");
    assert.match(p, /30%/);
    assert.ok(p.includes(JOIN));
  });

  it("a reply may carry the join link and the real %", async () => {
    const reply = `Hey Priya,\n\nThanks for getting back. It's simple: you get your own link, and you earn 30% of every payment from people who sign up through it, paid to your UPI.\n\nYou can join here:\n${JOIN}\n\nHappy to help if anything's unclear.`;
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
    const linked = nudge.replace("Would you be up", `Here's where you can see them:\n${JOIN}\n\nWould you be up`);
    await assert.rejects(draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: msgs }, stub(linked, "")), ThreadAiRefusedError);
    const ok2 = await draftProspectMail({ mode: "followup", style: "personal", person, programme, messages: msgs, priorFollowups: 1 }, stub(linked, ""));
    assert.ok(ok2.body.includes(JOIN));
    const freshBody = "Hey Priya,\n\nYash here again — I wrote a little while back. One idea: a reel where one of you surprises the other with an anniversary page on camera.\n\nWould you be up for making that together?";
    const fr = await draftProspectMail({ mode: "fresh", style: "personal", person, programme, messages: msgs }, stub(freshBody, "One more reel idea"));
    assert.equal(fr.subject, "One more reel idea");
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
  const ev = (o: Record<string, string>) => ({ fromEmail: "", subject: "Re: Loved your couple reels", inReplyTo: "", references: "", messageId: "", token: "", ...o });

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
      assert.equal(classifyProspectReply("Re: Loved your couple reels", body), want, body);
    }
  });
  it("a conversation is left for a human", () => {
    for (const body of ["No problem, tell me more!", "Yes, sounds good. What's the pay?", "Not sure — how does it work?", "Nope, I haven't heard of you. What is it?"]) {
      assert.equal(classifyProspectReply("Re: Loved your couple reels", body), "reply", body);
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
          { to: "priya@x.in", subject: SUBJ, body: "Hey", token: "INF-7K2Q9MXA", instagram: "", unsubscribeUrl: "" },
          YASH,
          "outreach"
        ),
        refuse
      ),
      (err: unknown) => err instanceof SesSendError && isSenderNotAllowedError((err as Error).message)
    );
    assert.deepEqual(tried, ["yash@subhsandesh.in"], "exactly one attempt, from Yash's address — not retried on another lane or sender");
    const msg = personalSenderBlockedMessage("yash@subhsandesh.in");
    assert.match(msg, /Sender isn't allowed yet: SES refused to send as yash@subhsandesh\.in/);
    assert.match(msg, /add-personal-sender\.sh/);
    assert.match(msg, /Nothing was sent from another address/);
  });
});

describe("template follow-ups greet by {{firstName}}", () => {
  const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-16" };
  it("a name copied from the quoted email is turned back into {{firstName}}; the prompt quotes it neutrally", async () => {
    const ctx: ProspectDraftContext = { mode: "followup", style: "personal", recipients: 3, programme, firstEmail: renderMergeFields(FIRST_NOTE, PRIYA) };
    assert.ok(!buildProspectPrompt(ctx, "english").includes("Hey Priya,"));
    const d = await draftProspectMail(ctx, async () => JSON.stringify({ reading: "r", subject: "", body: renderMergeFields(NUDGE, PRIYA).replace("Hey Priya, I", "Hey Priya,\n\nI") }));
    assert.ok(d.body.startsWith("Hey {{firstName}},"), d.body);
  });
});
