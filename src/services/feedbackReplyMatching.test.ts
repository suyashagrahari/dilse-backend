// ─── Can a creator's reply still be found if they write from a new address? ──
//
// This is the claim the SES switch was made for, so it gets asserted rather
// than argued.
//
// The inbound ladder in `threadStore.service` is tried in order:
//
//   1. headers   — In-Reply-To / References against an id we recorded
//   2. subject   — userEmail + subjectKey
//   3. recent    — userEmail + an open conversation, reply-shaped only
//   4. none      — opens an "Unmatched" thread
//
// Rungs 2 and 3 both require `userEmail` to match, and rung 3 sits behind
// `if (!from) return`. So the ONLY rung that can place a reply from an address
// we have never seen is rung 1 — and rung 1 needs the Message-ID of what we
// sent.
//
// Feedback replies went via Resend, which reports no Message-ID and documents
// no pattern to reconstruct one, so they recorded `rfcMessageId: ""`. Rung 1
// could never fire for them. A creator who signed up with a work address and
// replied from their phone's personal account therefore landed in Unmatched,
// looking like a stranger writing in.
//
// These tests work on `rfcMessageIdFor` and `threadingHeadersFor` — the two
// pure functions the chain actually turns on — rather than on the database.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rfcMessageIdFor,
  threadingHeadersFor,
  normalizeMessageId,
  parseMessageIds,
} from "./emailThread.service";

describe("the id we record for a feedback reply", () => {
  it("reconstructs the real header value from what SES returns", () => {
    // SES returns a bare id and writes `<id@email.amazonses.com>` as the
    // header. Getting this pattern wrong means recording an id that never
    // existed, and the creator's reply would then match nothing.
    const id = rfcMessageIdFor("0100019240ab1234-abcd-ef01-2345-6789abcdef01-000000", "us-east-1");
    assert.equal(id, "<0100019240ab1234-abcd-ef01-2345-6789abcdef01-000000@email.amazonses.com>");
  });

  it("uses the regional domain outside us-east-1", () => {
    assert.equal(rfcMessageIdFor("abc123", "ap-south-1"), "<abc123@ap-south-1.amazonses.com>");
  });

  it("is EMPTY when there is no id — which is what Resend gives us", () => {
    // The honest answer. An invented id is worse than none: an unrelated
    // inbound reply could match a header we never actually sent.
    assert.equal(rfcMessageIdFor("", "us-east-1"), "");
    assert.equal(rfcMessageIdFor("   ", "us-east-1"), "");
  });
});

describe("what a creator's mail client will send back", () => {
  /** A feedback conversation as it stands after our first reply went via SES. */
  const afterSesReply = [
    // Their in-app comment. Arrived through a form, so it has no id at all —
    // which is exactly why the FIRST reply cannot be threaded and the second
    // can.
    { direction: "inbound" as const, rfcMessageId: "", rfcMessageIdSource: "" as const },
    {
      direction: "outbound" as const,
      rfcMessageId: "<ses-reply-1@email.amazonses.com>",
      rfcMessageIdSource: "reconstructed" as const,
      references: [],
    },
  ];

  it("anchors to our sent reply, so their answer carries an id we hold", () => {
    const h = threadingHeadersFor(afterSesReply);
    assert.equal(h.inReplyTo, "<ses-reply-1@email.amazonses.com>");
    assert.equal(h.confidence, "reconstructed");
  });

  it("THE FIX: their In-Reply-To matches the id we stored", () => {
    // A conforming mail client echoes the Message-ID it is replying to. That
    // echoed value is what rung 1 looks up — and it does not involve the
    // sender's address at all, which is the whole point: it works no matter
    // which account they reply from.
    const ourStoredId = rfcMessageIdFor("ses-reply-1@email.amazonses.com", "us-east-1");
    const theirInReplyTo = "<ses-reply-1@email.amazonses.com>";

    assert.equal(normalizeMessageId(theirInReplyTo), ourStoredId);
    assert.ok(parseMessageIds(theirInReplyTo).includes(ourStoredId));
  });

  it("matches even when their client mangles the brackets or spacing", () => {
    // Clients are inconsistent here, and an id compared with brackets against
    // one stored without them fails silently — surfacing as a reply that
    // started its own thread.
    const stored = "<ses-reply-1@email.amazonses.com>";
    for (const mangled of [
      "ses-reply-1@email.amazonses.com",
      "  <ses-reply-1@email.amazonses.com>  ",
      "<<ses-reply-1@email.amazonses.com>>",
    ]) {
      assert.equal(normalizeMessageId(mangled), stored, `failed on ${JSON.stringify(mangled)}`);
    }
  });

  it("finds our id inside a long References chain", () => {
    // Their client sends the whole ancestry, not just the parent. Rung 1 has to
    // look through all of it.
    const chain =
      "<their-older@mail.example> <ses-reply-1@email.amazonses.com> <another@mail.example>";
    assert.ok(parseMessageIds(chain).includes("<ses-reply-1@email.amazonses.com>"));
  });

  it("WHAT WAS BROKEN: with no recorded id there is nothing to anchor to", () => {
    // The Resend shape. `threadingHeadersFor` has no id to point at, so our
    // reply goes out unthreaded, their answer echoes nothing we know, and rung
    // 1 cannot fire — leaving only the rungs that require their address to
    // match.
    const afterResendReply = [
      { direction: "inbound" as const, rfcMessageId: "", rfcMessageIdSource: "" as const },
      { direction: "outbound" as const, rfcMessageId: "", rfcMessageIdSource: "" as const },
    ];
    const h = threadingHeadersFor(afterResendReply);
    assert.equal(h.inReplyTo, "");
    assert.equal(h.references, "");
    assert.equal(h.confidence, "none");
  });
});
