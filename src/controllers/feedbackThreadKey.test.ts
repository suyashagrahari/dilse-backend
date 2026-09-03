// ─── Finding the conversation a feedback reply belongs to ────────────────────
//
// When a super admin replies to in-app feedback, `adminFeedback.controller`
// looks for an existing `kind: "feedback"` conversation for that person and
// that subject, and opens one only if there is none.
//
// The lookup and the write have to agree on what the subject key IS. They did
// not: `openThread` stores `subjectKey(subject)`, while the lookup normalised
// the subject by hand with a single `^re:` strip. The subject is HAND-TYPED by
// the admin, so every divergence below is reachable by someone simply typing.
//
// The failure is quiet and cumulative. A missed lookup does not error — it
// opens a SECOND conversation with the same person about the same thing, and
// re-appends their original feedback comment as the opening message. Reply
// three times and the panel shows three near-identical conversations, two of
// which look abandoned. An inbound reply then matches on `userEmail +
// subjectKey` sorted by `seq` descending, so it lands on the newest fragment
// and the earlier ones never gain another message.
//
// These tests pin the two to each other rather than to a literal, because what
// matters is that they cannot drift apart again.

import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { subjectKey } from "../services/emailThread.service";
import { feedbackThreadSubjectKey } from "./adminFeedback.controller";

/** Subjects a super admin can produce by typing, all of which used to diverge. */
const TYPED_SUBJECTS = [
  "Thanks for the feedback",
  // Two spaces. The stored key collapses runs of whitespace; the hand-rolled
  // one did not, so these two produced different keys for the same subject.
  "Thanks  for the feedback",
  "Thanks for the feedback ",
  " Thanks for the feedback",
  // A tab survives the controller's sanitiser, which only strips \r and \n.
  "Thanks\tfor the feedback",
  // Clients stack these, and so do people replying by hand.
  "Re: Thanks for the feedback",
  "RE: Thanks for the feedback",
  "re:Thanks for the feedback",
  "Re: Re: Thanks for the feedback",
  "Fwd: Thanks for the feedback",
  "Re: Fwd: Thanks for the feedback",
  // Case is not meaning.
  "THANKS FOR THE FEEDBACK",
];

test("the lookup key matches the key openThread stores, for every typed subject", () => {
  for (const s of TYPED_SUBJECTS) {
    assert.equal(
      feedbackThreadSubjectKey(s),
      subjectKey(s),
      `diverged on ${JSON.stringify(s)} — this opens a duplicate conversation`
    );
  }
});

test("every spelling of one subject collapses to the SAME key", () => {
  // The point of the whole exercise: an admin who types "Re: Thanks  for the
  // feedback" on their second reply must land on the conversation their first
  // reply opened.
  const keys = new Set(TYPED_SUBJECTS.map(feedbackThreadSubjectKey));
  assert.equal(
    keys.size,
    1,
    `expected one key, got ${keys.size}: ${JSON.stringify([...keys])}`
  );
});

test("different subjects still get different keys", () => {
  // Normalising must not go so far that two genuinely separate conversations
  // merge — that would attach a reply about one page to a thread about another.
  assert.notEqual(
    feedbackThreadSubjectKey("Thanks for the feedback"),
    feedbackThreadSubjectKey("About your wedding page")
  );
});

test("an empty or punctuation-only subject does not become a wildcard key", () => {
  // A blank key would match every conversation whose subject also normalised to
  // blank, merging unrelated people's threads. The controller rejects an empty
  // subject before this is reached; this asserts the key itself is honest about
  // being empty rather than quietly matching everything.
  assert.equal(feedbackThreadSubjectKey(""), "");
  assert.equal(feedbackThreadSubjectKey("   "), "");
  assert.equal(feedbackThreadSubjectKey("Re:"), "");
  assert.equal(feedbackThreadSubjectKey("Re: Re:"), "");
});

// ─── The same bug, reachable a second way ────────────────────────────────────
//
// Fixing the subject key was not enough on its own. Moving the conversation
// lookup ABOVE the send — so `In-Reply-To` could be on the outgoing message —
// introduced a second route to the identical outcome, and it is worth an
// assertion because it is invisible in review.
//
// The pre-send read has its own try/catch, because a failure to read must not
// stop a support reply going out. That leaves `existing === null` meaning two
// different things:
//
//   · there is genuinely no conversation yet        → open one
//   · the read threw and we never found out         → DO NOT open one
//
// Treating the second as the first opens a duplicate conversation with the
// same person — precisely the forking this file exists to prevent, arrived at
// from the other direction. So the two cases are tracked apart and a failed
// read is retried at recording time.
//
// Asserted against the source because the branch needs a thrown database read
// to reach, and `config/env` is computed once at first import so the module
// cannot be re-imported with a failing mongoose. Same constraint as
// `otpFallback.test.ts`.

describe("a failed pre-send lookup must not look like 'no conversation'", () => {
  const SRC = readFileSync(join(__dirname, "adminFeedback.controller.ts"), "utf8");

  function sendReply(): string {
    const start = SRC.indexOf("export const sendReply");
    assert.ok(start > 0, "sendReply must exist");
    const end = SRC.indexOf("\n};", start);
    return SRC.slice(start, end);
  }

  it("tracks whether the lookup actually ran", () => {
    const fn = sendReply();
    assert.match(fn, /let lookedUp = false;/);
    assert.match(fn, /lookedUp = true;/, "must be set only after the read returns");
  });

  it("retries the lookup rather than assuming there is none", () => {
    const fn = sendReply();
    assert.match(
      fn,
      /lookedUp\s*\?\s*existing\s*:\s*await findFeedbackThread\(\)/,
      "an unanswered question must not become 'there is no conversation'"
    );
  });

  it("uses one query definition for both the pre-send read and the retry", () => {
    // Two copies of the filter is how the original bug happened. One
    // definition, used twice.
    //
    // The thing counted is the KEY expression, not the string `kind:
    // "feedback"` — that also appears in the `openThread` call, where it names
    // the kind of thread being created rather than filtering a query. A first
    // draft of this test conflated the two and failed on correct code.
    const fn = sendReply();
    assert.match(fn, /const findFeedbackThread = \(\) =>/);
    const uses = fn.match(/findFeedbackThread\(\)/g) || [];
    assert.ok(uses.length >= 2, `expected at least two uses, found ${uses.length}`);
    assert.equal(
      (fn.match(/subjectKey: feedbackThreadSubjectKey\(subject\)/g) || []).length,
      1,
      "the lookup filter must be written exactly once"
    );
  });
});
