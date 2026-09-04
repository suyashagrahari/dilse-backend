import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SORT, parseSortOrder, sortDirection, sortSpec } from "./listSort";

describe("parseSortOrder", () => {
  it("reads the two orders", () => {
    assert.equal(parseSortOrder("newest"), "newest");
    assert.equal(parseSortOrder("oldest"), "oldest");
  });

  it("is tolerant about case and space, as a query string is", () => {
    assert.equal(parseSortOrder(" OLDEST "), "oldest");
    assert.equal(parseSortOrder("Oldest"), "oldest");
  });

  it("falls back to the default rather than erroring", () => {
    // A list that refuses to load because a dropdown carried something odd is
    // worse than one sorted the way it always was.
    for (const bad of ["", "asc", "createdAt", "-1", null, undefined, 42, {}, []]) {
      assert.equal(parseSortOrder(bad as never), DEFAULT_SORT);
    }
  });

  it("defaults to newest, which is what every list did before", () => {
    assert.equal(DEFAULT_SORT, "newest");
  });
});

describe("sortDirection", () => {
  it("maps newest to descending and oldest to ascending", () => {
    assert.equal(sortDirection("newest"), -1);
    assert.equal(sortDirection("oldest"), 1);
  });
});

describe("sortSpec", () => {
  it("sorts by the named field in the right direction", () => {
    assert.deepEqual(sortSpec("createdAt", "newest"), { createdAt: -1, _id: -1 });
    assert.deepEqual(sortSpec("lastMessageAt", "oldest"), { lastMessageAt: 1, _id: 1 });
  });

  it("breaks ties on _id, in the SAME direction", () => {
    // Rows sharing a timestamp would otherwise come back in an arbitrary order
    // per request, which shows up as one row on both page 1 and page 2 while
    // another is never seen. A tiebreak pointing the other way would order
    // those ties backwards within an otherwise correct page.
    const spec = sortSpec("createdAt", "oldest");
    assert.equal(spec.createdAt, spec._id);
  });
});
