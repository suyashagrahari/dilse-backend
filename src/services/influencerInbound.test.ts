// ─── Does an influencer's reply land in their chat? ─────────────────────────
//
// Modelled on feedbackReplyMatching.test: the ladder is exercised rung by
// rung, here through injected lookups so no Mongo is needed. Each case is a
// real way a reply arrives — exact headers, headers stripped but our footer
// quoted, a reply from a different address, an influencer writing in first.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchInfluencerInbound, type InfluencerMatchDeps } from "./threadStore.service";
import { inboundText } from "./inboundIngest.service";
import { extractThreadToken } from "./influencerMail.service";
import type { IEmailThread } from "../models/EmailThread";

const THREAD = { _id: "t1", kind: "influencer", userEmail: "priya@example.com", threadToken: "INF-7K2Q9MXA" } as unknown as IEmailThread;
const OTHER = { _id: "t2", kind: "influencer", userEmail: "rahul@example.com", threadToken: "INF-AAAAAAAA" } as unknown as IEmailThread;

function deps(over: Partial<InfluencerMatchDeps> = {}): InfluencerMatchDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    byMessageId: async (id) => { calls.push(`id:${id}`); return id === "<sent-1@email.amazonses.com>" ? THREAD : null; },
    byToken: async (t) => { calls.push(`token:${t}`); return t === "INF-AAAAAAAA" ? OTHER : t === "INF-7K2Q9MXA" ? THREAD : null; },
    latestForEmail: async (e) => { calls.push(`email:${e}`); return e === "priya@example.com" ? THREAD : null; },
    influencerUserByEmail: async (e) => { calls.push(`user:${e}`); return e === "new@example.com" ? { _id: "u9", name: "Neha", email: e } : null; },
    ...over,
  };
}

const ev = (o: Partial<Parameters<typeof matchInfluencerInbound>[0]>) => ({
  fromEmail: "",
  subject: "",
  inReplyTo: "",
  references: "",
  messageId: "",
  token: "",
  ...o,
});

describe("matchInfluencerInbound", () => {
  it("rung 1: exact In-Reply-To wins over everything", async () => {
    const d = deps();
    const m = await matchInfluencerInbound(ev({ fromEmail: "rahul@example.com", inReplyTo: "<sent-1@email.amazonses.com>", token: "INF-AAAAAAAA" }), d);
    assert.equal(m.rung, "headers");
    assert.equal(m.thread, THREAD);
  });

  it("rung 2: the footer token places a reply from a DIFFERENT address", async () => {
    // Priya replies from her work mail; headers stripped by her client.
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya@work.example", token: "INF-7K2Q9MXA" }), deps());
    assert.equal(m.rung, "token");
    assert.equal(m.thread, THREAD);
  });

  it("rung 3: same sender, no headers, no token", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya@example.com", subject: "quick question" }), deps());
    assert.equal(m.rung, "sender");
    assert.equal(m.thread, THREAD);
  });

  it("rung 4: an influencer writing in first gets their chat opened", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "new@example.com", subject: "Hi!" }), deps());
    assert.equal(m.rung, "sender");
    assert.equal(m.thread, null);
    assert.equal(m.influencerUser?.email, "new@example.com");
  });

  it("rung 5: a stranger is unmatched, not stapled to somebody's chat", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "spam@example.com", subject: "Collab?" }), deps());
    assert.equal(m.rung, "none");
    assert.equal(m.thread, null);
    assert.equal(m.influencerUser, undefined);
  });

  it("an unknown token falls through to the sender rung", async () => {
    const m = await matchInfluencerInbound(ev({ fromEmail: "priya@example.com", token: "INF-ZZZZZZZZ" }), deps());
    assert.equal(m.rung, "sender");
  });

  it("checks References newest-first and each id once", async () => {
    const d = deps();
    await matchInfluencerInbound(ev({ inReplyTo: "<x@y>", references: "<root@y> <x@y>" }), d);
    assert.deepEqual(d.calls.filter((c) => c.startsWith("id:")), ["id:<x@y>", "id:<root@y>"]);
  });

  it("with no sender and no evidence, does not query by email at all", async () => {
    const d = deps();
    const m = await matchInfluencerInbound(ev({}), d);
    assert.equal(m.rung, "none");
    assert.ok(!d.calls.some((c) => c.startsWith("email:") || c.startsWith("user:")));
  });
});

describe("the evidence the ingest step extracts", () => {
  it("finds our token in the RAW body even though the trim removes the quote", () => {
    const raw = "Done, posted!\n\nOn Tue, SubhSandesh Creators wrote:\n> Ref: INF-7K2Q9MXA";
    assert.equal(extractThreadToken("Re: Welcome", raw), "INF-7K2Q9MXA");
  });
});

describe("inboundText — inbound HTML is never stored", () => {
  it("prefers the text part", () => {
    assert.equal(inboundText({ text: "hello", html: "<b>other</b>" }), "hello");
  });

  it("renders an HTML-only mail to text, dropping scripts and tags", () => {
    const t = inboundText({
      text: false,
      html: '<p>Hi team</p><script>alert(1)</script><img src=x onerror="steal()"><p>Payment kab &amp; kaise?</p>',
    });
    assert.equal(t, "Hi team\nPayment kab & kaise?");
    assert.ok(!/script|onerror|</.test(t));
  });

  it("is empty for an empty mail", () => {
    assert.equal(inboundText({ text: "", html: "" }), "");
  });
});
