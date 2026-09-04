// ─── Whose profile does a feedback item or a conversation open? ──────────────
//
// The admin panels want to jump from "this person left 2 stars" to that
// person's account. Two things make it more than a string concatenation:
//
//   · A conversation may have NO userId. An unmatched inbound thread is opened
//     from an email address alone, because somebody wrote in and nothing we
//     held matched them. `User.email` is unique, lowercase and indexed, so
//     resolving it is exact rather than a guess.
//
//   · The account may be GONE. `PageFeedback.userId` is a plain ObjectId ref
//     with no cascade, so deleting a user leaves feedback pointing at nothing.
//     A link rendered from that id opens a 404 — worse than no link, because
//     it looks like the panel is broken rather than like the account is gone.
//
// The decision itself is pure and lives in `pickProfileUserId`. The batched
// query around it is what makes it one round trip per page instead of one per
// row.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pickProfileUserId } from "./profileLink.service";

const ALICE = "68b0f1aaaaaaaaaaaaaaaaaa";
const BOB = "68b0f1bbbbbbbbbbbbbbbbbb";

/** Users that exist, as the batched query would report them. */
const live = {
  ids: new Set([ALICE, BOB]),
  byEmail: new Map([
    ["alice@example.com", ALICE],
    ["bob@example.com", BOB],
  ]),
};

describe("pickProfileUserId", () => {
  it("uses the userId when the account exists", () => {
    assert.equal(pickProfileUserId({ userId: ALICE }, live), ALICE);
  });

  it("resolves by email when there is no userId", () => {
    // The unmatched-inbound case: somebody wrote in, nothing matched, so the
    // thread carries an address and nothing else.
    assert.equal(pickProfileUserId({ userEmail: "bob@example.com" }, live), BOB);
  });

  it("matches an email case-insensitively and ignores surrounding space", () => {
    // Mail headers arrive however the sending client felt like writing them,
    // and `User.email` is stored lowercase.
    assert.equal(pickProfileUserId({ userEmail: "  BOB@Example.COM " }, live), BOB);
  });

  it("extracts the address from a display-name header", () => {
    // `"Asha Verma" <asha@example.com>` is a legal From, and a thread opened
    // from one can carry the whole string.
    assert.equal(
      pickProfileUserId({ userEmail: '"Bob" <bob@example.com>' }, live),
      BOB
    );
  });

  it("RETURNS NOTHING for a userId whose account is gone", () => {
    // The deleted-user case. A link built from this id 404s, which reads as our
    // bug rather than as a missing account.
    assert.equal(pickProfileUserId({ userId: "68b0f1cccccccccccccccccc" }, live), "");
  });

  it("falls back to the email when the userId is stale but the address is known", () => {
    // Genuinely reachable: a user deleted and re-registered with the same
    // address gets a NEW _id, so the old feedback row points at the dead one
    // while the address points at the live account. The live account is the
    // useful answer.
    assert.equal(
      pickProfileUserId({ userId: "68b0f1cccccccccccccccccc", userEmail: "alice@example.com" }, live),
      ALICE
    );
  });

  it("returns nothing when neither is known", () => {
    assert.equal(pickProfileUserId({ userEmail: "stranger@example.com" }, live), "");
    assert.equal(pickProfileUserId({}, live), "");
    assert.equal(pickProfileUserId({ userId: "", userEmail: "" }, live), "");
  });

  it("never returns anything for our own addresses appearing as a sender", () => {
    // `inbox@reply.subhsandesh.in` is not a person, and if one of our own
    // addresses ever ends up as a thread's userEmail it must not resolve to
    // whatever account happens to share it.
    const withOurs = {
      ids: new Set<string>(),
      byEmail: new Map([["feedback@subhsandesh.in", "68b0f1dddddddddddddddddd"]]),
    };
    assert.equal(
      pickProfileUserId({ userEmail: "feedback@subhsandesh.in" }, withOurs, ["feedback@subhsandesh.in"]),
      ""
    );
  });

  it("tolerates junk without throwing", () => {
    for (const bad of [null, undefined, 42, {}, [], "not-an-id"]) {
      assert.equal(pickProfileUserId({ userId: bad as never }, live), "");
    }
    assert.equal(pickProfileUserId({ userEmail: 42 as never }, live), "");
  });

  it("does not treat the placeholder address as a person", () => {
    // `sesInbound` opens a thread as `unknown@unknown.invalid` when it cannot
    // read a sender at all.
    assert.equal(pickProfileUserId({ userEmail: "unknown@unknown.invalid" }, live), "");
  });
});
