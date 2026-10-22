// ─── Influencer mail: addresses, the footer reference, the send ─────────────
//
// No real email is sent from here. `sendInfluencerMail` is always given a
// recording transport; the one test of the un-injected path only runs when
// this environment has no SES credentials and no stub, where it must refuse.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractThreadToken,
  influencerInboundAddresses,
  influencerMailHtml,
  influencerMailText,
  influencerSendMode,
  InfluencerMailNotConfiguredError,
  isInfluencerRecipient,
  newThreadToken,
  sendInfluencerMail,
  type MailTransport,
} from "./influencerMail.service";
import type { SesEmail } from "./ses.service";

describe("influencerInboundAddresses", () => {
  it("collects From, Reply-To and extras, lowercased and deduped", () => {
    assert.deepEqual(
      influencerInboundAddresses(
        "Influencer-Support@SubhSandesh.in",
        "",
        "influencer@reply.subhsandesh.in, influencer-support@subhsandesh.in ,",
        ""
      ),
      ["influencer-support@subhsandesh.in", "influencer@reply.subhsandesh.in"]
    );
  });

  it("includes the personal prospect sender, whose replies arrive by forward", () => {
    assert.ok(influencerInboundAddresses("influencer-support@subhsandesh.in", "", "", "Yash@SubhSandesh.in").includes("yash@subhsandesh.in"));
  });

  it("drops anything that is not an address", () => {
    assert.deepEqual(influencerInboundAddresses("not-an-address", "", "", ""), []);
  });
});

describe("isInfluencerRecipient — which ladder an arriving mail goes to", () => {
  const wanted = ["influencer-support@subhsandesh.in", "influencer@reply.subhsandesh.in"];

  it("matches the address in a display-name header", () => {
    assert.ok(isInfluencerRecipient(['"SubhSandesh Creators" <influencer-support@subhsandesh.in>'], wanted));
  });

  it("matches the SES envelope destination of a forwarded copy", () => {
    assert.ok(isInfluencerRecipient(["support@subhsandesh.in", "influencer@reply.subhsandesh.in"], wanted));
  });

  it("does not match feedback mail", () => {
    assert.equal(isInfluencerRecipient(["feedback@subhsandesh.in", "inbox@reply.subhsandesh.in"], wanted), false);
  });

  it("does not match a lookalike address", () => {
    assert.equal(isInfluencerRecipient(["xinfluencer-support@subhsandesh.in.evil.com"], wanted), false);
  });

  it("is false with nothing configured", () => {
    assert.equal(isInfluencerRecipient(["influencer-support@subhsandesh.in"], []), false);
  });
});

describe("the footer reference", () => {
  it("is INF- plus 8 unambiguous characters", () => {
    for (let i = 0; i < 50; i++) assert.match(newThreadToken(), /^INF-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  });

  it("is read back out of Gmail-style quoted history", () => {
    const reply = [
      "Haan ji, I'll post tomorrow!",
      "",
      "On Wed, 14 Oct 2026 at 10:02, SubhSandesh Creators <influencer-support@subhsandesh.in> wrote:",
      "> Hi Priya,",
      "> —",
      "> Ref: INF-7K2Q9MXA",
    ].join("\n");
    assert.equal(extractThreadToken("Re: Welcome", reply), "INF-7K2Q9MXA");
  });

  it("is case-insensitive and canonicalised", () => {
    assert.equal(extractThreadToken("re: [inf-7k2q9mxa] hello"), "INF-7K2Q9MXA");
  });

  it("is empty when absent, and ignores a partial", () => {
    assert.equal(extractThreadToken("Re: hi", "no reference here INF-123"), "");
  });
});

describe("the email body", () => {
  const content = {
    body: "Hi <Priya>,\n\nShare https://subhsandesh.in/r/priya today.\n\nTeam SubhSandesh",
    token: "INF-7K2Q9MXA",
    fromAddress: "influencer-support@subhsandesh.in",
    replyToAddress: "influencer-support@subhsandesh.in",
  };

  it("plain text carries the reply address and the reference", () => {
    const t = influencerMailText(content);
    assert.match(t, /influencer-support@subhsandesh\.in/);
    assert.match(t, /Ref: INF-7K2Q9MXA/);
  });

  it("HTML escapes what was typed and links bare URLs", () => {
    const h = influencerMailHtml(content);
    assert.ok(h.includes("Hi &lt;Priya&gt;,"));
    assert.ok(!h.includes("<Priya>"));
    assert.ok(h.includes('<a href="https://subhsandesh.in/r/priya"'));
    assert.ok(h.includes("Ref: INF-7K2Q9MXA"));
  });
});

describe("sendInfluencerMail", () => {
  it("sends as influencer-support@, asks for replies there, and threads", async () => {
    const seen: SesEmail[] = [];
    const transport: MailTransport = async (e) => {
      seen.push(e);
      return { outcome: "sent", messageId: "0100019abc-def" };
    };
    const r = await sendInfluencerMail(
      {
        to: "priya@example.com",
        subject: "Re: Welcome",
        body: "Hi Priya, thanks for the reel!",
        token: "INF-7K2Q9MXA",
        inReplyTo: "<a@b>",
        references: "<root@b> <a@b>",
      },
      transport
    );
    assert.equal(seen.length, 1);
    const e = seen[0];
    assert.equal(e.from, "influencer-support@subhsandesh.in");
    assert.match(String(e.replyTo), /<influencer-support@subhsandesh\.in>$/);
    assert.equal(e.headers?.["In-Reply-To"], "<a@b>");
    assert.equal(e.headers?.References, "<root@b> <a@b>");
    assert.match(e.text, /Ref: INF-7K2Q9MXA/);
    assert.ok(e.html);
    assert.match(r.rfcMessageId, /^<0100019abc-def@.*amazonses\.com>$/);
    assert.equal(r.via, "ses");
  });

  it("never reports success when the transport skipped", async () => {
    await assert.rejects(
      sendInfluencerMail(
        { to: "p@example.com", subject: "Hi", body: "Hello there friend", token: "INF-7K2Q9MXA" },
        async () => ({ outcome: "skipped" })
      ),
      InfluencerMailNotConfiguredError
    );
  });

  it("refuses, loudly, on a deployment with no way to send", { skip: influencerSendMode() !== "off" }, async () => {
    await assert.rejects(
      sendInfluencerMail({ to: "p@example.com", subject: "Hi", body: "Hello there friend", token: "INF-7K2Q9MXA" }),
      InfluencerMailNotConfiguredError
    );
  });
});
