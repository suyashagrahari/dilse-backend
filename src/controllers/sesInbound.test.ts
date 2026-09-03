import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ourAddresses, senderOf } from "./sesInbound.controller";
import { env } from "../config/env";

// Every case here is a real forwarding behaviour. The reason `senderOf` exists
// at all is that a forwarded copy of a reply often no longer says who wrote it
// in the place you would look first.
describe("senderOf", () => {
  it("takes the plain From when nothing was rewritten", () => {
    assert.equal(senderOf("", "Asha <asha@gmail.com>", "asha@gmail.com"), "asha@gmail.com");
  });

  it("prefers Reply-To, which a forwarder has no reason to touch", () => {
    assert.equal(
      senderOf("asha@gmail.com", `SubhSandesh <${env.SES_FROM_EMAIL}>`, env.SES_FROM_EMAIL),
      "asha@gmail.com"
    );
  });

  it("never attributes a reply to our own address", () => {
    // The failure this prevents: a forwarded copy whose From is now the
    // forwarding mailbox, matched against a thread belonging to nobody and
    // shown as the creator having written to themselves.
    assert.equal(senderOf("", env.SES_FROM_EMAIL, "asha@gmail.com"), "asha@gmail.com");
  });

  it("falls through to the envelope when the headers are useless", () => {
    assert.equal(senderOf("", "", "asha@gmail.com"), "asha@gmail.com");
  });

  it("pulls the address out of a display name with punctuation", () => {
    assert.equal(
      senderOf("", '"Agrahari, Asha" <asha.b@example.co.in>', ""),
      "asha.b@example.co.in"
    );
  });

  it("lowercases, because matching is by address", () => {
    assert.equal(senderOf("", "ASHA@GMAIL.COM", ""), "asha@gmail.com");
  });

  it("strips trailing punctuation from a bare address in a list", () => {
    assert.equal(senderOf("asha@gmail.com, someone@else.com", "", ""), "asha@gmail.com");
  });

  it("returns empty when there is no address anywhere — the unmatched path", () => {
    assert.equal(senderOf("", "", ""), "");
    assert.equal(senderOf("undisclosed recipients", "no address", ""), "");
  });

  // ── The reply address is us too ─────────────────────────────────────────
  //
  // Our outbound mail asks for replies at the SES receiving address, not at
  // the From address, because apex mail belongs to GoDaddy. That put one of
  // our own addresses into `Reply-To` — the field consulted FIRST below. So a
  // forwarded copy of something we sent now arrives with our address in the
  // winning position, and excluding only the From address is no longer enough.
  const OURS = ["feedback@subhsandesh.in", "inbox@reply.subhsandesh.in", "verify@subhsandesh.in"];

  it("does not attribute a forwarded copy to our own receiving address", () => {
    assert.equal(
      senderOf("SubhSandesh <inbox@reply.subhsandesh.in>", "Asha <asha@gmail.com>", "", OURS),
      "asha@gmail.com"
    );
  });

  it("skips past our address to the real author inside the same header", () => {
    assert.equal(
      senderOf("inbox@reply.subhsandesh.in, asha@gmail.com", "", "", OURS),
      "asha@gmail.com"
    );
  });

  it("treats the sign-in sender as ours as well", () => {
    assert.equal(senderOf("verify@subhsandesh.in", "Asha <asha@gmail.com>", "", OURS), "asha@gmail.com");
  });

  it("returns nothing rather than naming ourselves when we are the only address", () => {
    assert.equal(senderOf("inbox@reply.subhsandesh.in", "feedback@subhsandesh.in", "", OURS), "");
  });

  it("ourAddresses reads every address we send as, stripped of display names", () => {
    const list = ourAddresses();
    assert.ok(list.length >= 1, "at least the From address");
    for (const a of list) {
      assert.ok(/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(a), `not a bare address: ${a}`);
    }
    // Whatever the deployment is configured with, the From address is always
    // one of ours — that invariant is what keeps a forwarded copy of our own
    // mail from being read back as a creator's reply.
    assert.ok(list.includes(String(env.SES_FROM_EMAIL).toLowerCase()));
  });
});
