// ─── The projection that lists a user's pages ────────────────────────────────
//
// `getMyCreations` gained an explicit projection because auto-draft made it the
// hottest authenticated endpoint we have — thirty-eight templates store photos
// as base64 inside the document, so listing page TITLES was pulling the user's
// whole photo library.
//
// ── WHY THIS IS WORTH A TEST ────────────────────────────────────────────────
//
// The whole change is silent in both directions. Drop a field the profile
// renders and it goes blank rather than erroring; let an exclusion in and every
// base64 photo field returns, undoing the fix with nothing to show for it.
// Neither crashes and neither logs.
//
// `passwordRaw` is the most fragile entry: it is `select: false` on all
// forty-four schemas, and the profile shows it back to its owner. Verified by
// experiment — with an inclusion projection, naming the field includes it
// whether or not the `+` prefix is there, so the prefix is belt-and-braces
// rather than load-bearing. What these tests actually catch is the field being
// REMOVED, and an exclusion slipping in; both were confirmed to fail this file
// before it was committed.
//
// Reading `query._fields` directly is not enough: before execution it literally
// contains the key `"+passwordRaw"`, which looks broken. Mongoose resolves the
// prefix in `_applyPaths()`, which is what `exec()` calls — so the test asks
// for the projection the same way the driver gets it.

import { test } from "node:test";
import assert from "node:assert/strict";

import HoliPage from "../models/HoliPage";
import { CREATION_FIELDS } from "./share.controller";

/** The projection as the driver will actually receive it. */
function resolvedProjection(): Record<string, unknown> {
  const q = HoliPage.find({}).select(CREATION_FIELDS).lean() as unknown as {
    _applyPaths: () => void;
    _fields: Record<string, unknown>;
  };
  q._applyPaths();
  return q._fields;
}

test("passwordRaw survives the projection despite select:false", () => {
  const proj = resolvedProjection();
  assert.equal(proj.passwordRaw, 1, "the profile shows this back to its owner");
  assert.ok(!("+passwordRaw" in proj), "the prefix must be resolved, not passed to the driver");
});

test("every field the profile row renders is included", () => {
  const proj = resolvedProjection();
  for (const field of [
    "_id",
    "shareId",
    "isPublished",   // the Draft / Live badge and the filter chips
    "recipientName",
    "senderName",
    "password",      // drives hasPassword
    "viewCount",
    "installCount",
    "createdAt",
    "updatedAt",     // the sort key, and the "last edited" line
    "reactions.answer",     // "Said YES 💛" / "Said no 💔" on question days
    "reactions.answeredAt",
  ]) {
    assert.equal(proj[field], 1, `${field} is rendered by the profile and must be projected`);
  }
});

test("it is an inclusion projection — nothing else comes back", () => {
  // The point of the change. An exclusion projection, or a stray 0, would let
  // the base64 photo fields through again and undo it silently.
  const values = Object.values(resolvedProjection());
  assert.ok(values.length > 0);
  assert.ok(
    values.every((v) => v === 1),
    "a single 0 turns this into an exclusion projection and every other field returns"
  );
});

test("the heavy content fields are NOT projected", () => {
  const proj = resolvedProjection();
  for (const heavy of ["senderPhoto", "senderMembers", "homeWishMessage", "congratsMessage"]) {
    assert.ok(!(heavy in proj), `${heavy} is page content and has no place in a list of titles`);
  }
});

test("answerOfRow: only a recorded yes/no travels with the row", async () => {
  const { answerOfRow } = await import("./share.controller");
  const at = new Date("2026-10-11T10:00:00Z");
  assert.deepEqual(answerOfRow({ reactions: { answer: "no", answeredAt: at } }), { answer: "no", answeredAt: at });
  assert.deepEqual(answerOfRow({ reactions: { answer: "yes", answeredAt: at } }), { answer: "yes", answeredAt: at });
  assert.deepEqual(answerOfRow({ reactions: { answer: null } }), {});
  assert.deepEqual(answerOfRow({ reactions: { answer: "maybe" } }), {});
  assert.deepEqual(answerOfRow({}), {});
});
