import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addressedToFilter, senderFrom } from "./imapPoller.service";

const WANTED = ["feedback@subhsandesh.in"];
const OURS = ["feedback@subhsandesh.in", "support@subhsandesh.in"];

// `support@subhsandesh.in` is a SHARED inbox: ordinary support mail sits in it
// beside the draft replies. This filter is the only thing separating them, and
// both directions of failure are bad — too strict and replies never appear at
// all, too loose and every support email becomes a fake "conversation" with a
// customer in the admin panel.
describe("addressedToFilter", () => {
  it("matches a plain To", () => {
    assert.equal(addressedToFilter({ to: "feedback@subhsandesh.in" }, WANTED), true);
  });

  it("matches inside a display name", () => {
    assert.equal(
      addressedToFilter({ to: '"SubhSandesh Feedback" <feedback@subhsandesh.in>' }, WANTED),
      true
    );
  });

  it("matches when it is one of several recipients", () => {
    assert.equal(
      addressedToFilter({ to: "someone@else.com, feedback@subhsandesh.in, third@x.com" }, WANTED),
      true
    );
  });

  it("matches on Cc", () => {
    assert.equal(addressedToFilter({ to: "a@b.com", cc: "feedback@subhsandesh.in" }, WANTED), true);
  });

  it("matches on Delivered-To, which is where some providers put the alias", () => {
    assert.equal(
      addressedToFilter({ to: "support@subhsandesh.in", "delivered-to": "feedback@subhsandesh.in" }, WANTED),
      true
    );
  });

  it("matches on X-Original-To", () => {
    assert.equal(
      addressedToFilter({ to: "support@subhsandesh.in", "x-original-to": "feedback@subhsandesh.in" }, WANTED),
      true
    );
  });

  it("matches on the envelope, for a Bcc that appears in no visible header", () => {
    assert.equal(addressedToFilter({ "envelope-to": "feedback@subhsandesh.in" }, WANTED), true);
  });

  it("is case-insensitive", () => {
    assert.equal(addressedToFilter({ to: "FeedBack@SubhSandesh.IN" }, WANTED), true);
  });

  // ── The too-loose direction ─────────────────────────────────────────────
  it("does NOT match ordinary support mail", () => {
    assert.equal(
      addressedToFilter({ to: "support@subhsandesh.in", from: "customer@gmail.com" }, WANTED),
      false
    );
  });

  it("does NOT match a message that merely mentions the address in its subject", () => {
    // The failure this prevents: matching on the raw message text would drag
    // in every email that quotes our footer, which says the address.
    assert.equal(
      addressedToFilter({ to: "support@subhsandesh.in", subject: "about feedback@subhsandesh.in" }, WANTED),
      false
    );
  });

  it("does NOT match a different mailbox on the same domain", () => {
    assert.equal(addressedToFilter({ to: "newsletter@subhsandesh.in" }, WANTED), false);
  });

  it("does NOT match an address that merely CONTAINS ours", () => {
    assert.equal(addressedToFilter({ to: "notfeedback@subhsandesh.in" }, WANTED), false);
    assert.equal(addressedToFilter({ to: "feedback@subhsandesh.in.evil.com" }, WANTED), false);
  });

  it("matches nothing when the filter is empty, rather than everything", () => {
    // The dangerous default. An unset IMAP_FILTER_TO must ingest NOTHING, not
    // the entire shared inbox.
    assert.equal(addressedToFilter({ to: "feedback@subhsandesh.in" }, []), false);
  });

  it("handles a message with no recipient headers at all", () => {
    assert.equal(addressedToFilter({}, WANTED), false);
    assert.equal(addressedToFilter({ to: "" }, WANTED), false);
  });

  it("supports more than one filter address", () => {
    const two = ["feedback@subhsandesh.in", "drafts@subhsandesh.in"];
    assert.equal(addressedToFilter({ to: "drafts@subhsandesh.in" }, two), true);
    assert.equal(addressedToFilter({ to: "other@subhsandesh.in" }, two), false);
  });
});

describe("senderFrom", () => {
  it("reads the creator off From", () => {
    assert.equal(senderFrom({ from: "Asha Rao <asha@gmail.com>" }, OURS), "asha@gmail.com");
  });

  it("prefers Reply-To, which the original sender's client set", () => {
    assert.equal(
      senderFrom({ "reply-to": "asha@gmail.com", from: "feedback@subhsandesh.in" }, OURS),
      "asha@gmail.com"
    );
  });

  it("refuses every address that is us", () => {
    // Our own sent copy sitting in the shared inbox. Attributing it to a
    // creator would show us writing to ourselves inside their conversation.
    assert.equal(senderFrom({ from: "feedback@subhsandesh.in" }, OURS), "");
    assert.equal(senderFrom({ from: "support@subhsandesh.in" }, OURS), "");
  });

  it("falls through past our address to a real one", () => {
    assert.equal(
      senderFrom({ from: "feedback@subhsandesh.in, asha@gmail.com" }, OURS),
      "asha@gmail.com"
    );
  });

  it("falls back to Return-Path", () => {
    assert.equal(senderFrom({ "return-path": "<asha@gmail.com>" }, OURS), "asha@gmail.com");
  });

  it("lowercases", () => {
    assert.equal(senderFrom({ from: "ASHA@GMAIL.COM" }, OURS), "asha@gmail.com");
  });

  it("returns empty when there is nothing usable", () => {
    assert.equal(senderFrom({}, OURS), "");
    assert.equal(senderFrom({ from: "undisclosed recipients" }, OURS), "");
  });
});
