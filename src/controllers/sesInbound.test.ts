import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { senderOf } from "./sesInbound.controller";
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
});
