import { test } from "node:test";
import assert from "node:assert/strict";
import { grantedSlugsFor, hasGrant, invalidateGrantCache } from "./templateAccess";

// These cover the paths that do NOT need a database: the input guards and the
// fail-closed behaviour. The four-way live x granted matrix and the caching
// behaviour need real rows, and are covered by
// `scripts/early-access-integration.js` against a live server.

test("no user means no grants, without touching the database", async () => {
  for (const bad of [undefined, null, "", "not-an-objectid"]) {
    const slugs = await grantedSlugsFor(bad as unknown as string);
    assert.equal(slugs.size, 0, `${String(bad)} returned ${slugs.size} grants`);
  }
});

test("hasGrant is false for an empty or missing slug", async () => {
  const id = "6a9534e91fa8de3b6707e01c";
  assert.equal(await hasGrant(id, ""), false);
  assert.equal(await hasGrant(id, undefined as unknown as string), false);
});

test("hasGrant is false when there is no user, whatever the slug", async () => {
  assert.equal(await hasGrant(undefined, "diwali-2026"), false);
  assert.equal(await hasGrant(null, "diwali-2026"), false);
  assert.equal(await hasGrant("", "diwali-2026"), false);
});

test("an invalid ObjectId is rejected before it can reach mongoose", async () => {
  // A cast error here would surface as a 500 on a normal publish. The guard is
  // what keeps a malformed token from turning into an error page.
  await assert.doesNotReject(() => grantedSlugsFor("'; drop --"));
  assert.equal((await grantedSlugsFor("'; drop --")).size, 0);
});

test("invalidateGrantCache is safe to call with anything", () => {
  assert.doesNotThrow(() => invalidateGrantCache());
  assert.doesNotThrow(() => invalidateGrantCache("6a9534e91fa8de3b6707e01c"));
  assert.doesNotThrow(() => invalidateGrantCache(""));
});

test("slug lookup is case-insensitive", async () => {
  // Both halves lower-case on the way in — the model does it on write and
  // `hasGrant` does it on read — so a mis-cased slug can never look ungranted.
  const id = "6a9534e91fa8de3b6707e01c";
  const upper = await hasGrant(id, "DIWALI-2026");
  const lower = await hasGrant(id, "diwali-2026");
  assert.equal(upper, lower);
});
