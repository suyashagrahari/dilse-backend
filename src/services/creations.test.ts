import { test } from "node:test";
import assert from "node:assert/strict";
import { groupCreations, type CreationRow } from "./creations.service";
import { resolveRange } from "./revenueMath";

const NOW = new Date("2026-10-12T12:00:00+05:30");
const row = (id: string, userId: string, templateType: string, at: string, isPublished = true): CreationRow => ({
  _id: id, userId, templateType, label: templateType.toUpperCase(), slug: templateType, shareId: null, isPublished, createdAt: new Date(at),
});

test("groupCreations: totals, IST day buckets, per template, per person", () => {
  const r = resolveRange({ range: "7d" }, NOW);
  const rows = [
    row("1", "u1", "dandiya", "2026-10-12T00:10:00+05:30"),
    row("2", "u1", "dandiya", "2026-10-11T23:50:00+05:30", false),
    row("3", "u2", "diwali", "2026-10-11T10:00:00+05:30"),
    row("4", "u1", "diwali", "2026-10-06T00:00:00+05:30"),
  ];
  const g = groupCreations(rows, r);
  assert.deepEqual(g.totals, { pages: 4, creators: 2, published: 3 });
  assert.equal(g.daily.length, 7);
  assert.deepEqual(g.daily.find((d) => d.date === "2026-10-11"), { date: "2026-10-11", pages: 2, creators: 2 });
  assert.deepEqual(g.daily.find((d) => d.date === "2026-10-12"), { date: "2026-10-12", pages: 1, creators: 1 });
  assert.deepEqual(g.daily.find((d) => d.date === "2026-10-06"), { date: "2026-10-06", pages: 1, creators: 1 });
  assert.deepEqual(g.byTemplate.map((t) => [t.templateType, t.pages, t.creators, t.published]), [
    ["dandiya", 2, 1, 1],
    ["diwali", 2, 2, 2],
  ]);
  assert.equal(g.creators[0].userId, "u1");
  assert.equal(g.creators[0].pages, 3);
  assert.deepEqual(g.creators[0].templates.map((t) => [t.templateType, t.count]), [["dandiya", 2], ["diwali", 1]]);
  assert.equal(g.creators[1].userId, "u2");
});

test("groupCreations: an empty range is all zeros, every day present", () => {
  const g = groupCreations([], resolveRange({ range: "today" }, NOW));
  assert.deepEqual(g.totals, { pages: 0, creators: 0, published: 0 });
  assert.deepEqual(g.daily, [{ date: "2026-10-12", pages: 0, creators: 0 }]);
  assert.deepEqual(g.creators, []);
});
