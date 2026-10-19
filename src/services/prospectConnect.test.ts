// ─── Connect: a hello from Yash, no pitch ───────────────────────────────────
//
// The default personal first email. No Mongo, no SES, no OpenAI: the model is
// a stub and nothing is sent from here.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONNECT_BANNED_WORDS,
  canEmailProspect,
  connectSender,
  connectSignature,
  connectSubject,
  fallbackSubject,
  inboxCheck,
  isConnectProfile,
  lintOutreach,
  personalDress,
  renderMergeFields,
  subjectIssues,
  touchFor,
} from "./prospectMail.service";
import {
  buildProspectPrompt,
  connectSystemPrompt,
  draftProspectMail,
  hasProof,
  scrubCounts,
  type ProspectDraftContext,
} from "./prospectAi.service";
import { buildProspectSendInput } from "./prospectQueue.service";
import type { ProofSnapshot } from "./outreachProof.service";

const JOIN = "https://subhsandesh.in/influencer";
const programme = { commissionPercent: 30, attributionDays: 60, joinUrl: JOIN, today: "2026-10-19" };
const YASH = { fromAddress: "yash@subhsandesh.in", fromName: "Yash from SubhSandesh", replyToAddress: "influencer@reply.subhsandesh.in" };
const PROOF: ProofSnapshot = {
  id: "6720aa00bb11cc22dd33ee44",
  imageUrl: "https://cdn.subhsandesh.in/gifts-media/outreach-proof/0123456789abcdef0123.png",
  source: "search_console",
  periodLabel: "last 3 months",
  stats: [
    { label: "Total clicks", value: "52.2K" },
    { label: "Total impressions", value: "2.75M" },
  ],
};

const HELLO = `Hey Om and Diya,

Your couple videos from Assam are so warm and funny, and the way you two tease each other made my day.

I'm Yash. I'd love to connect — there's something I'd like to run by you that I think you'd both enjoy.

Would you be open to a quick chat this week?`;

const BUMP = `Hey Om and Diya,

Just floating this back up — would love to connect when you have a minute.

Open to a quick chat?`;

const SUBJ = "Om & Diya, would love to connect";
const lintC = (subject: string, body: string, extra: Partial<Parameters<typeof lintOutreach>[2]> = {}) =>
  lintOutreach(subject, body, { commissionPercent: 30, kind: "initial", style: "personal", touch: "connect", writer: "Yash", ...extra });
const codes = (r: { errors: { code: string }[] }) => r.errors.map((e) => e.code);

describe("connect linter", () => {
  it("a genuine hello passes: 35–70 words, one question, no company", () => {
    const r = lintC(SUBJ, HELLO);
    assert.deepEqual(r.errors, []);
    assert.ok(r.words >= 35 && r.words <= 70, String(r.words));
  });

  it("refuses “SubhSandesh” anywhere in the body", () => {
    const r = lintC(SUBJ, HELLO.replace("I'm Yash.", "I'm Yash from SubhSandesh."));
    assert.ok(codes(r).includes("connect_company"), JSON.stringify(r.errors));
    assert.ok(!lintC(SUBJ, HELLO.replace("I'm Yash.", "I'm Yash from Subh Sandesh.")).ok);
  });

  it("the same body that passes as a Pitch first email is refused as Connect", () => {
    const pitch = HELLO.replace("I'm Yash.", "I'm Yash from SubhSandesh. We make little pages people send to someone they love.");
    assert.ok(!lintC(SUBJ, pitch).ok);
  });

  it("refuses product, money and pitch words — including prefixes", () => {
    const cases = [
      "we make little pages",
      "our website",
      "a new app",
      "the link",
      "happy to pay you",
      "it's paid",
      "some money",
      "you could earn",
      "a commission",
      "a reel for us",
      "a collab",
      "a collaboration",
      "a partnership",
      "partners",
      "to promote",
      "promotional",
      "a sponsor",
      "sponsored",
      "your brand",
      "branding",
      "an offer",
      "a deal",
      "for free",
    ];
    for (const phrase of cases) {
      const body = HELLO.replace("that I think you'd both enjoy", `about ${phrase} that I think you'd both enjoy`);
      const r = lintC(SUBJ, body);
      assert.ok(codes(r).includes("pitch_word") || codes(r).includes("connect_company"), `${phrase}: ${JSON.stringify(r.errors)}`);
    }
  });

  it("refuses numbers, %, ₹ — even the confirmed traction numbers", () => {
    for (const bit of ["47K followers", "52.2K people", "30%", "₹500"]) {
      const r = lintC(SUBJ, HELLO.replace("made my day", `made my day (${bit})`), { allowedNumbers: ["52.2K"] });
      assert.ok(codes(r).includes("personal_number") || codes(r).includes("pitch_word"), `${bit}: ${JSON.stringify(r.errors)}`);
    }
  });

  it("refuses links, emoji, ALL CAPS, two “!”, an opt-out line, and no question", () => {
    assert.ok(codes(lintC(SUBJ, `${HELLO}\n\nhttps://subhsandesh.in/influencer`)).includes("personal_link"));
    assert.ok(codes(lintC(SUBJ, HELLO.replace("made my day", "made my day 😍"))).includes("emoji"));
    assert.ok(codes(lintC(SUBJ, HELLO.replace("so warm", "REALLY warm"))).includes("all_caps"));
    assert.ok(codes(lintC(SUBJ, HELLO.replace("made my day.", "made my day! Truly!"))).includes("bangs"));
    assert.ok(codes(lintC(SUBJ, `${HELLO}\n\nIf it's not for you, just reply no and I won't email again.`)).includes("opt_out_line"));
    assert.ok(codes(lintC(SUBJ, HELLO.replace("Would you be open to a quick chat this week?", "Let me know if you'd be open to a quick chat this week."))).includes("no_question"));
  });

  it("holds the 35–70 word range, and asks for “I'm Yash” without the company", () => {
    const short = "Hey Om and Diya,\n\nI'm Yash. Loved your videos. Would love to connect — open to a quick chat?";
    assert.ok(codes(lintC(SUBJ, short)).includes("too_short"));
    const long = HELLO.replace("made my day.", `made my day. ${"Your little moments together feel real and honest. ".repeat(6)}`);
    assert.ok(codes(lintC(SUBJ, long)).includes("too_long"));
    const noIntro = lintC(SUBJ, HELLO.replace("I'm Yash. ", ""));
    assert.match(noIntro.errors.find((e) => e.code === "no_intro")!.message, /I'm Yash\.”/);
  });

  it("only personal first emails / follow-ups use the profile", () => {
    assert.equal(isConnectProfile({ style: "personal", kind: "initial", touch: "connect" }), true);
    assert.equal(isConnectProfile({ style: "personal", kind: "followup", touch: "connect" }), true);
    assert.equal(isConnectProfile({ style: "personal", kind: "reply", touch: "connect" }), false);
    assert.equal(isConnectProfile({ style: "personal", kind: "fresh", touch: "connect" }), false);
    assert.equal(isConnectProfile({ style: "classic", kind: "initial", touch: "connect" }), false);
    assert.equal(isConnectProfile({ style: "personal", kind: "initial", touch: "pitch" }), false);
  });

  it("the banned list never appears in the Connect prompts", () => {
    const ctx: ProspectDraftContext = {
      mode: "personal",
      style: "personal",
      touch: "connect",
      programme,
      person: { name: "Om & Diya", instagram: "theecouple__", niche: "couple vlogs", note: "47K followers · Couple love & lifestyle (Assam)" },
    };
    const prompts = [connectSystemPrompt("Yash", "Yash"), buildProspectPrompt(ctx, "english"), buildProspectPrompt({ ...ctx, mode: "followup" }, "english")].join("\n").toLowerCase();
    for (const w of CONNECT_BANNED_WORDS) assert.ok(!new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(prompts), `prompt names “${w}”`);
    for (const pre of ["collab", "partner", "promot", "sponsor", "brand"]) assert.ok(!prompts.includes(pre), `prompt names “${pre}…”`);
    assert.ok(!/47k|\b47\b/.test(prompts), "the follower count is scrubbed");
    assert.match(prompts, /couple love & lifestyle \(assam\)/);
  });
});

describe("connect subject", () => {
  it("A: “<Names>, would love to connect” · B: “Hey <Names>, quick hello from Yash”", () => {
    assert.equal(connectSubject({ person: { name: "Om & Diya" }, variant: 0, writer: "Yash" }), "Om & Diya, would love to connect");
    assert.equal(connectSubject({ person: { name: "Om & Diya" }, variant: 1, writer: "Yash" }), "Hey Om & Diya, quick hello from Yash");
    assert.equal(connectSubject({ person: { name: "Priya Sharma" }, variant: 0, writer: "Yash" }), "Priya, would love to connect");
    assert.equal(connectSubject({ template: true, variant: 0, writer: "Yash" }), "{{firstName}}, would love to connect");
    assert.equal(connectSubject({ template: true, variant: 1, writer: "Yash" }), "Hey {{firstName}}, quick hello from Yash");
    assert.equal(fallbackSubject({ kind: "initial", style: "personal", touch: "connect", person: { name: "Om and Diya Sharma" } }), "Om & Diya, would love to connect");
  });

  it("every built subject passes the connect subject rules (3–7 words)", () => {
    for (const name of ["Om & Diya", "Priya Sharma", "Kabir", "Aarav and Meera Kapoor"]) {
      for (const variant of [0, 1]) {
        const s = connectSubject({ person: { name }, variant, writer: "Yash" });
        assert.deepEqual(subjectIssues(s, "personal", "connect"), [], s);
        assert.deepEqual(lintC(s, HELLO).errors, [], s);
      }
    }
    assert.deepEqual(subjectIssues(renderMergeFields("Hey {{firstName}}, quick hello from Yash", { name: "Asha Verma", instagram: "" }), "personal", "connect"), []);
  });

  it("refuses the company, a pitch, “quick question”, numbers and spam words", () => {
    const bad = (s: string) => subjectIssues(s, "personal", "connect").map((i) => i.code);
    assert.ok(bad("Priya, a hello from SubhSandesh").includes("subject_pitch"));
    assert.ok(bad("Priya, a collab idea for you").includes("subject_pitch"));
    assert.ok(bad("Priya, a quick question for you").includes("subject_generic"));
    assert.ok(bad("Priya, loved your 3 reels").includes("subject_number"));
    assert.ok(bad("Priya, a free chat this week").length > 0);
    assert.ok(bad("Priya, would love to connect with you this week please").includes("subject_words"));
  });
});

describe("default intent and first touch", () => {
  const now = new Date("2026-10-19T08:00:00Z");
  it("a new prospect gets a first email, as a Connect note unless Pitch is picked", () => {
    const v = canEmailProspect({ status: "new" }, now);
    assert.ok(v.ok && v.kind === "initial");
    assert.equal(touchFor({ kind: "initial", style: "personal" }), "connect");
    assert.equal(touchFor({ kind: "initial", style: "personal" }, "pitch"), "pitch");
    assert.equal(touchFor({ kind: "initial", style: "classic" }), "pitch");
  });

  it("a contacted prospect gets a follow-up that keeps the first email's touch", () => {
    const sent = new Date("2026-10-10T08:00:00Z");
    const v = canEmailProspect({ status: "contacted", initialSentAt: sent, contactCount: 1, lastContactedAt: sent }, now);
    assert.ok(v.ok && v.kind === "followup");
    assert.equal(touchFor({ kind: "followup", style: "personal", firstTouch: "connect" }), "connect");
    assert.equal(touchFor({ kind: "followup", style: "personal", firstTouch: "pitch" }), "pitch");
    assert.equal(touchFor({ kind: "followup", style: "personal", firstTouch: "" }), "pitch");
    // Once they wrote back the bump is no longer a hello.
    assert.equal(touchFor({ kind: "followup", style: "personal", firstTouch: "connect", lastReplyAt: now }), "pitch");
    assert.equal(touchFor({ kind: "fresh", style: "personal", firstTouch: "connect" }), "pitch");
  });

  it("a replied prospect gets a Reply — the pitch profile, with the real context", () => {
    const v = canEmailProspect({ status: "replied", initialSentAt: now, contactCount: 1, lastReplyAt: now }, now);
    assert.ok(v.ok && v.kind === "reply");
    assert.equal(touchFor({ kind: "reply", style: "personal", firstTouch: "connect", lastReplyAt: now }), "pitch");
  });
});

describe("connect follow-up, sender and signature", () => {
  it("a 20–45 word bump in the same thread passes; a pitch in it does not", () => {
    const r = lintOutreach("Re: Om & Diya, would love to connect", BUMP, { commissionPercent: 30, kind: "followup", style: "personal", touch: "connect", writer: "Yash" });
    assert.deepEqual(r.errors, []);
    const pitch = lintOutreach("Re: Om & Diya, would love to connect", BUMP.replace("Open to a quick chat?", "It's a paid reel idea. Open to a quick chat?"), { commissionPercent: 30, kind: "followup", style: "personal", touch: "connect", writer: "Yash", priorFollowups: 3 });
    assert.ok(codes(pitch).includes("pitch_word"));
    const link = lintOutreach("Re: x", `${BUMP}\n\nhttps://subhsandesh.in/influencer`, { commissionPercent: 30, kind: "followup", style: "personal", touch: "connect", writer: "Yash", priorFollowups: 3 });
    assert.ok(codes(link).includes("personal_link"), "never a link while it is still a hello");
  });

  it("threads under the Connect note (In-Reply-To + References) and is signed “Yash” only", () => {
    const input = buildProspectSendInput(
      "personal",
      { to: "om@x.in", subject: "Re: Om & Diya, would love to connect", body: BUMP, token: "INF-7K2Q9MXA", instagram: "theecouple__", unsubscribeUrl: "https://api.subhsandesh.in/u/t", inReplyTo: "<a@subhsandesh.in>", references: "<a@subhsandesh.in>", kind: "followup", touch: "connect" },
      YASH,
      "outreach"
    );
    assert.equal(input.inReplyTo, "<a@subhsandesh.in>");
    assert.equal(input.references, "<a@subhsandesh.in>");
    const text = input.render!({ fromAddress: YASH.fromAddress, replyToAddress: YASH.replyToAddress }).text;
    assert.ok(text.trim().endsWith("\n\nYash"), text);
    assert.ok(!/subhsandesh/i.test(text), "no company line under a hello");
    // A pitch first email keeps the company line.
    const pitch = buildProspectSendInput("personal", { to: "om@x.in", subject: "x", body: BUMP, token: "t", instagram: "", unsubscribeUrl: "u", kind: "initial", touch: "pitch" }, YASH, "outreach");
    assert.match(pitch.render!({ fromAddress: YASH.fromAddress, replyToAddress: YASH.replyToAddress }).text, /Yash\nSubhSandesh$/);
  });

  it("PROSPECT_CONNECT_FROM_NAME switches the From name; empty keeps the normal one", () => {
    assert.equal(connectSender("", YASH).fromName, "Yash from SubhSandesh");
    assert.equal(connectSender("Yash", YASH).fromName, "Yash");
    assert.equal(connectSender("Yash", YASH).fromAddress, "yash@subhsandesh.in");
    assert.equal(connectSignature("Yash"), "Yash");
    assert.equal(connectSignature("Yash Agrahari\nSubhSandesh"), "Yash");
    assert.equal(personalDress("connect", "reply").signature.includes("SubhSandesh") || personalDress("connect", "reply").signature === "Yash", true);
  });

  it("the Inbox check for Connect", () => {
    const lint = lintC(SUBJ, HELLO);
    const items = inboxCheck({ style: "personal", kind: "initial", body: HELLO, lint, sender: YASH, subject: SUBJ, touch: "connect" });
    const labels = items.map((i) => i.label);
    assert.ok(labels.includes("From Yash from SubhSandesh <yash@subhsandesh.in>"));
    for (const l of ["No company pitch — just a hello", "No links, numbers or images", "Ends with one easy question", "Short (35–70 words)"]) {
      assert.ok(items.find((i) => i.label === l)?.ok, l);
    }
    const bad = lintC(SUBJ, HELLO.replace("I'm Yash.", "I'm Yash from SubhSandesh."));
    const badItems = inboxCheck({ style: "personal", kind: "initial", body: "", lint: bad, sender: YASH, subject: SUBJ, touch: "connect" });
    assert.equal(badItems.find((i) => i.label === "No company pitch — just a hello")?.ok, false);
    const fu = inboxCheck({ style: "personal", kind: "followup", body: BUMP, lint: lintC("Re: x", BUMP, { kind: "followup" }), sender: YASH, subject: "Re: x", touch: "connect" });
    assert.ok(fu.some((i) => i.label === "Short (20–45 words)"));
  });
});

describe("numbers and screenshot are off for Connect", () => {
  const person = { name: "Om & Diya", instagram: "theecouple__", niche: "", note: "Couple love & lifestyle (Assam)" };
  it("a proof on a Connect draft is ignored — no REAL NUMBERS in the prompt", () => {
    const ctx: ProspectDraftContext = { mode: "personal", style: "personal", touch: "connect", person, programme, proof: PROOF };
    assert.equal(hasProof(ctx), false);
    const p = buildProspectPrompt(ctx, "english");
    assert.ok(!p.includes("REAL NUMBERS"));
    assert.ok(!p.includes("52.2K"));
    assert.ok(!p.includes(JOIN));
    assert.equal(hasProof({ ...ctx, touch: "pitch" }), true);
  });

  it("the Inbox check refuses a Connect note that would carry the screenshot", () => {
    const items = inboxCheck({ style: "personal", kind: "initial", body: HELLO, lint: lintC(SUBJ, HELLO), sender: YASH, subject: SUBJ, touch: "connect", image: true });
    assert.equal(items.find((i) => i.label === "No links, numbers or images")?.ok, false);
  });

  it("scrubCounts drops follower counts from what the model sees", () => {
    assert.equal(scrubCounts("47K followers · Couple love & lifestyle (Assam)"), "Couple love & lifestyle (Assam)");
    assert.equal(scrubCounts("Comedy sketches, 1.2M subscribers"), "Comedy sketches");
  });
});

describe("drafting a Connect note (stub model)", () => {
  const person = { name: "Om & Diya", instagram: "theecouple__", niche: "", note: "47K followers · Couple love & lifestyle (Assam)" };
  it("uses the deterministic subject, the connect system prompt, and passes the linter", async () => {
    let sys = "";
    const d = await draftProspectMail({ mode: "personal", style: "personal", touch: "connect", person, programme, angle: "b" }, async (s) => {
      sys = s;
      return JSON.stringify({ reading: "r", subject: "Hey there", body: HELLO });
    });
    assert.equal(d.subject, "Hey Om & Diya, quick hello from Yash");
    assert.ok(!/subhsandesh/i.test(sys));
  });

  it("a model that slips the company in is refused (and retried by the caller)", async () => {
    await assert.rejects(
      draftProspectMail({ mode: "personal", style: "personal", touch: "connect", person, programme }, async () =>
        JSON.stringify({ reading: "r", subject: "x", body: HELLO.replace("I'm Yash.", "I'm Yash from SubhSandesh.") })
      ),
      /spam check/
    );
  });
});

describe("reply after a Connect note", () => {
  const person = { name: "Om & Diya", instagram: "theecouple__", niche: "", note: "Couple love & lifestyle (Assam)" };
  const messages = [
    { direction: "outbound" as const, body: HELLO, at: new Date("2026-10-15") },
    { direction: "inbound" as const, body: "Hey Yash, sure — what's it about?", at: new Date("2026-10-18") },
  ];
  it("tells the model the earlier email was only a hello, and gives it the full context", () => {
    const p = buildProspectPrompt({ mode: "reply", style: "personal", person, programme, messages, afterConnect: true, proof: PROOF }, "english");
    assert.match(p, /only a short hello asking to connect/);
    assert.match(p, /do not open with “I'm …” again/);
    assert.match(p, /Answer what they actually wrote first/);
    assert.match(p, /PROGRAMME FACTS/);
    assert.ok(p.includes(JOIN));
    assert.match(p, /REAL NUMBERS/);
    assert.ok(p.includes("52.2K"));
    assert.match(p, /pays them for that reel/);
    assert.match(p, /next step/);
  });

  it("a reply that was not after a Connect note keeps the old brief", () => {
    const p = buildProspectPrompt({ mode: "reply", style: "personal", person, programme, messages }, "english");
    assert.ok(!/only a short hello/.test(p));
  });
});
