import { test } from "node:test";
import assert from "node:assert/strict";
import { reachableFrom } from "./templateVisibility";
import { defaultSeason, dropSlugs, isInDrop, type SeasonDrop, type SeasonMode, type SeasonView } from "./seasonSale";

// Reachability = live in the gallery OR in the active (Halloween) drop. These
// cover the pure rule; `isTemplateReachable` only adds the two cached reads.

const season = ({ mode = "halloween", ...drop }: Partial<SeasonDrop & { mode: SeasonMode }> = {}): SeasonView => {
  const d = defaultSeason();
  return { mode, drops: { ...d.drops, halloween: { ...d.drops.halloween, ...drop } } };
};

test("hidden + in the drop + halloween mode → reachable", () => {
  assert.equal(reachableFrom("happy-halloween", false, season()), true);
  assert.equal(reachableFrom("happy-halloween-premium", false, season()), true);
});

test("hidden + in the drop, but the mode is off or valentine → not reachable", () => {
  assert.equal(reachableFrom("happy-halloween", false, season({ mode: "off" })), false);
  assert.equal(reachableFrom("happy-halloween", false, season({ mode: "valentine" })), false);
});

test("hidden + not in the drop → not reachable", () => {
  assert.equal(reachableFrom("happy-rose-day", false, season()), false);
});

test("live → reachable whatever the season", () => {
  for (const s of [season(), season({ mode: "off" }), season({ mode: "valentine" }), null]) {
    assert.equal(reachableFrom("happy-birthday", true, s), true);
  }
});

test("the sale switch only controls the discount, not drop membership", () => {
  assert.equal(reachableFrom("happy-halloween", false, season({ saleEnabled: false })), true);
});

test("no season answer and an empty slug are never reachable through the drop", () => {
  assert.equal(reachableFrom("happy-halloween", false, null), false);
  assert.equal(reachableFrom("", true, season()), false);
});

test("drop lookups are case-insensitive and trimmed", () => {
  assert.equal(isInDrop("  HAPPY-HALLOWEEN ", season()), true);
  assert.deepEqual(dropSlugs(season({ saleSlugs: ["Happy-Halloween"] })), ["happy-halloween"]);
  assert.deepEqual(dropSlugs(season({ mode: "off" })), []);
});
