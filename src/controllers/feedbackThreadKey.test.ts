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

import { test } from "node:test";
import assert from "node:assert/strict";

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
